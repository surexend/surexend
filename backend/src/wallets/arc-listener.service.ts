import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import axios from 'axios';

@Injectable()
export class ArcListenerService implements OnModuleInit {
  private readonly logger = new Logger(ArcListenerService.name);
  private rpcUrl: string;
  private usdcContract: string;
  private lastScannedBlock: number = 0;
  private isScanning: boolean = false;

  constructor(
    private prisma: PrismaService,
    private transactionsService: TransactionsService,
    private notificationsService: NotificationsService,
    private configService: ConfigService
  ) {
    this.rpcUrl = this.configService.get<string>('app.arc.rpcUrl') || 'https://rpc.testnet.arc.network';
    this.usdcContract = this.configService.get<string>('app.arc.usdcContractAddress') || '0x3600000000000000000000000000000000000000';
  }

  async onModuleInit() {
    try {
      // Get current block to start scanning from latest
      const response = await axios.post(this.rpcUrl, {
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_blockNumber',
        params: []
      });
      const hexBlock = response.data.result;
      this.lastScannedBlock = parseInt(hexBlock, 16);
      this.logger.log(`Arc listener initialized. Starting scan from block ${this.lastScannedBlock}`);
    } catch (err: any) {
      this.logger.error('Failed to get current Arc block number:', err.message);
      this.lastScannedBlock = 1;
    }
  }

  @Interval(15000) // Scan every 15 seconds
  async scanBlocks() {
    if (this.isScanning) return;
    this.isScanning = true;

    try {
      const response = await axios.post(this.rpcUrl, {
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_blockNumber',
        params: []
      });
      const hexBlock = response.data.result;
      const latestBlock = parseInt(hexBlock, 16);

      if (latestBlock <= this.lastScannedBlock) {
        this.isScanning = false;
        return;
      }

      // Limit scanning to max 50 blocks at a time to prevent RPC payload overload
      const startBlock = this.lastScannedBlock + 1;
      const endBlock = Math.min(latestBlock, startBlock + 50);

      this.logger.log(`Scanning Arc blocks ${startBlock} to ${endBlock}...`);

      const logsResponse = await axios.post(this.rpcUrl, {
        jsonrpc: '2.0',
        id: 2,
        method: 'eth_getLogs',
        params: [{
          address: this.usdcContract,
          topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'],
          fromBlock: '0x' + startBlock.toString(16),
          toBlock: '0x' + endBlock.toString(16)
        }]
      });

      const logs = logsResponse.data.result || [];
      for (const log of logs) {
        try {
          if (!log.topics || log.topics.length < 3) continue;

          // Extract recipient address (topic index 2, strip padding)
          const rawToAddress = log.topics[2];
          const toAddress = '0x' + rawToAddress.substring(26);

          // Find address in database
          const walletAddress = await this.prisma.walletAddress.findFirst({
            where: {
              address: { equals: toAddress, mode: 'insensitive' }
            },
            include: { wallet: { include: { user: true } } }
          });

          if (walletAddress) {
            const txHash = log.transactionHash;
            const amount = parseInt(log.data, 16) / 1000000; // 6 decimals

            const reference = `RECV-ARC-${txHash}`;
            const existingTx = await this.prisma.transaction.findUnique({
              where: { reference }
            });
            if (existingTx) continue;

            this.logger.log(`Detected Arc Deposit: ${amount} USDC to ${toAddress}`);

            await this.prisma.$transaction(async (prisma) => {
              // Increment USDC balance
              await prisma.wallet.update({
                where: { id: walletAddress.wallet.id },
                data: { usdcBalance: { increment: amount } }
              });

              // Create transaction record
              await this.transactionsService.createTransaction(prisma, {
                userId: walletAddress.wallet.userId,
                type: 'RECEIVE',
                status: 'COMPLETED',
                amount,
                fee: 0,
                currency: 'USDC',
                reference,
                metadata: { txHash, network: 'ARC' }
              });
            });

            // Send notification
            await this.notificationsService.sendPushNotification(walletAddress.wallet.userId, {
              title: 'Arc Deposit Confirmed',
              body: `You successfully received ${amount} USDC on the Arc Network.`,
              data: {}
            });

            await this.notificationsService.sendTransactionEmail(
              walletAddress.wallet.user.email,
              amount,
              'USDC',
              reference,
              'Arc USDC Deposit'
            );
          }
        } catch (err: any) {
          this.logger.error(`Error processing Arc log:`, err.message);
        }
      }

      this.lastScannedBlock = endBlock;
    } catch (err: any) {
      this.logger.error('Error during Arc scan job:', err.message);
    } finally {
      this.isScanning = false;
    }
  }
}
