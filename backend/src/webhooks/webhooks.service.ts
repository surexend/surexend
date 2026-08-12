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

        if (txStatus === 'COMPLETED') {
          // Release locked balance, mark completed
          await this.prisma.$transaction(async (prisma) => {
            await prisma.wallet.update({
              where: { userId: matchingTx.userId },
              data: { lockedBalance: { decrement: matchingTx.amount } }
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

            await this.notificationsService.sendTransactionEmail(
              user.email,
              matchingTx.amount,
              matchingTx.currency,
              refId,
              'Cryptocurrency Withdrawal'
            );
          }
        } else if (txStatus === 'FAILED') {
          // Refund locked balance back to active balance
          const errorReason = transaction.errorMessage
            || transaction.reason
            || transaction.errorCode
            || 'Transfer failed on Circle.';
          await this.prisma.$transaction(async (prisma) => {
            await prisma.wallet.update({
              where: { userId: matchingTx.userId },
              data: { 
                usdtBalance: { increment: matchingTx.amount },
                lockedBalance: { decrement: matchingTx.amount }
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
          }
        }
      }
    }
  }
}
