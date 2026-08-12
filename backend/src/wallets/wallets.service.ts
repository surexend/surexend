import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';
import { CctpService } from './cctp.service';
import axios from 'axios';
import * as crypto from 'crypto';

@Injectable()
export class WalletsService {
  private readonly logger = new Logger(WalletsService.name);
  private apiKey: string;
  private entitySecret: string;
  private walletSetId: string;
  private baseUrl: string;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private transactionsService: TransactionsService,
    private cctpService: CctpService,
  ) {
    this.apiKey = this.configService.get<string>('app.circle.apiKey') || '';
    this.entitySecret = this.configService.get<string>('app.circle.entitySecret');
    this.walletSetId = this.configService.get<string>('app.circle.walletSetId');
    this.baseUrl = 'https://api.circle.com';
    this.logger.log(`Circle API initialized: ${this.baseUrl}`);
  }

  private encryptSecret(secretHex: string, publicKeyPem: string): string {
    const buffer = Buffer.from(secretHex, 'hex');
    const encrypted = crypto.publicEncrypt(
      {
        key: publicKeyPem,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      buffer
    );
    return encrypted.toString('base64');
  }

  private getBlockchainName(network: string): string {
    const isTestKey = this.apiKey.startsWith('TEST_');
    const net = network.toUpperCase();
    if (isTestKey) {
      if (net === 'POLYGON') return 'MATIC-AMOY';
      if (net === 'AVALANCHE') return 'AVAX-FUJI';
      if (net === 'ARBITRUM') return 'ARB-SEPOLIA';
      if (net === 'ETHEREUM') return 'ETH-SEPOLIA';
      if (net === 'BASE') return 'BASE-SEPOLIA';
      if (net === 'OPTIMISM') return 'OP-SEPOLIA';
      if (net === 'SOLANA') return 'SOL-DEVNET';
      if (net === 'BSC' || net === 'BEP20') return 'EVM-TESTNET';
      if (net === 'ARC') return 'ARC-TESTNET';
    } else {
      if (net === 'POLYGON') return 'POLYGON';
      if (net === 'AVALANCHE') return 'AVAX';
      if (net === 'ARBITRUM') return 'ARB';
      if (net === 'ETHEREUM') return 'ETH';
      if (net === 'BASE') return 'BASE';
      if (net === 'OPTIMISM') return 'OP';
      if (net === 'SOLANA') return 'SOL';
      if (net === 'BSC' || net === 'BEP20') return 'EVM';
      if (net === 'ARC') return 'ARC';
    }
    return net;
  }

  async getBalance(userId: string) {
    let wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) {
      wallet = await this.prisma.wallet.create({ data: { userId } });
    }

    // Try to sync with Circle balances in real-time across all generated addresses
    try {
      const addressRecords = await this.prisma.walletAddress.findMany({
        where: { walletId: wallet.id }
      });
      
      let usdtBalance = 0;
      let usdcBalance = 0;
      const seenWalletIds = new Set<string>();

      for (const addressRecord of addressRecords) {
        try {
          const circleWallet = await this.getCircleWalletByAddress(addressRecord.address);
          if (circleWallet && !seenWalletIds.has(circleWallet.id)) {
            seenWalletIds.add(circleWallet.id);
            
            const balancesResponse = await axios.get(
              `${this.baseUrl}/v1/w3s/wallets/${circleWallet.id}/balances`,
              {
                headers: {
                  Authorization: `Bearer ${this.apiKey}`,
                  accept: 'application/json',
                }
              }
            );
            
            const tokenBalances = balancesResponse.data.data.tokenBalances || [];
            // Dedupe per symbol: the same token can appear multiple times with
            // different token IDs on some testnets. Count each symbol once (max).
            const perSymbol = new Map<string, number>();
            for (const bal of tokenBalances) {
              const symbol = bal.token.symbol.toUpperCase();
              const amount = parseFloat(bal.amount) || 0;
              perSymbol.set(symbol, Math.max(perSymbol.get(symbol) || 0, amount));
            }
            usdtBalance += perSymbol.get('USDT') || 0;
            usdcBalance += perSymbol.get('USDC') || 0;
          }
        } catch (err: any) {
          this.logger.error(`Error syncing balance for address ${addressRecord.address}:`, err.message);
        }
      }

      // Update local DB to stay in sync
      wallet = await this.prisma.wallet.update({
        where: { id: wallet.id },
        data: { usdtBalance, usdcBalance }
      });

      // Sync real deposit/withdrawal history from Circle so the transactions
      // page reflects actual on-chain activity (including pre-listener deposits).
      await this.syncCircleHistory(wallet.userId, wallet.id);

      // Also sync from the actual chain (ArcScan) because Circle's transaction
      // feed can miss deposits (e.g. the 1.5 USDC that balances the 2.8 total).
      await this.syncArcOnChainHistory(wallet.userId, wallet.id);
    } catch (err: any) {
      this.logger.error('Error syncing balance with Circle:', err.message);
    }

    const rate = 1500;
    const usdVal = wallet.usdtBalance + wallet.usdcBalance;
    const lockedVal = wallet.lockedBalance || 0;
    const pendingVal = wallet.pendingBalance || 0;
    const localVal = wallet.localBalance || 0;

    return {
      usdBalance: usdVal,
      ngnBalance: (usdVal + localVal) * rate,
      lockedBalance: lockedVal,
      usdt: usdVal,
      fiat: localVal * rate,
      rate,
      locked: lockedVal,
      pending: pendingVal
    };
  }

  private async getCircleWalletByAddress(address: string) {
    const response = await axios.get(
      `${this.baseUrl}/v1/w3s/wallets?address=${address}`,
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          accept: 'application/json',
        }
      }
    );
    const wallets = response.data.data.wallets || [];
    return wallets.length > 0 ? wallets[0] : null;
  }

  // Mirror real Circle deposit/withdrawal history into the local DB so the
  // transactions page reflects actual on-chain activity (including deposits
  // that predate the Arc listener). Idempotent: deduped by on-chain txHash.
  private async syncCircleHistory(userId: string, walletId: string) {
    try {
      // Remove legacy synthetic/duplicate records from earlier schemes so the
      // same on-chain tx is never listed twice in history.
      await this.prisma.transaction.deleteMany({
        where: {
          userId,
          OR: [
            { reference: { startsWith: 'RECV-BACKFILL-' } },
            { reference: { startsWith: 'ARC-INBOUND-' } },
            { reference: { startsWith: 'ARC-OUTBOUND-' } },
          ]
        }
      });

      const addressRecords = await this.prisma.walletAddress.findMany({
        where: { walletId }
      });

      const seenCircleWallets = new Set<string>();
      for (const addressRecord of addressRecords) {
        const circleWallet = await this.getCircleWalletByAddress(addressRecord.address);
        if (!circleWallet || seenCircleWallets.has(circleWallet.id)) continue;
        seenCircleWallets.add(circleWallet.id);

        // Resolve tokenId -> symbol from the wallet's token balances
        const balancesResponse = await axios.get(
          `${this.baseUrl}/v1/w3s/wallets/${circleWallet.id}/balances`,
          {
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
              accept: 'application/json',
            }
          }
        );
        const symbolByTokenId = new Map<string, string>();
        const tokenBalances = balancesResponse.data.data.tokenBalances || [];
        for (const bal of tokenBalances) {
          symbolByTokenId.set(bal.token.id, bal.token.symbol.toUpperCase());
        }

        const txResponse = await axios.get(
          `${this.baseUrl}/v1/w3s/transactions?walletId=${circleWallet.id}&pageSize=50`,
          {
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
              accept: 'application/json',
            }
          }
        );

        const circleTxs = txResponse.data.data.transactions || [];
        for (const tx of circleTxs) {
          const amount = parseFloat((tx.amounts || [])[0]);
          if (!amount || amount <= 0) continue;

          const symbol = symbolByTokenId.get(tx.tokenId) || 'USDC';
          const type = tx.transactionType === 'OUTBOUND' ? 'SEND' : 'RECEIVE';

          const state = (tx.state || '').toUpperCase();
          if (state !== 'COMPLETE' && state !== 'COMPLETED' && state !== 'FAILED') continue;

          const isFailed = state === 'FAILED';
          const status = isFailed ? 'FAILED' : 'COMPLETED';
          // Match the ArcListener's reference scheme so the same on-chain tx is
          // not recorded twice (listener: RECV-ARC-<txHash>, this sync: SEND-ARC-<txHash>).
          const reference = `${type === 'RECEIVE' ? 'RECV' : 'SEND'}-ARC-${tx.txHash}`;

          const existing = await this.prisma.transaction.findUnique({
            where: { reference }
          });
          if (existing) continue;

          await this.prisma.transaction.create({
            data: {
              userId,
              type,
              status,
              amount,
              fee: parseFloat(tx.networkFee || '0') || 0,
              currency: symbol,
              reference,
              metadata: {
                network: 'ARC',
                txHash: tx.txHash,
                circleTransactionId: tx.id,
                destinationAddress: tx.destinationAddress,
                sourceAddress: tx.sourceAddress,
                ...(isFailed ? { errorReason: tx.errorCode || tx.errorMessage || 'Transaction failed on Circle.', failedAt: 'circle-sync' } : {})
              },
              createdAt: new Date(tx.createDate)
            }
          });
          this.logger.log(`Synced Circle ${type} history: ${amount} ${symbol} (${tx.txHash}) status=${status}`);
        }
      }
    } catch (err: any) {
      this.logger.error('Error syncing Circle transaction history:', err.message);
    }
  }

  // ArcScan's /transactions feed is incomplete (e.g. it missed a 1.5 USDC
  // deposit while the on-chain balance shows 2.8). This method reads the actual
  // chain via ArcScan (Blockscout API) and records every inbound USDC transfer
  // to the user's addresses so history matches the true balance.
  private async syncArcOnChainHistory(userId: string, walletId: string) {
    try {
      const addressRecords = await this.prisma.walletAddress.findMany({
        where: { walletId, network: 'ARC' }
      });

      for (const addressRecord of addressRecords) {
        const address = addressRecord.address.toLowerCase();
        let cursorParams: any = null;
        const seenTxHashes = new Set<string>();

        // Fetch the Circle-confirmed transaction feed for this address once, so
        // deposits Circle has NOT confirmed (wrong-chain / unsupported network)
        // can be flagged as FAILED instead of being shown as sendable funds.
        const circleTxHashes = new Set<string>();
        try {
          const circleWallet = await this.getCircleWalletByAddress(addressRecord.address);
          if (circleWallet) {
            const circleTxResponse = await axios.get(
              `${this.baseUrl}/v1/w3s/transactions?walletId=${circleWallet.id}&pageSize=100`,
              {
                headers: {
                  Authorization: `Bearer ${this.apiKey}`,
                  accept: 'application/json',
                }
              }
            );
            for (const ct of circleTxResponse?.data?.data?.transactions || []) {
              if (ct.txHash) circleTxHashes.add(ct.txHash.toLowerCase());
            }
          }
        } catch (err: any) {
          this.logger.error(`Failed to fetch Circle tx feed for ${address}: ${err.message}`);
        }

        for (let i = 0; i < 10; i++) {
          let response: any;
          try {
            const params = cursorParams ? { ...cursorParams } : {};
            response = await axios.get(
              `https://testnet.arcscan.app/api/v2/addresses/${address}/token-transfers`,
              { params, timeout: 20000 }
            );
          } catch (err: any) {
            this.logger.error(`ArcScan token-transfers fetch failed for ${address}: ${err.message}`);
            break;
          }

          const items = response?.data?.items || [];
          for (const item of items) {
            const toHash = (item?.to?.hash || '').toLowerCase();
            if (toHash !== address) continue; // only inbound
            const token = item?.token?.symbol || '';
            if (token.toUpperCase() !== 'USDC') continue;

            const decimals = item?.token?.decimals || 6;
            const amount = parseFloat(item?.total?.value || '0') / Math.pow(10, decimals);
            if (!amount || amount <= 0) continue;

            const txHash = item?.transaction_hash;
            if (!txHash || seenTxHashes.has(txHash)) continue;
            seenTxHashes.add(txHash);

            const reference = `RECV-ARC-${txHash}`;
            const existing = await this.prisma.transaction.findUnique({
              where: { reference }
            });
            if (existing) continue;

            // A deposit that Circle has NOT confirmed is not sendable. Show it
            // as FAILED with an explanation so the balance never counts it and
            // the user understands why the funds aren't available.
            const circleConfirmed = circleTxHashes.has(txHash.toLowerCase());
            const status = circleConfirmed ? 'COMPLETED' : 'FAILED';

            await this.prisma.transaction.create({
              data: {
                userId,
                type: 'RECEIVE',
                status,
                amount,
                fee: 0,
                currency: 'USDC',
                reference,
                metadata: {
                  network: 'ARC',
                  txHash,
                  sourceAddress: item?.from?.hash,
                  destinationAddress: item?.to?.hash,
                  ...(circleConfirmed
                    ? {}
                    : {
                        errorReason:
                          'Deposit was received on-chain but has not been confirmed by our payment provider. It may have been sent to an unsupported network and is not available to send.',
                        failedAt: 'arc-sync-unconfirmed'
                      })
                },
                createdAt: new Date(item?.timestamp || Date.now())
              }
            });
            this.logger.log(`Synced on-chain RECEIVE history: ${amount} USDC (${txHash}) status=${status}`);
          }

          const next = response?.data?.next_page_params;
          if (!next || typeof next !== 'object' || Object.keys(next).length === 0) break;
          cursorParams = next;
        }
      }
    } catch (err: any) {
      this.logger.error('Error syncing Arc on-chain history:', err.message);
    }
  }

  async getDepositAddress(userId: string, network: string) {
    const validNetworks = ['POLYGON', 'AVALANCHE', 'ARBITRUM', 'ETHEREUM', 'BASE', 'OPTIMISM', 'SOLANA', 'BSC', 'BEP20', 'ARC'];
    if (!validNetworks.includes(network.toUpperCase())) {
      throw new BadRequestException('Invalid network. Supported: POLYGON, AVALANCHE, ARBITRUM, ETHEREUM, BASE, OPTIMISM, SOLANA, BSC, BEP20, ARC');
    }

    let wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) {
      wallet = await this.prisma.wallet.create({ data: { userId } });
    }

    let walletAddress = await this.prisma.walletAddress.findFirst({
      where: { walletId: wallet.id, network: network.toUpperCase() }
    });

    if (!walletAddress) {
      if (network.toUpperCase() === 'ARC') {
        try {
          // Find any existing EVM address for this wallet
          const evmAddressRecord = await this.prisma.walletAddress.findFirst({
            where: {
              walletId: wallet.id,
              network: { in: ['ETHEREUM', 'POLYGON', 'ARBITRUM', 'BASE', 'OPTIMISM', 'BSC', 'BEP20', 'AVALANCHE'] }
            }
          });

          let address = '';
          if (evmAddressRecord) {
            address = evmAddressRecord.address;
          } else {
            // Generate a standard EVM wallet on Circle (using ETHEREUM as the baseline)
            const ethWalletRecord = await this.getDepositAddress(userId, 'ETHEREUM');
            address = ethWalletRecord.address;
          }

          // Save Arc address record mapping to this EVM address
          walletAddress = await this.prisma.walletAddress.create({
            data: {
              walletId: wallet.id,
              network: 'ARC',
              address
            }
          });
        } catch (err: any) {
          this.logger.error('Error generating mapped Arc wallet:', err.message);
          throw new BadRequestException('Failed to resolve EVM address for Arc network');
        }
      } else {
        try {
          const pubKeyResponse = await axios.get(`${this.baseUrl}/v1/w3s/config/entity/publicKey`, {
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
              accept: 'application/json',
            },
          });
          const publicKeyPem = pubKeyResponse.data.data.publicKey;
          const ciphertext = this.encryptSecret(this.entitySecret, publicKeyPem);

          const blockchain = this.getBlockchainName(network);

          const createResponse = await axios.post(
            `${this.baseUrl}/v1/w3s/developer/wallets`,
            {
              idempotencyKey: crypto.randomUUID(),
              blockchains: [blockchain],
              entitySecretCiphertext: ciphertext,
              walletSetId: this.walletSetId,
              metadata: [
                {
                  name: `User ${userId.substring(0, 8)} - ${network}`,
                  refId: userId
                }
              ]
            },
            {
              headers: {
                Authorization: `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
                accept: 'application/json',
              }
            }
          );

          const circleWallet = createResponse.data.data.wallets[0];
          
          walletAddress = await this.prisma.walletAddress.create({
            data: {
              walletId: wallet.id,
              network: network.toUpperCase(),
              address: circleWallet.address,
            }
          });
        } catch (err: any) {
          this.logger.error('Error generating Circle wallet:', err.response?.data || err.message);
          const details = err.response?.data?.errors
            ? err.response.data.errors.map((e: any) => e.message || e.location).join('; ')
            : '';
          throw new BadRequestException(
            `${err.response?.data?.message || 'Failed to generate deposit address via Circle'}${details ? `: ${details}` : ''}`
          );
        }
      }
    }

    return { network: walletAddress.network, address: walletAddress.address };
  }

  async sendCrypto(userId: string, toAddress: string, amount: number, network: string, destinationNetwork?: string) {
    if (amount <= 0) throw new BadRequestException('Amount must be greater than 0');

    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });

    const net = network.toUpperCase();

    // Native USDC on Arc is tracked separately; cross-chain sends from Arc use CCTP
    if (net === 'ARC') {
      return this.sendCrossChainFromArc(userId, wallet, toAddress, amount, destinationNetwork);
    }

    if (wallet.usdtBalance < amount) {
      throw new BadRequestException('Insufficient balance');
    }

    const validNetworks = ['POLYGON', 'AVALANCHE', 'ARBITRUM', 'ETHEREUM', 'BASE', 'OPTIMISM', 'SOLANA', 'BSC', 'BEP20'];
    if (!validNetworks.includes(net)) {
      throw new BadRequestException('Invalid network. Supported: POLYGON, AVALANCHE, ARBITRUM, ETHEREUM, BASE, OPTIMISM, SOLANA, BSC, BEP20');
    }

    const sourceAddressRecord = await this.prisma.walletAddress.findFirst({
      where: { walletId: wallet.id, network: net }
    });

    if (!sourceAddressRecord) {
      throw new BadRequestException(`Please generate a deposit address for ${network} first.`);
    }

    try {
      // 1. Fetch public key & encrypt entity secret
      const pubKeyResponse = await axios.get(`${this.baseUrl}/v1/w3s/config/entity/publicKey`, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          accept: 'application/json',
        },
      });
      const publicKeyPem = pubKeyResponse.data.data.publicKey;
      const ciphertext = this.encryptSecret(this.entitySecret, publicKeyPem);

      // 2. Resolve Circle wallet ID from address
      const circleWallet = await this.getCircleWalletByAddress(sourceAddressRecord.address);
      if (!circleWallet) {
        throw new BadRequestException('Source wallet not found in Circle account.');
      }

      // 3. Resolve Token ID for USDC/USDT from wallet balances
      const balancesResponse = await axios.get(
        `${this.baseUrl}/v1/w3s/wallets/${circleWallet.id}/balances`,
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            accept: 'application/json',
          }
        }
      );

      const tokenBalances = balancesResponse.data.data.tokenBalances || [];
      const usdtToken = tokenBalances.find(t => t.token.symbol.toUpperCase() === 'USDT' || t.token.symbol.toUpperCase() === 'USDC');

      if (!usdtToken) {
        throw new BadRequestException('USD stablecoin token configuration not found in wallet.');
      }

      // 3b. Real-time balance check against Circle so we never try to send more
      // than the wallet actually holds (the local DB figure can be stale).
      const available = parseFloat(usdtToken.amount || '0') || 0;
      if (available < amount) {
        const reason = `Insufficient balance on Circle. Available: ${available} ${usdtToken.token.symbol}. Requested: ${amount}.`;
        await this.transactionsService.createTransaction(this.prisma, {
          userId,
          type: 'SEND',
          status: 'FAILED',
          amount,
          fee: 0,
          currency: usdtToken.token.symbol.toUpperCase(),
          reference: `TX-${Date.now()}-${Math.floor(Math.random()*1000)}`,
          metadata: {
            toAddress,
            network,
            destinationNetwork,
            errorReason: reason,
            failedAt: 'send-initiation'
          }
        });
        throw new BadRequestException(reason);
      }

      const tokenId = usdtToken.token.id;
      const reference = `TX-${Date.now()}-${Math.floor(Math.random()*1000)}`;

      // Execute transfer first; only touch local state if Circle accepts it.
      let transferError: any = null;
      try {
        await axios.post(
          `${this.baseUrl}/v1/w3s/developer/transactions/transfer`,
          {
            idempotencyKey: crypto.randomUUID(),
            walletId: circleWallet.id,
            destinationAddress: toAddress,
            tokenId,
            amounts: [amount.toString()],
            entitySecretCiphertext: ciphertext,
            feeLevel: 'MEDIUM',
            refId: reference
          },
          {
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
              accept: 'application/json',
            }
          }
        );
      } catch (err: any) {
        transferError = err;
      }

      if (transferError) {
        const reason = transferError?.response?.data?.message
          || transferError?.response?.data?.error?.message
          || transferError?.message
          || 'Transfer rejected by Circle.';
        await this.transactionsService.createTransaction(this.prisma, {
          userId,
          type: 'SEND',
          status: 'FAILED',
          amount,
          fee: 0,
          currency: usdtToken.token.symbol.toUpperCase(),
          reference,
          metadata: {
            toAddress,
            network,
            destinationNetwork,
            errorReason: reason,
            failedAt: 'circle-rejection'
          }
        });
        this.logger.error(`Circle rejected transfer ${reference}: ${reason}`);
        throw new BadRequestException(reason);
      }

      // Only after Circle accepts, decrement balance + lock + record PENDING.
      await this.prisma.$transaction(async (prisma) => {
        await prisma.wallet.update({
          where: { id: wallet.id },
          data: {
            usdtBalance: { decrement: amount },
            lockedBalance: { increment: amount }
          }
        });

        await this.transactionsService.createTransaction(prisma, {
          userId,
          type: 'SEND',
          status: 'PENDING',
          amount,
          fee: 0,
          currency: usdtToken.token.symbol.toUpperCase(),
          reference,
          metadata: { toAddress, network, destinationNetwork, circleWalletId: circleWallet.id }
        });
      });

      return { message: 'Transaction initiated successfully via Circle' };
    } catch (err) {
      this.logger.error('Error executing Circle transfer:', err.response?.data || err.message);
      throw new BadRequestException(
        err.response?.data?.message || 'Transaction initiation failed via Circle'
      );
    }
  }

  async getNetworks() {
    return [
      { id: 'POLYGON', name: 'Polygon', fee: 0.0 },
      { id: 'AVALANCHE', name: 'Avalanche', fee: 0.0 },
      { id: 'ARBITRUM', name: 'Arbitrum', fee: 0.0 },
      { id: 'ETHEREUM', name: 'Ethereum', fee: 0.0 }
    ];
  }

  private async sendCrossChainFromArc(
    userId: string,
    wallet: any,
    toAddress: string,
    amount: number,
    destinationNetwork?: string,
  ) {
    if (!destinationNetwork) {
      throw new BadRequestException('Destination network is required when sending from Arc.');
    }
    const destNet = destinationNetwork.toUpperCase();
    if (destNet === 'ARC') {
      throw new BadRequestException('Same-chain Arc transfers are not supported. Choose a destination network such as POLYGON, BASE, OPTIMISM, SOLANA.');
    }

    const destChain = this.cctpService.getDestinationChain(destNet);

    if (wallet.usdcBalance < amount) {
      throw new BadRequestException('Insufficient USDC balance on Arc.');
    }

    const sourceAddressRecord = await this.prisma.walletAddress.findFirst({
      where: { walletId: wallet.id, network: 'ARC' }
    });
    if (!sourceAddressRecord) {
      throw new BadRequestException('Please generate an Arc deposit address first.');
    }

    const reference = `TX-${Date.now()}-${Math.floor(Math.random()*1000)}`;

    let result: any;
    try {
      result = await this.cctpService.bridgeFromArc({
        sourceAddress: sourceAddressRecord.address,
        destChain,
        recipientAddress: toAddress,
        amount,
      });
    } catch (err: any) {
      const reason = err?.response?.data?.message
        || err?.message
        || 'Cross-chain transfer failed on Arc.';
      await this.transactionsService.createTransaction(this.prisma, {
        userId,
        type: 'SEND',
        status: 'FAILED',
        amount,
        fee: 0,
        currency: 'USDC',
        reference,
        metadata: {
          toAddress,
          network: 'ARC',
          destinationNetwork: destNet,
          cctp: true,
          errorReason: reason,
          failedAt: 'cctp-rejection'
        }
      });
      this.logger.error(`CCTP rejected transfer ${reference}: ${reason}`);
      throw new BadRequestException(reason);
    }

    await this.prisma.$transaction(async (prisma) => {
      await prisma.wallet.update({
        where: { id: wallet.id },
        data: {
          usdcBalance: { decrement: amount },
          lockedBalance: { increment: amount }
        }
      });

      await this.transactionsService.createTransaction(prisma, {
        userId,
        type: 'SEND',
        status: 'PENDING',
        amount,
        fee: 0,
        currency: 'USDC',
        reference,
        metadata: {
          toAddress,
          network: 'ARC',
          destinationNetwork: destNet,
          cctp: true,
          cctpState: result.state,
          cctpTxHashes: result.txHashes || [],
        }
      });
    });

    return { message: 'Cross-chain transfer initiated successfully via CCTP' };
  }
}
