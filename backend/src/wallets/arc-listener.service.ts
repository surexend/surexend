import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import axios from 'axios';

// Arc uses USDC as its native gas token. Two emitters can represent USDC
// movement (see https://docs.arc.io/arc/references/usdc-system-events):
//   - ERC-20 USDC precompile 0x3600...0000 (6 decimals)
//   - Native USDC system emitter 0xffff...fffe (18 decimals, EIP-7708)
// A single ERC-20 transfer() emits BOTH logs; a plain native value send emits
// only the system log. We must scan both and never double-count the same tx.
const ERC20_USDC_EMITTER = '0x3600000000000000000000000000000000000000';
const NATIVE_USDC_EMITTER = '0xfffffffffffffffffffffffffffffffffffffffe';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

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
    this.usdcContract = this.configService.get<string>('app.arc.usdcContractAddress') || ERC20_USDC_EMITTER;
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

      // Scan both emitters: the ERC-20 precompile (6 decimals) and the native
      // system emitter (18 decimals). A single ERC-20 transfer() emits BOTH logs,
      // so we dedupe by transaction hash in-memory; a plain native value send
      // produces only the system log and is caught by the second query.
      const emitters = [
        { address: this.usdcContract, decimals: 6 },
        { address: NATIVE_USDC_EMITTER, decimals: 18 }
      ];

      const seenInBatch = new Set<string>();
      for (const emitter of emitters) {
        let logsResponse: any;
        try {
          logsResponse = await axios.post(this.rpcUrl, {
            jsonrpc: '2.0',
            id: 2,
            method: 'eth_getLogs',
            params: [{
              address: emitter.address,
              topics: [TRANSFER_TOPIC],
              fromBlock: '0x' + startBlock.toString(16),
              toBlock: '0x' + endBlock.toString(16)
            }]
          });
        } catch (err: any) {
          this.logger.error(`Arc eth_getLogs failed for ${emitter.address}: ${err.message}`);
          continue;
        }

        const logs = logsResponse.data.result || [];
        for (const log of logs) {
          if (seenInBatch.has(log.transactionHash)) continue;
          seenInBatch.add(log.transactionHash);

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
              // BigInt first: native USDC is 18 decimals and can exceed the safe
              // integer range, so a plain parseInt() would silently lose precision.
              const amount = Number(BigInt(log.data)) / Math.pow(10, emitter.decimals);

              const reference = `RECV-ARC-${txHash}`;
              const existingTx = await this.prisma.transaction.findUnique({
                where: { reference }
              });
              if (existingTx) continue;

              this.logger.log(`Detected Arc Deposit: ${amount} USDC to ${toAddress}`);

              await this.prisma.$transaction(async (prisma) => {
                // Do NOT increment the balance here. The displayed balance must
                // only ever reflect what Circle confirms as sendable. Raw on-chain
                // events (including wrong-chain / unconfirmed deposits) must not
                // inflate it; getBalance() overwrites from Circle's live API.

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

              // Persist in-app notification so the bell drawer shows the deposit
              await this.notificationsService.createNotification(walletAddress.wallet.userId, {
                title: 'Deposit Received',
                body: `Successfully received +${amount} USDC on Arc.`,
                type: 'DEPOSIT',
                data: { amount, currency: 'USDC', network: 'ARC', txHash }
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
      }

      this.lastScannedBlock = endBlock;
    } catch (err: any) {
      this.logger.error('Error during Arc scan job:', err.message);
    } finally {
      this.isScanning = false;
    }
  }
}
