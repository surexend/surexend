import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
    private configService: ConfigService,
  ) {}

  async processPaymentPoint(payload: any, signature?: string) {
    this.logger.log('PaymentPoint webhook received');
    const data = payload?.data || payload;

    const transactionId =
      data.transaction_id ||
      data.transactionId ||
      data.reference ||
      data.paymentReference ||
      data.id ||
      payload.transaction_id ||
      payload.reference;

    if (!transactionId) {
      this.logger.warn('PaymentPoint webhook missing transaction identifier');
      return;
    }

    const reference = `DEP-PP-${transactionId}`;
    const existing = await this.prisma.transaction.findUnique({ where: { reference } });
    if (existing) {
      this.logger.log(`PaymentPoint deposit ${reference} already processed.`);
      return;
    }

    const accountNumber = String(
      data.account_number ||
      data.accountNumber ||
      data.virtual_account_number ||
      data.virtualAccountNumber ||
      payload.account_number ||
      payload.accountNumber ||
      ''
    );

    const receiverAccount = data.receiver?.account_number || data.receiverAccount;
    const customerId = data.customer?.customer_id || data.customerId;
    const email = (data.email || data.customer_email || data.customer?.email || payload.email || '').toLowerCase();

    const lookups: any[] = [];
    if (accountNumber) lookups.push({ accountNumber });
    if (receiverAccount && receiverAccount !== accountNumber) lookups.push({ accountNumber: receiverAccount });
    if (customerId) lookups.push({ reference: `PAYPT-${customerId}` });
    if (email) lookups.push({ user: { email } });

    const virtualAccount = await this.prisma.virtualAccount.findFirst({
      where: {
        isActive: true,
        ...(lookups.length > 0 ? { OR: lookups } : {}),
      },
      include: { user: true },
    });

    if (!virtualAccount) {
      this.logger.warn(`PaymentPoint deposit for unknown account number (${accountNumber}) or email (${email})`);
      return;
    }

    const providerStatus = String(data.status || data.Status || data.payment_status || data.paymentStatus || '').toLowerCase();
    if (!providerStatus || !['success', 'successful', 'completed', 'settled', 'paid'].includes(providerStatus)) {
      this.logger.warn(`PaymentPoint webhook ${transactionId} is not a confirmed successful settlement (status=${providerStatus || 'missing'}); ignoring.`);
      return;
    }

    const rawAmount = data.amount || data.amount_paid || data.settled_amount || payload.amount;
    const amount = parseFloat(String(rawAmount));
    if (!Number.isFinite(amount) || amount <= 0) {
      this.logger.warn(`PaymentPoint deposit with invalid amount: ${rawAmount}`);
      return;
    }

    const currency = String(data.currency || payload.currency || 'NGN').toUpperCase();
    if (currency !== 'NGN') {
      this.logger.warn(`PaymentPoint deposit ${transactionId} has unsupported currency ${currency}; ignoring.`);
      return;
    }
    const bankName = data.bank_name || data.bankName || virtualAccount.bankName || 'PalmPay';
    const senderName = data.sender_name || data.senderName || data.payer_name || 'Bank Transfer';

    await this.prisma.$transaction(async (prisma) => {
      const wallet = await prisma.wallet.findUnique({
        where: { userId: virtualAccount.userId },
        select: { localBalances: true, localBalance: true },
      });
      if (!wallet) throw new Error(`Wallet missing for PaymentPoint account ${virtualAccount.userId}`);
      const parsed = wallet.localBalances as any;
      const localBalances: Record<string, number> = parsed && typeof parsed === 'object' ? { ...parsed } : {};
      if ((wallet.localBalance || 0) > 0 && !localBalances.NGN) localBalances.NGN = wallet.localBalance;
      localBalances[currency] = (localBalances[currency] || 0) + amount;

      // The production baseline includes localBalances. One wallet write inside
      // this transaction avoids double-crediting after an ambiguous DB error.
      await prisma.wallet.update({
        where: { userId: virtualAccount.userId },
        data: { localBalances, realLocalBalance: { increment: amount } },
      });

      await this.transactionsService.createTransaction(prisma, {
        userId: virtualAccount.userId,
        type: 'RECEIVE',
        status: 'COMPLETED',
        amount,
        fee: 0,
        currency,
        reference,
        metadata: {
          channel: 'bank_transfer',
          provider: 'PAYMENTPOINT',
          transactionId,
          bankName,
          senderName,
          accountNumber: virtualAccount.accountNumber,
          settledAt: new Date().toISOString(),
        },
      });

      await this.ledger.record([
        { transferId: reference, account: this.ledger.externalAccount('PAYMENTPOINT', currency), currency, amountMinor: -toMinor(amount, currency), reference, kind: 'BANK_TRANSFER_SOURCE' },
        { transferId: reference, account: this.ledger.userAccount(virtualAccount.userId, currency), currency, amountMinor: toMinor(amount, currency), reference, kind: 'BANK_TRANSFER_DEPOSIT' },
      ], prisma);
    });

    await this.notificationsService.createNotification(virtualAccount.userId, {
      title: 'NGN Deposit Received',
      body: `Your bank transfer deposit of ₦${amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} has been credited to your NGN wallet.`,
      type: 'RECEIVE',
      data: { amount, currency: 'NGN', reference, channel: 'bank_transfer' },
    });

    if (virtualAccount.user?.email) {
      await this.notificationsService.sendTransactionEmail(
        virtualAccount.user.email,
        amount,
        'NGN',
        reference,
        'Bank Transfer Deposit'
      ).catch(() => {});
    }

    this.logger.log(`Successfully credited ${amount} NGN to user ${virtualAccount.userId} via PaymentPoint (${reference})`);
  }

  async processFlutterwave(payload: any) {
    // Bank-transfer deposits to a user's virtual account arrive as
    // charge.completed with a transfer/account payment type.
    if (payload.event === 'charge.completed') {
      const data = payload.data || {};
      const status = String(data.status || data.payment_status || '').toLowerCase();
      if (!['successful', 'success', 'completed', 'settled'].includes(status)) {
        this.logger.warn(`Ignoring Flutterwave charge.completed without a successful status: ${status || 'missing'}`);
        return;
      }
      const paymentType = String(data.payment_type || data?.meta?.payment_type || '').toLowerCase();
      const currency = String(data.currency || '').toUpperCase();
      if ((paymentType.includes('transfer') || paymentType.includes('account')) && currency === 'NGN') {
        await this.processBankTransferDeposit(data);
      }
      return;
    }

    if (payload.event === 'transfer.completed') {
      const reference = payload.data.reference;
      
      const transaction = await this.prisma.transaction.findUnique({ where: { reference } });
      if (!transaction) return;

      if (transaction.type === 'CONVERT') {
        const conversionId = (transaction.metadata as any)?.conversionId;
        if (!conversionId) {
          this.logger.error(`Flutterwave settlement ${reference} is missing conversionId; refusing to mutate it.`);
          return;
        }

        // Claim the settlement exactly once. Duplicate provider webhooks still
        // run the idempotent referral check below so a process crash between
        // settlement and commission creation can recover without double-credit.
        let newlySettled = false;
        await this.prisma.$transaction(async (prisma) => {
          const claimed = await prisma.transaction.updateMany({
            where: { id: transaction.id, status: 'PENDING' },
            data: { status: 'COMPLETED' },
          });
          if (claimed.count !== 1 && transaction.status !== 'COMPLETED') return;
          newlySettled = claimed.count === 1;
          await prisma.conversion.update({
            where: { id: conversionId },
            data: { status: 'COMPLETED' },
          });
        });

        const settledTransaction = await this.prisma.transaction.findUnique({ where: { reference } });
        if (!settledTransaction || settledTransaction.status !== 'COMPLETED') return;

        const user = await this.prisma.user.findUnique({ where: { id: transaction.userId } });
        if (user?.referredById) {
          await this.referralsService.processReferralEarning(user.referredById, transaction.fee, reference);
        }

        if (newlySettled) {
          await this.notificationsService.createNotification(transaction.userId, {
            title: 'Withdrawal Completed',
            body: `Your conversion & withdrawal of ${transaction.amount} ${transaction.currency} was completed successfully.`,
            type: 'WITHDRAWAL',
            data: { amount: transaction.amount, currency: transaction.currency, reference }
          });

          if (user) {
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
      const wallet = await prisma.wallet.findUnique({
        where: { userId: virtualAccount.userId },
        select: { localBalances: true, localBalance: true },
      });
      if (!wallet) throw new Error(`Wallet missing for Flutterwave account ${virtualAccount.userId}`);
      const parsed = wallet.localBalances as any;
      const localBalances: Record<string, number> = parsed && typeof parsed === 'object' ? { ...parsed } : {};
      if ((wallet.localBalance || 0) > 0 && !localBalances.NGN) localBalances.NGN = wallet.localBalance;
      localBalances[currency] = (localBalances[currency] || 0) + amount;

      // Bank transfers are REAL money — also credit the real-money pool so the
      // balance can pay bills / withdraw (and can never be swapped to crypto).
      await prisma.wallet.update({
        where: { userId: virtualAccount.userId },
        data: { localBalances, realLocalBalance: { increment: amount } },
      });

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
    this.logger.log(`Processing Circle webhook notification: ${String(payload?.notificationType || 'unknown')}`);
    
    const eventType = payload.notificationType;
    if (eventType === 'transactions.inbound' || eventType === 'transactions.outbound') {
      const transaction = payload.notification;
      if (!transaction) return;

      // Circle documents terminal transfer state as `complete` (some older
      // payloads use `completed`). Normalize only the known terminal spellings;
      // pending/running/unknown states must never move the ledger.
      const txStatus = String(transaction.state || '').toUpperCase(); // e.g. "CONFIRMED", "COMPLETE", "COMPLETED", "FAILED"
      const refId = transaction.refId; // reference ID we passed

      // Handle inbound transaction (Deposit)
      if (eventType === 'transactions.inbound') {
        if (txStatus === 'CONFIRMED' || txStatus === 'COMPLETE' || txStatus === 'COMPLETED') {
          const blockchain = transaction.blockchain;
          const txId = transaction.txHash || transaction.id;
          const amount = parseFloat(transaction.amount);
          const destinationAddress = transaction.destinationAddress;

          if (!Number.isFinite(amount) || amount <= 0) {
            this.logger.warn(`Circle inbound ${txId || 'unknown'} has an invalid amount; ignoring.`);
            return;
          }
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

        if (txStatus === 'COMPLETE' || txStatus === 'COMPLETED') {
          // Release locked balance, mark completed. The send initiation locks
          // amount + network fee together, so both must be released here or the
          // fee stays frozen in lockedBalance and spendable is permanently short.
          const totalLocked = (matchingTx.amount || 0) + (matchingTx.fee || 0);
          let settled = false;
          await this.prisma.$transaction(async (prisma) => {
            // Claim the pending row before changing lockedBalance. Duplicate
            // webhooks can arrive concurrently; an unconditional update after
            // a pre-read would release the same reservation twice.
            const claimed = await prisma.transaction.updateMany({
              where: { id: matchingTx.id, status: 'PENDING' },
              data: { status: 'COMPLETED' },
            });
            if (claimed.count !== 1) return;

            await prisma.wallet.update({
              where: { userId: matchingTx.userId },
              data: { lockedBalance: { decrement: totalLocked } }
            });
            settled = true;
          });
          if (!settled) return;

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
          let settled = false;
          await this.prisma.$transaction(async (prisma) => {
            // Claim before refunding. If history sync or a duplicate webhook
            // already settled this send, count=0 prevents a second wallet or
            // ledger mutation. Any later error rolls the claim back.
            const claimed = await prisma.transaction.updateMany({
              where: { id: matchingTx.id, status: 'PENDING' },
              data: {
                status: 'FAILED',
                metadata: {
                  ...((matchingTx.metadata as Record<string, any>) || {}),
                  errorReason,
                  failedAt: 'circle-webhook'
                }
              }
            });
            if (claimed.count !== 1) return;

            await prisma.wallet.update({
              where: { userId: matchingTx.userId },
              data: {
                usdcBalance: { increment: totalLocked - refundUsdt },
                usdtBalance: { increment: refundUsdt },
                lockedBalance: { decrement: totalLocked }
              }
            });

            await this.ledger.reverse(matchingTx.reference, prisma);
            settled = true;
          });
          if (!settled) return;

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
}
