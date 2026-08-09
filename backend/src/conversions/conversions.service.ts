import { Injectable, BadRequestException, Logger, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import axios from 'axios';
import Redis from 'ioredis';

@Injectable()
export class ConversionsService {
  private readonly logger = new Logger(ConversionsService.name);
  private redis: Redis;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private transactionsService: TransactionsService,
  ) {
    this.redis = new Redis(this.configService.get<string>('app.redisUrl') || 'redis://localhost:6379');
  }

  async getRates(currency: string) {
    const cacheKey = `rates:${currency}`;
    const cachedRate = await this.redis.get(cacheKey);
    if (cachedRate) return { rate: parseFloat(cachedRate) };

    const apiKey = this.configService.get('app.yellowCard.apiKey');
    const secret = this.configService.get('app.yellowCard.secret');
    const timestamp = Date.now().toString();

    const signature = crypto
      .createHmac('sha256', secret)
      .update(timestamp)
      .digest('hex');

    try {
      const response = await axios.get(`https://api.yellowcard.io/rates?currency=${currency}`, {
        headers: {
          'X-YC-Timestamp': timestamp,
          'Authorization': `Bearer ${apiKey}`,
          'Signature': signature
        }
      });
      const rate = response.data.rate || 1500; // Fallback for testing
      await this.redis.set(cacheKey, rate, 'EX', 30);
      return { rate };
    } catch (error) {
      this.logger.error(`Yellow Card API error: ${error.message}`);
      // Fallback
      const rate = 1500;
      return { rate };
    }
  }

  async preview(usdtAmount: number, fiatCurrency: string) {
    const { rate } = await this.getRates(fiatCurrency);
    const fee = usdtAmount * 0.012; // 1.2% fee
    const amountAfterFee = usdtAmount - fee;
    const fiatAmount = amountAfterFee * rate;

    return {
      usdtAmount,
      fee,
      amountAfterFee,
      rate,
      fiatAmount,
      fiatCurrency
    };
  }

  async execute(userId: string, usdtAmount: number, fiatCurrency: string, bankAccountId: string, pin: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.pin) throw new ForbiddenException('PIN not set up');
    
    const isPinValid = await bcrypt.compare(pin, user.pin);
    if (!isPinValid) throw new ForbiddenException('Invalid PIN');

    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (wallet.usdtBalance < usdtAmount) throw new BadRequestException('Insufficient balance');

    const bankAccount = await this.prisma.bankAccount.findUnique({ where: { id: bankAccountId } });
    if (!bankAccount || bankAccount.userId !== userId) throw new BadRequestException('Invalid bank account');

    const previewData = await this.preview(usdtAmount, fiatCurrency);

    return this.prisma.$transaction(async (prisma) => {
      // Deduct balance
      await prisma.wallet.update({
        where: { id: wallet.id },
        data: { usdtBalance: { decrement: usdtAmount } }
      });

      // Create Conversion record
      const conversion = await prisma.conversion.create({
        data: {
          userId,
          usdtAmount,
          fiatAmount: previewData.fiatAmount,
          fiatCurrency,
          rate: previewData.rate,
          fee: previewData.fee,
          bankAccountId,
          status: 'PROCESSING'
        }
      });

      // Create Transaction record
      await this.transactionsService.createTransaction(prisma, {
        userId,
        type: 'CONVERT',
        status: 'PENDING',
        amount: usdtAmount,
        fee: previewData.fee,
        currency: 'USDT',
        reference: `CONV-${conversion.id}`,
        metadata: { conversionId: conversion.id, fiatAmount: previewData.fiatAmount }
      });

      // Call Flutterwave
      try {
        const flwSecret = this.configService.get('app.flutterwave.secretKey');
        const flwResponse = await axios.post('https://api.flutterwave.com/v3/transfers', {
          account_bank: bankAccount.bankCode,
          account_number: bankAccount.accountNumber,
          amount: previewData.fiatAmount,
          currency: fiatCurrency,
          narration: 'SureXend Withdrawal',
          reference: `CONV-${conversion.id}`,
        }, {
          headers: { Authorization: `Bearer ${flwSecret}` }
        });

        await prisma.conversion.update({
          where: { id: conversion.id },
          data: { flutterwaveRef: flwResponse.data.data.id.toString() }
        });
      } catch (error) {
        this.logger.error(`Flutterwave payout failed: ${error.message}`);
        // Handle failure properly in a real scenario
      }

      return conversion;
    });
  }
}
