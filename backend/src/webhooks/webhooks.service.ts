import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ReferralsService } from '../referrals/referrals.service';
import { LedgerService } from '../common/ledger.service';
import { toMinor } from '../common/money';
import * as crypto from 'crypto';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private prisma: PrismaService,
    private transactionsService: TransactionsService,
    private notificationsService: NotificationsService,
    private referralsService: ReferralsService,
    private ledger: LedgerService,
  ) {}

  async processFlutterwave(payload: any) {
    // Bank-transfer deposits to a user's virtual account arrive as
    // charge.completed with a transfer/account payment type.
    if (payload.event === 'charge.completed') {
      const data = payload.data || {};
      const paymentType = String(data.payment_type || data?.meta?.payment_type || '').toLowerCase();
      if (paymentType.includes('transfer') || paymentType.includes('account')) {
        await this.processBankTransferDeposit(data);
      }
      return;
    }

    if (payload.event === 'transfer.completed') {
      const reference = payload.data.reference;
      
      const transaction = await this.prisma.transaction.findUnique({ where: { reference } });
      if (!transaction) return;

      if (transaction.type === 'CONVERT') {
        const conversionId = transaction.metadata['conversionId'];
        
        await this.prisma.$transaction(async (prisma) => {
          await prisma.conversion.update({
            where: { id: conversionId },
            data: { status: 'COMPLETED' }
          });
          
          await prisma.transaction.update({
            where: { id: transaction.id },
            data: { status: 'COMPLETED' }
          });
        });

        // Check if referral earning applies
        const user = await this.prisma.user.findUnique({ where: { id: transaction.userId } });
        if (user && user.referredById) {
          await this.referralsService.processReferralEarning(user.referredById, transaction.fee);
        }

        await this.notificationsService.createNotification(transaction.userId, {
          title: 'Withdrawal Completed',
          body: `Your conversion & withdrawal of ${transaction.amount} ${transaction.currency} was completed successfully.`,
          type: 'WITHDRAWAL',
          data: { amount: transaction.amount, currency: transaction.currency, reference }
        });

        await this.notificationsService.sendTransactionEmail(
          user.email,
          transaction.amount,
          'USDC',
          reference,
          'Conversion & Withdrawal'
        );
      }
    }
  }

  // Credits a user's local-currency wallet when money lands on their dedicated
  // Flutterwave virtual account. Deduplicated by the Flutterwave payment id so
  // a retried webhook can never double-credit.
  async processBankTransferDeposit(data: any) {
    const flwId = data.id || data.flw_ref || data.tx_ref;
    if (!flwId) return;

    const reference = `DEP-FLW-${flwId}`;
    const existing = await this.prisma.transaction.findUnique({ where: { reference } });
    if (existing) {
      this.logger.log(`Bank deposit ${reference} already processed.`);
      return;
    }

    // Match the user via the virtual account reference (tx_ref / product_id
    // are both our reference on Flutterwave's side).
    const candidates = [data.tx_ref, data.meta?.product_id, data.meta?.productId, data.flw_ref]
      .filter(Boolean)
      .map((r) => String(r));
    const virtualAccount = await this.prisma.virtualAccount.findFirst({
      where: { isActive: true, OR: candidates.map((r) => ({ reference: r })) },
    });
    if (!virtualAccount) {
      this.logger.warn(`Bank transfer deposit for unknown virtual account: ${flwId}`);
      return;
    }

    const amount = parseFloat(data.amount);
    if (!amount || amount <= 0) return;
    const currency = (data.currency || 'NGN').toUpperCase();

    await this.prisma.$transaction(async (prisma) => {
      // Credit the per-currency local balance (defensive against a missing
      // localBalances column, mirroring the conversions service).
      let localBalances: Record<string, number> = {};
      try {
        const wallet = await prisma.wallet.findUnique({
          where: { userId: virtualAccount.userId },
          select: { localBalances: true, localBalance: true },
        });
        const parsed = wallet?.localBalances as any;
        if (parsed && typeof parsed === 'object') localBalances = { ...parsed };
        if ((wallet?.localBalance || 0) > 0 && !localBalances['NGN']) localBalances['NGN'] = wallet.localBalance;
      } catch { /* ignore */ }

      localBalances[currency] = (localBalances[currency] || 0) + amount;

      // Bank transfers are REAL money — also credit the real-money pool so the
      // balance can pay bills / withdraw (and can never be swapped to crypto).
      const realIncrement = currency === 'NGN' ? { realLocalBalance: { increment: amount } } : {};

      try {
        await prisma.wallet.update({
          where: { userId: virtualAccount.userId },
          data: { localBalances, ...realIncrement },
        });
      } catch {
        await prisma.wallet.update({
          where: { userId: virtualAccount.userId },
          data: { localBalance: localBalances['NGN'] || 0, ...realIncrement },
        });
      }

      await this.transactionsService.createTransaction(prisma, {
        userId: virtualAccount.userId,
        type: 'RECEIVE',
        status: 'COMPLETED',
        amount,
        fee: 0,
        currency,
        reference,
        metadata: { channel: 'bank_transfer', provider: 'FLUTTERWAVE', flwId, bankName: virtualAccount.bankName },
      });

      await this.ledger.record([
        { transferId: reference, account: this.ledger.externalAccount('FLUTTERWAVE', currency), currency, amountMinor: -toMinor(amount, currency), reference, kind: 'BANK_TRANSFER_SOURCE' },
        { transferId: reference, account: this.ledger.userAccount(virtualAccount.userId, currency), currency, amountMinor: toMinor(amount, currency), reference, kind: 'BANK_TRANSFER_DEPOSIT' },
      ], prisma);
    });

    await this.notificationsService.createNotification(virtualAccount.userId, {
      title: 'Local Deposit Received',
      body: `${amount.toLocaleString()} ${currency} credited to your wallet. Reference: ${reference}`,
      type: 'DEPOSIT',
      data: { reference, amount, currency, channel: 'bank_transfer' },
    });
  }

  async processVtpass(payload: any) {
    const reference = payload.request_id;
    const transaction = await this.prisma.transaction.findUnique({ where: { reference } });
    if (!transaction) return;

    if (payload.code === '000') {
      await this.prisma.transaction.update({
        where: { id: transaction.id },
        data: { status: 'COMPLETED' }
      });
      // Further updates to BillPayment model...
    }
  }

  async processCircle(payload: any) {
    this.logger.log(`Processing Circle Webhook: ${JSON.stringify(payload)}`);
    
    const eventType = payload.notificationType;
    if (eventType === 'transactions.inbound' || eventType === 'transactions.outbound') {
      const transaction = payload.notification;
      if (!transaction) return;

      const txStatus = transaction.state; // e.g. "CONFIRMED", "COMPLETED", "FAILED"
      const refId = transaction.refId; // reference ID we passed

      // Handle inbound transaction (Deposit)
      if (eventType === 'transactions.inbound') {
        if (txStatus === 'CONFIRMED' || txStatus === 'COMPLETED') {
          const blockchain = transaction.blockchain;
          const txId = transaction.txHash || transaction.id;
          const amount = parseFloat(transaction.amount);
          const destinationAddress = transaction.destinationAddress;
          
          if (!destinationAddress) return;

          // Find the database record for this address
          const walletAddress = await this.prisma.walletAddress.findFirst({
            where: { 
              address: { equals: destinationAddress, mode: 'insensitive' }
            },
            include: { wallet: { include: { user: true } } }
          });

          if (!walletAddress) {
            this.logger.warn(`Wallet address ${destinationAddress} not found in database.`);
            return;
          }

          const wallet = walletAddress.wallet;

          // Check if this deposit has already been processed (deduplication)
          const reference = `RECV-${txId}`;
          const existingTx = await this.prisma.transaction.findUnique({
            where: { reference }
          });
          if (existingTx) {
            this.logger.log(`Deposit transaction ${reference} already processed.`);
            return;
          }

          // Book each supported stablecoin in its actual denomination. In
          // particular, campaign rewards are USDT and must never be relabelled
          // as USDC — doing so breaks the promised asset and the audit trail.
          const rawSymbol = (transaction.tokenSymbol || 'USDC').toUpperCase();
          const supportedStablecoins = new Set(['USDC', 'USDT']);
          if (!supportedStablecoins.has(rawSymbol)) {
            this.logger.warn(`Circle inbound ${txId} carries unsupported token symbol '${rawSymbol}'; skipping.`);
            return;
          }
          const symbol = rawSymbol;

          await this.prisma.$transaction(async (prisma) => {
            await prisma.wallet.update({
              where: { id: wallet.id },
              data: symbol === 'USDT' ? { usdtBalance: { increment: amount } } : { usdcBalance: { increment: amount } }
            });

            await this.transactionsService.createTransaction(prisma, {
              userId: wallet.userId,
              type: 'RECEIVE',
              status: 'COMPLETED',
              amount,
              fee: 0,
              currency: symbol,
              reference,
              metadata: { txId, blockchain, ...(rawSymbol !== 'USDC' ? { originalSymbol: rawSymbol } : {}) }
            });

            await this.ledger.record([
              { transferId: reference, account: this.ledger.externalAccount(`circle:${blockchain || walletAddress.network}`, symbol), currency: symbol, amountMinor: -toMinor(amount, symbol), reference, kind: 'DEPOSIT_SOURCE' },
              { transferId: reference, account: this.ledger.userAccount(wallet.userId, symbol), currency: symbol, amountMinor: toMinor(amount, symbol), reference, kind: 'DEPOSIT' },
            ], prisma);
          });

          await this.notificationsService.sendPushNotification(wallet.userId, {
            title: 'Deposit Confirmed',
            body: `You have successfully received ${amount} ${symbol} on ${walletAddress.network}`,
            data: {}
          });

          await this.notificationsService.createNotification(wallet.userId, {
            title: 'Deposit Received',
            body: `Successfully received +${amount} ${symbol} on ${walletAddress.network}.`,
            type: 'DEPOSIT',
            data: { amount, currency: symbol, network: walletAddress.network, txId }
          });

          await this.notificationsService.sendTransactionEmail(
            wallet.user.email,
            amount,
            symbol,
            reference,
            'Cryptocurrency Deposit'
          );
        }
      }

      // Handle outbound transaction (Withdrawal / Send)
      if (eventType === 'transactions.outbound' && refId) {
        const matchingTx = await this.prisma.transaction.findUnique({
          where: { reference: refId }
        });

        if (!matchingTx) return;

        // Settle only once: the send may already have been settled (PENDING ->
        // COMPLETED/FAILED) by the Circle history sync (which is the actual
        // completion path for our sends, since they carry no refId). Guard on
        // status so a later webhook can't double-release / double-refund.
        if (matchingTx.status !== 'PENDING') return;

        if (txStatus === 'COMPLETED') {
          // Release locked balance, mark completed. The send initiation locks
          // amount + network fee together, so both must be released here or the
          // fee stays frozen in lockedBalance and spendable is permanently short.
          const totalLocked = (matchingTx.amount || 0) + (matchingTx.fee || 0);
          await this.prisma.$transaction(async (prisma) => {
            await prisma.wallet.update({
              where: { userId: matchingTx.userId },
              data: { lockedBalance: { decrement: totalLocked } }
            });

            await prisma.transaction.update({
              where: { id: matchingTx.id },
              data: { status: 'COMPLETED' }
            });
          });

          const user = await this.prisma.user.findUnique({ where: { id: matchingTx.userId } });
          if (user) {
            await this.notificationsService.sendPushNotification(user.id, {
              title: 'Send Completed',
              body: `Your transfer of ${matchingTx.amount} ${matchingTx.currency} was completed successfully.`,
              data: {}
            });

            await this.notificationsService.createNotification(user.id, {
              title: 'Transfer Completed',
              body: `Your transfer of ${matchingTx.amount} ${matchingTx.currency} was completed successfully.`,
              type: 'SEND',
              data: { amount: matchingTx.amount, currency: matchingTx.currency, reference: refId }
            });

            await this.notificationsService.sendTransactionEmail(
              user.email,
              matchingTx.amount,
              matchingTx.currency,
              refId,
              'Cryptocurrency Withdrawal'
            );
          }
        } else if (txStatus === 'FAILED') {
          // Refund locked balance back to active balance. Initiation may have
          // debited USDT + USDC (legacy USDT drain), so restore EACH bucket
          // exactly as it was taken; rows without a reserveSplit were 100%
          // USDC and are refunded as before.
          const totalLocked = (matchingTx.amount || 0) + (matchingTx.fee || 0);
          const reserveSplit = (matchingTx.metadata as any)?.reserveSplit;
          const refundUsdt = reserveSplit
            ? Math.min(Math.max(0, Number(reserveSplit.usdt) || 0), totalLocked)
            : 0;
          const errorReason = transaction.errorMessage
            || transaction.reason
            || transaction.errorCode
            || 'Transfer failed on Circle.';
          await this.prisma.$transaction(async (prisma) => {
            await prisma.wallet.update({
              where: { userId: matchingTx.userId },
              data: {
                usdcBalance: { increment: totalLocked - refundUsdt },
                usdtBalance: { increment: refundUsdt },
                lockedBalance: { decrement: totalLocked }
              }
            });

            await this.ledger.reverse(matchingTx.reference, prisma);

            await prisma.transaction.update({
              where: { id: matchingTx.id },
              data: {
                status: 'FAILED',
                metadata: {
                  ...((matchingTx.metadata as Record<string, any>) || {}),
                  errorReason,
                  failedAt: 'circle-webhook'
                }
              }
            });
          });

          const user = await this.prisma.user.findUnique({ where: { id: matchingTx.userId } });
          if (user) {
            await this.notificationsService.sendPushNotification(user.id, {
              title: 'Transfer Failed',
              body: `Your transfer of ${matchingTx.amount} ${matchingTx.currency} failed: ${errorReason}`,
              data: {}
            });

            await this.notificationsService.createNotification(user.id, {
              title: 'Transfer Failed',
              body: `Your transfer of ${matchingTx.amount} ${matchingTx.currency} failed: ${errorReason}`,
              type: 'SEND',
              data: { amount: matchingTx.amount, currency: matchingTx.currency, reference: matchingTx.reference, errorReason }
            });
          }
        }
      }
    }
  }

  async processPaymentPoint(payload: any, signature: string) {
    // Get webhook secret, fallback to secretKey if not separately configured
    const webhookSecret = this.configService.get('app.paymentpoint.webhookSecret') ||
                         this.configService.get('app.paymentpoint.secretKey');
    
    if (!webhookSecret) {
      this.logger.error('PaymentPoint webhook secret not configured; accepting webhook');
      // If no secret is configured, accept the webhook (less secure but works with limited config)
    } else {
      // Verify the webhook signature using HMAC-SHA256
      const calculatedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(JSON.stringify(payload), 'utf-8')
        .digest('hex');

      if (calculatedSignature !== signature) {
        this.logger.error('Invalid PaymentPoint webhook signature');
        throw new BadRequestException('Invalid webhook signature');
      }
    }

    const data = payload.data || {};

    // Handle payment successful webhook
    if (payload.notification_status === 'payment_successful' || payload.transaction_status === 'success') {
      const transactionId = data.transaction_id || payload.transaction_id;
      const amountPaid = parseFloat(data.amount_paid || 0);

      if (!transactionId || amountPaid <= 0) {
        this.logger.log(`PaymentPoint webhook: missing transaction data`);
        return;
      }

      // Check if this transaction has already been processed
      const existingTransaction = await this.prisma.transaction.findUnique({
        where: { reference: `PAYPT-${transactionId}` },
      });

      if (existingTransaction) {
        this.logger.log(`PaymentPoint transaction ${transactionId} already processed`);
        return;
      }

      // Find the user via the customer_id or receiver account number
      const customerId = data.customer?.customer_id || data.receiver?.account_number;
      const virtualAccount = await this.prisma.virtualAccount.findFirst({
        where: { isActive: true, OR: [
          { reference: `PAYPT-${transactionId}` },
          { customerId: customerId }
        ]},
      });

      if (!virtualAccount) {
        this.logger.warn(`PaymentPoint webhook: unknown virtual account for transaction ${transactionId}`);
        return;
      }

      await this.prisma.$transaction(async (prisma) => {
        // Credit the per-currency local balance (defensive against a missing
        // localBalances column, mirroring the conversions service).
        let localBalances: Record<string, number> = {};
        try {
          const wallet = await prisma.wallet.findUnique({
            where: { userId: virtualAccount.userId },
            select: { localBalances: true, localBalance: true },
          });
          const parsed = wallet?.localBalances as any;
          if (parsed && typeof parsed === 'object') localBalances = { ...parsed };
          if ((wallet?.localBalance || 0) > 0 && !localBalances['NGN']) localBalances['NGN'] = wallet.localBalance;
        } catch { /* ignore */ }

        localBalances['NGN'] = (localBalances['NGN'] || 0) + amountPaid;

        // Credit the real-money pool so the balance can pay bills / withdraw
        const realIncrement = { realLocalBalance: { increment: amountPaid } };

        try {
          await prisma.wallet.update({
            where: { userId: virtualAccount.userId },
            data: { localBalances, ...realIncrement },
          });
        } catch {
          await prisma.wallet.update({
            where: { userId: virtualAccount.userId },
            data: { localBalance: localBalances['NGN'] || 0, ...realIncrement },
          });
        }

        await this.transactionsService.createTransaction(prisma, {
          userId: virtualAccount.userId,
          type: 'RECEIVE',
          status: 'COMPLETED',
          amount: amountPaid,
          fee: parseFloat(data.settlement_fee || 0),
          currency: 'NGN',
          reference: `PAYPT-${transactionId}`,
          metadata: {
            channel: 'bank_transfer',
            provider: 'PAYMENTPOINT',
            transactionId,
            settlementAmount: parseFloat(data.settlement_amount || 0),
            settlementFee: parseFloat(data.settlement_fee || 0),
            senderName: data.sender?.name,
            senderAccount: data.sender?.account_number,
            receiverName: data.receiver?.name,
            receiverAccount: data.receiver?.account_number,
            receiverBank: data.receiver?.bank,
            customerName: data.customer?.name,
            customerEmail: data.customer?.email,
            description: data.description,
            timestamp: data.timestamp,
          },
        });

        await this.ledger.record([
          { transferId: `PAYPT-${transactionId}`, account: this.ledger.externalAccount('PAYMENTPOINT', 'NGN'), currency: 'NGN', amountMinor: -toMinor(amountPaid, 'NGN'), reference: `PAYPT-${transactionId}`, kind: 'BANK_TRANSFER_SOURCE' },
          { transferId: `PAYPT-${transactionId}`, account: this.ledger.userAccount(virtualAccount.userId, 'NGN'), currency: 'NGN', amountMinor: toMinor(amountPaid, 'NGN'), reference: `PAYPT-${transactionId}`, kind: 'BANK_TRANSFER_DEPOSIT' },
        ], prisma);
      });

      await this.notificationsService.createNotification(virtualAccount.userId, {
        title: 'Payment Received',
        body: `${amountPaid.toLocaleString()} NGN credited to your wallet. Reference: ${transactionId}`,
        type: 'DEPOSIT',
        data: { reference: transactionId, amount: amountPaid, currency: 'NGN', channel: 'paymentpoint' },
      });

      await this.notificationsService.sendTransactionEmail(
        (await this.prisma.user.findUnique({ where: { id: virtualAccount.userId } })).email,
        amountPaid,
        'NGN',
        transactionId,
        'Payment Received'
      );
    }
  }
}
