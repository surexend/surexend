import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ReferralsService } from '../referrals/referrals.service';
import * as crypto from 'crypto';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private prisma: PrismaService,
    private transactionsService: TransactionsService,
    private notificationsService: NotificationsService,
    private referralsService: ReferralsService,
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
          'USDT',
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

          const symbol = (transaction.tokenSymbol || 'USDT').toUpperCase();

          await this.prisma.$transaction(async (prisma) => {
            if (symbol === 'USDC') {
              await prisma.wallet.update({
                where: { id: wallet.id },
                data: { usdcBalance: { increment: amount } }
              });
            } else {
              await prisma.wallet.update({
                where: { id: wallet.id },
                data: { usdtBalance: { increment: amount } }
              });
            }

            await this.transactionsService.createTransaction(prisma, {
              userId: wallet.userId,
              type: 'RECEIVE',
              status: 'COMPLETED',
              amount,
              fee: 0,
              currency: symbol,
              reference,
              metadata: { txId, blockchain }
            });
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
          // Refund locked balance back to active balance. Initiation debits
          // usdcBalance and locks amount + network fee, so restore exactly that.
          const totalLocked = (matchingTx.amount || 0) + (matchingTx.fee || 0);
          const errorReason = transaction.errorMessage
            || transaction.reason
            || transaction.errorCode
            || 'Transfer failed on Circle.';
          await this.prisma.$transaction(async (prisma) => {
            await prisma.wallet.update({
              where: { userId: matchingTx.userId },
              data: { 
                usdcBalance: { increment: totalLocked },
                lockedBalance: { decrement: totalLocked }
              }
            });

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
}
