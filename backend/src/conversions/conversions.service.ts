import { Injectable, BadRequestException, Logger, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import axios from 'axios';
import Redis from 'ioredis';
import {
  SUPPORTED_LOCAL_CURRENCIES,
  getLocalRate,
  LOCAL_CURRENCY_NAMES,
} from '../common/currency.constants';

const LOCAL_CODES: string[] = SUPPORTED_LOCAL_CURRENCIES.map((c) => c.code);

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

  getSupportedCurrencies() {
    return {
      usd: { code: 'USD', name: 'US Dollar', symbol: '$' },
      local: SUPPORTED_LOCAL_CURRENCIES,
    };
  }

  async getRates(currency: string) {
    const code = (currency || 'NGN').toUpperCase();
    // Static, integration-free rate table (authoritative fallback)
    let rate = getLocalRate(code);

    // Optional live-rate enhancement via YellowCard; never blocks on failure
    try {
      const cacheKey = `rates:${code}`;
      const cachedRate = await this.redis.get(cacheKey);
      if (cachedRate) {
        rate = parseFloat(cachedRate);
      } else {
        const apiKey = this.configService.get('app.yellowCard.apiKey');
        const secret = this.configService.get('app.yellowCard.secret');
        if (apiKey && secret) {
          const timestamp = Date.now().toString();
          const signature = crypto
            .createHmac('sha256', secret)
            .update(timestamp)
            .digest('hex');
          const response = await axios.get(`https://api.yellowcard.io/rates?currency=${code}`, {
            headers: {
              'X-YC-Timestamp': timestamp,
              'Authorization': `Bearer ${apiKey}`,
              'Signature': signature
            },
            timeout: 6000,
          });
          if (response.data?.rate) {
            rate = response.data.rate;
            await this.redis.set(cacheKey, rate, 'EX', 60);
          }
        }
      }
    } catch (error) {
      this.logger.warn(`Live rate unavailable for ${code}, using static rate ${rate}: ${(error as Error).message}`);
    }

    return { currency: code, rate, name: LOCAL_CURRENCY_NAMES[code] || code };
  }

  // Compute a conversion between any two wallets:
  //   USD <-> LOCAL and LOCAL <-> LOCAL (via USD as the cross-rate basis).
  private computeConversion(amount: number, from: string, to: string, fromRate: number, toRate: number) {
    const feeRate = 0.012; // 1.2% fee on the USD value
    let usdValue: number;
    if (from === 'USD') {
      usdValue = amount;
    } else {
      usdValue = amount / fromRate;
    }
    const feeUsd = usdValue * feeRate;
    const usdAfterFee = Math.max(0, usdValue - feeUsd);
    const receiveAmount = to === 'USD' ? usdAfterFee : usdAfterFee * toRate;
    const rate = to === 'USD' ? 1 / fromRate : toRate;

    return {
      usdValue,
      feeUsd,
      receiveAmount,
      rate,
    };
  }

  async preview(from: string, to: string, amount: number) {
    const fromCode = (from || 'USD').toUpperCase();
    const toCode = (to || 'NGN').toUpperCase();

    if (fromCode === toCode) throw new BadRequestException('From and To currencies must be different');
    if (!(fromCode === 'USD' || LOCAL_CODES.includes(fromCode))) throw new BadRequestException(`Unsupported currency: ${fromCode}`);
    if (!(toCode === 'USD' || LOCAL_CODES.includes(toCode))) throw new BadRequestException(`Unsupported currency: ${toCode}`);
    if (!amount || amount <= 0) throw new BadRequestException('Amount must be greater than zero');

    const fromRate = fromCode === 'USD' ? 1 : getLocalRate(fromCode);
    const toRate = toCode === 'USD' ? 1 : getLocalRate(toCode);
    const result = this.computeConversion(amount, fromCode, toCode, fromRate, toRate);

    return {
      from: fromCode,
      to: toCode,
      amount,
      rate: result.rate,
      fee: result.feeUsd,
      receiveAmount: result.receiveAmount,
    };
  }

  async execute(userId: string, from: string, to: string, amount: number, pin: string) {
    const fromCode = (from || 'USD').toUpperCase();
    const toCode = (to || 'NGN').toUpperCase();

    if (fromCode === toCode) throw new BadRequestException('From and To currencies must be different');
    if (!(fromCode === 'USD' || LOCAL_CODES.includes(fromCode))) throw new BadRequestException(`Unsupported currency: ${fromCode}`);
    if (!(toCode === 'USD' || LOCAL_CODES.includes(toCode))) throw new BadRequestException(`Unsupported currency: ${toCode}`);

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.pin) throw new ForbiddenException('PIN not set up');
    const isPinValid = await bcrypt.compare(pin, user.pin);
    if (!isPinValid) throw new ForbiddenException('Invalid PIN');

    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new BadRequestException('Wallet not found');

    // Load per-currency local balances (fall back to legacy localBalance as NGN)
    let localBalances: Record<string, number> = {};
    try {
      const parsed = (wallet.localBalances as any) || {};
      if (parsed && typeof parsed === 'object') localBalances = { ...parsed };
    } catch {
      localBalances = {};
    }
    if (wallet.localBalance > 0 && !localBalances['NGN']) localBalances['NGN'] = wallet.localBalance;

    const fromRate = fromCode === 'USD' ? 1 : getLocalRate(fromCode);
    const toRate = toCode === 'USD' ? 1 : getLocalRate(toCode);

    // Check sufficient balance in the source wallet
    if (fromCode === 'USD') {
      const usdAvailable = (wallet.usdtBalance || 0) + (wallet.usdcBalance || 0);
      if (usdAvailable < amount) {
        throw new BadRequestException(`Insufficient USD balance. Available: $${usdAvailable.toFixed(2)}`);
      }
    } else {
      const localAvailable = localBalances[fromCode] || 0;
      if (localAvailable < amount) {
        throw new BadRequestException(`Insufficient ${fromCode} balance. Available: ${localAvailable.toFixed(2)} ${fromCode}`);
      }
    }

    const result = this.computeConversion(amount, fromCode, toCode, fromRate, toRate);

    // Deduct from source, then credit destination atomically.
    const updatedLocalBalances = (() => {
      if (fromCode === 'USD' && toCode === 'USD') return localBalances; // impossible (same) but safe
      const base = { ...localBalances };
      if (fromCode !== 'USD') {
        base[fromCode] = Math.max(0, (base[fromCode] || 0) - amount);
      }
      if (toCode !== 'USD') {
        base[toCode] = (base[toCode] || 0) + result.receiveAmount;
      }
      return base;
    })();

    return this.prisma.$transaction(async (prisma) => {
      // Deduct from source
      if (fromCode === 'USD') {
        const deductUsdt = Math.min(amount, wallet.usdtBalance || 0);
        const deductUsdc = Math.max(0, amount - deductUsdt);
        await prisma.wallet.update({
          where: { id: wallet.id },
          data: {
            usdtBalance: { decrement: deductUsdt },
            usdcBalance: { decrement: deductUsdc },
          }
        });
      }

      // Credit destination
      if (toCode === 'USD') {
        await prisma.wallet.update({
          where: { id: wallet.id },
          data: { usdtBalance: { increment: result.receiveAmount } }
        });
      }

      // Apply local-balance changes (deduct source + credit dest) in one update
      const localChanged =
        (fromCode !== 'USD' && (localBalances[fromCode] || 0) !== updatedLocalBalances[fromCode]) ||
        (toCode !== 'USD' && (localBalances[toCode] || 0) !== updatedLocalBalances[toCode]);
      if (localChanged) {
        await prisma.wallet.update({
          where: { id: wallet.id },
          data: { localBalances: updatedLocalBalances }
        });
      }

      // Record Conversion record
      const conversion = await prisma.conversion.create({
        data: {
          userId,
          usdtAmount: result.usdValue,
          fiatAmount: result.receiveAmount,
          fiatCurrency: toCode,
          rate: result.rate,
          fee: result.feeUsd,
          status: 'COMPLETED',
        }
      });

      // Record Transaction record
      await this.transactionsService.createTransaction(prisma, {
        userId,
        type: 'CONVERT',
        status: 'COMPLETED',
        amount: amount,
        fee: result.feeUsd,
        currency: fromCode,
        reference: `CONV-${conversion.id}`,
        metadata: {
          conversionId: conversion.id,
          from: fromCode,
          to: toCode,
          fromAmount: amount,
          toAmount: result.receiveAmount,
          rate: result.rate,
        }
      });

      return {
        success: true,
        reference: `CONV-${conversion.id}`,
        from: fromCode,
        to: toCode,
        amount,
        receiveAmount: result.receiveAmount,
        rate: result.rate,
        fee: result.feeUsd,
      };
    });
  }
}
