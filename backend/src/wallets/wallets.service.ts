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
            for (const bal of tokenBalances) {
              const symbol = bal.token.symbol.toUpperCase();
              if (symbol === 'USDT') {
                usdtBalance += parseFloat(bal.amount);
              } else if (symbol === 'USDC') {
                usdcBalance += parseFloat(bal.amount);
              }
            }
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

      const tokenId = usdtToken.token.id;
      const reference = `TX-${Date.now()}-${Math.floor(Math.random()*1000)}`;

      // Execute transfer in transaction
      await this.prisma.$transaction(async (prisma) => {
        await prisma.wallet.update({
          where: { id: wallet.id },
          data: { 
            usdtBalance: { decrement: amount },
            lockedBalance: { increment: amount }
          }
        });

        // Trigger transfer via Circle Developer API
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

        await this.transactionsService.createTransaction(prisma, {
          userId,
          type: 'SEND',
          status: 'PENDING',
          amount,
          fee: 0,
          currency: usdtToken.token.symbol.toUpperCase(),
          reference,
          metadata: { toAddress, network, circleWalletId: circleWallet.id }
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

    const result = await this.cctpService.bridgeFromArc({
      sourceAddress: sourceAddressRecord.address,
      destChain,
      recipientAddress: toAddress,
      amount,
    });

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
        }
      });
    });

    return { message: 'Cross-chain transfer initiated successfully via CCTP' };
  }
}
