import { Injectable, BadRequestException, Logger, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';
import { NotificationsService } from '../notifications/notifications.service';
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
    private notificationsService: NotificationsService,
  ) {
    this.redis = new Redis(this.configService.get<string>('app.redisUrl') || 'redis://localhost:6379');
  }

  getSupportedCurrencies() {
    return {
      usd: { code: 'USD', name: 'US Dollar', symbol: '$' },
      local: SUPPORTED_LOCAL_CURRENCIES,
    };
  }

  // Real market chart data for the dashboard. Every upstream source (Yahoo
  // Finance for fiat, CoinGecko for USDC, FloatRates for live fallback) is
  // called server-side so we never hit browser CORS. Returns the actual
  // historical series the chart renders, plus which source it came from.
  async getMarketChart(currency: string, timeframe: string) {
    const code = (currency || 'NGN').toUpperCase();
    const tf = (['1D', '1W', '1M', '1Y'].includes(timeframe) ? timeframe : '1M') as '1D' | '1W' | '1M' | '1Y';
    const cacheKey = `marketchart:${code}:${tf}`;

    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch { /* cache is best-effort */ }

    let points: { time: string; value: number }[] = [];
    let source = 'Live FX';

    // USDC/USD — real crypto price history from CoinGecko.
    if (code === 'USDC') {
      try {
        const days = { '1D': 1, '1W': 7, '1M': 30, '1Y': 365 }[tf];
        const response = await axios.get('https://api.coingecko.com/api/v3/coins/usd-coin/market_chart', {
          params: { vs_currency: 'usd', days, interval: days <= 7 ? 'hourly' : 'daily' },
          timeout: 9000,
        });
        points = (response.data?.prices || []).map(([ts, v]: [number, number]) => ({
          time: new Date(ts).toISOString(),
          value: Number(v),
        }));
        source = 'CoinGecko';
      } catch (error) {
        this.logger.warn(`USDC market chart unavailable: ${(error as Error).message}`);
      }
    } else {
      // Fiat currency — real history from Yahoo Finance (with a query1 retry,
      // since query2 rate-limits without a cookie from time to time).
      const yahooRanges: Record<string, { range: string; interval: string }> = {
        '1D': { range: '1d', interval: '1h' },
        '1W': { range: '5d', interval: '1d' },
        '1M': { range: '1mo', interval: '1d' },
        '1Y': { range: '1y', interval: '1d' },
      };
      const fetched = await this.fetchYahooHistory(code, yahooRanges[tf]);
      if (fetched.length >= 2) {
        points = fetched;
        source = 'Yahoo Finance';
      } else {
        this.logger.warn(`Yahoo market chart unavailable for ${code}; serving live ticks only`);
      }
    }

    // IMPORTANT: never fabricate a flat line. When real history is unavailable
    // we return an empty series — the dashboard's live ticker (FloatRates, from
    // the browser) fills the chart with genuine movement within seconds. A
    // "straight line" of identical fallback values is what previously made the
    // chart look broken after an upstream blip.
    const payload = { currency: code, timeframe: tf, points, source, updatedAt: Date.now() };
    try {
      await this.redis.set(cacheKey, JSON.stringify(payload), 'EX', 60);
    } catch { /* cache is best-effort */ }
    return payload;
  }

  private async fetchYahooHistory(code: string, cfg: { range: string; interval: string }) {
    const domains = ['query2.finance.yahoo.com', 'query1.finance.yahoo.com'];
    for (const domain of domains) {
      try {
        const response = await axios.get(`https://${domain}/v8/finance/chart/${code}=X`, {
          params: { range: cfg.range, interval: cfg.interval },
          headers: { 'User-Agent': 'Mozilla/5.0 (SureXend Market Feed)' },
          timeout: 9000,
        });
        const result = response.data?.chart?.result?.[0];
        const stamps: number[] = result?.timestamp || [];
        const closes: (number | null)[] = result?.indicators?.quote?.[0]?.close || [];
        const points = stamps
          .map((ts, i) => ({ time: new Date(ts * 1000).toISOString(), value: Number(closes[i]) }))
          .filter((p) => Number.isFinite(p.value) && p.value > 0);
        if (points.length >= 2) return points;
      } catch { /* try next domain */ }
    }
    return [];
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
    const feeRate = 0; // No fee during testing
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

    // Testing mode: accept the default PIN if the user hasn't set a custom one yet
    const testing = this.configService.get<{ enabled: boolean; defaultPin: string }>('app.testing');
    if ((!user || !user.pin) && testing?.enabled) {
      if (pin !== testing.defaultPin) throw new ForbiddenException('Invalid PIN');
    } else {
      if (!user || !user.pin) throw new ForbiddenException('PIN not set up');
      const isPinValid = await bcrypt.compare(pin, user.pin);
      if (!isPinValid) throw new ForbiddenException('Invalid PIN');
    }

    // Load wallet with a defensive select so a not-yet-migrated localBalances
    // column can't 500 conversion execution.
    let wallet = await this.prisma.wallet.findUnique({
      where: { userId },
      select: { id: true, usdtBalance: true, usdcBalance: true, localBalance: true }
    });
    if (!wallet) throw new BadRequestException('Wallet not found');

    // Load per-currency local balances (fall back to legacy localBalance as NGN)
    let localBalances: Record<string, number> = {};
    try {
      const fullWallet = await this.prisma.wallet.findUnique({
        where: { userId },
        select: { localBalances: true }
      });
      const parsed = fullWallet?.localBalances as any;
      if (parsed && typeof parsed === 'object') localBalances = { ...parsed };
    } catch {
      // Column may not exist in the DB yet (pre-migration); fall through to legacy field
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

      // Apply local-balance changes (deduct source + credit dest) in one update.
      // Writes to localBalances are guarded: if the column isn't migrated yet in
      // the deployed DB, fall back to the legacy NGN-only field so conversions
      // never 500 (mirrors getBalance's defensive read).
      const localChanged =
        (fromCode !== 'USD' && (localBalances[fromCode] || 0) !== updatedLocalBalances[fromCode]) ||
        (toCode !== 'USD' && (localBalances[toCode] || 0) !== updatedLocalBalances[toCode]);
      if (localChanged) {
        try {
          await prisma.wallet.update({
            where: { id: wallet.id },
            data: { localBalances: updatedLocalBalances }
          });
        } catch (err: any) {
          this.logger.warn(`localBalances column unavailable; falling back to legacy localBalance: ${err.message}`);
          await prisma.wallet.update({
            where: { id: wallet.id },
            data: { localBalance: updatedLocalBalances['NGN'] ?? 0 }
          });
        }
      }

      // Record Conversion record. If the deployed DB's Conversion table is not
      // migrated (e.g. legacy NOT NULL columns like bankAccountId/flutterwaveRef
      // that we can't populate), the conversion must still succeed and record
      // its Transaction — mirroring the localBalances guard above.
      let conversionId: string | null = null;
      try {
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
        conversionId = conversion.id;
      } catch (err: any) {
        this.logger.warn(`Conversion record unavailable; skipping: ${err.message}`);
      }

      // Record Transaction record
      await this.transactionsService.createTransaction(prisma, {
        userId,
        type: 'CONVERT',
        status: 'COMPLETED',
        amount: amount,
        fee: result.feeUsd,
        currency: fromCode,
        reference: `CONV-${conversionId ?? `SKIPPED-${Date.now()}-${Math.floor(Math.random() * 1000)}`}`,
        metadata: {
          ...(conversionId ? { conversionId } : { conversionRecordSkipped: true }),
          from: fromCode,
          to: toCode,
          fromAmount: amount,
          toAmount: result.receiveAmount,
          rate: result.rate,
        }
      });

      await this.notificationsService.createNotification(userId, {
        title: 'Conversion Successful',
        body: `Converted ${amount} ${fromCode} to ${result.receiveAmount.toFixed(2)} ${toCode} at ${result.rate} ${fromCode}/${toCode}.`,
        type: 'SWAP',
        data: { from: fromCode, to: toCode, fromAmount: amount, toAmount: result.receiveAmount, rate: result.rate }
      });

      return {
        success: true,
        reference: `CONV-${conversionId ?? 'SKIPPED'}`,
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
