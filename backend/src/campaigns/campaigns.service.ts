import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { getLocalRate } from '../common/currency.constants';

export type CampaignType = 'bills' | 'crypto';
export type CampaignRange = 'day' | '7d' | '30d' | '365d' | 'all';

const USD_CODES = new Set(['USD', 'USDT', 'USDC']);
const VALID_RANGES = new Set(['day', '7d', '30d', '365d', 'all']);
const RANGE_MS: Record<Exclude<CampaignRange, 'all'>, number> = {
  day: 24 * 3600 * 1000,
  '7d': 7 * 24 * 3600 * 1000,
  '30d': 30 * 24 * 3600 * 1000,
  '365d': 365 * 24 * 3600 * 1000,
};

@Injectable()
export class CampaignsService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeRange(range: string): CampaignRange {
    return VALID_RANGES.has(range) ? (range as CampaignRange) : 'all';
  }

  private normalizeType(type: string): CampaignType {
    return type === 'bills' ? 'bills' : 'crypto';
  }

  // Convert a transaction amount to its USD worth. Stablecoins are 1:1; local
  // currencies use the static rate table (same one conversions uses).
  private usdValue(amount: number, currency: string): number {
    const c = (currency || '').toUpperCase();
    if (USD_CODES.has(c)) return amount || 0;
    const rate = getLocalRate(c);
    return rate > 0 ? (amount || 0) / rate : 0;
  }

  async getLeaderboard(type: string, range: string) {
    const normType = this.normalizeType(type);
    const normRange = this.normalizeRange(range);
    const since = normRange === 'all' ? null : new Date(Date.now() - RANGE_MS[normRange]);

    const where: any = { status: 'COMPLETED' };
    if (since) where.createdAt = { gte: since };

    let totals = new Map<string, number>();
    if (normType === 'crypto') {
      // Total USD worth of completed crypto transactions only (SEND + RECEIVE + CONVERT).
      where.type = { in: ['SEND', 'RECEIVE', 'CONVERT'] };
      const txs = await this.prisma.transaction.findMany({
        where,
        select: { userId: true, amount: true, currency: true },
      });
      for (const t of txs) {
        const v = this.usdValue(t.amount, t.currency);
        if (v > 0) totals.set(t.userId, (totals.get(t.userId) || 0) + v);
      }
    } else {
      // Real-naira bill spend only (isolation: channel real_ngn). Percent share
      // of everyone's total — amounts stay hidden from users.
      where.type = 'BILL_PAYMENT';
      where.currency = 'NGN';
      const txs = await this.prisma.transaction.findMany({
        where,
        select: { userId: true, amount: true, metadata: true },
      });
      for (const t of txs) {
        const channel = (t.metadata as any)?.channel;
        if (channel != null && channel !== 'real_ngn') continue;
        totals.set(t.userId, (totals.get(t.userId) || 0) + (t.amount || 0));
      }
    }

    let grandTotal = 0;
    for (const v of totals.values()) grandTotal += v;

    const ids = [...totals.keys()];
    const users = ids.length
      ? await this.prisma.user.findMany({
          where: { id: { in: ids } },
          select: { id: true, firstName: true, lastName: true, surexTag: true },
        })
      : [];
    const userMap = new Map<string, { id: string; firstName: string; lastName: string; surexTag: string | null }>(
      users.map((u) => [u.id, u]),
    );

    const entries = [...totals.entries()]
      .map(([userId, total]) => {
        const u = userMap.get(userId);
        return {
          userId,
          name: u ? `${u.firstName} ${u.lastName}`.trim() : 'Anonymous',
          surexTag: u?.surexTag || null,
          total: normType === 'bills' ? Math.round(total * 100) / 100 : Math.round(total * 100) / 100,
          sharePct: normType === 'bills' && grandTotal > 0
            ? Math.round((total / grandTotal) * 10000) / 100
            : null,
        };
      })
      .sort((a, b) => b.total - a.total)
      .map((e, i) => ({ ...e, rank: i + 1 }));

    return {
      type: normType,
      range: normRange,
      grandTotal: Math.round(grandTotal * 100) / 100,
      count: entries.length,
      entries,
      goldenUserIds: entries.slice(0, 5).map((e) => e.userId),
    };
  }

  // Lightweight standing for the current user (all-time) — used by the profile
  // to decide the golden tick.
  async getMyStanding(userId: string) {
    const [bills, crypto] = await Promise.all([
      this.getLeaderboard('bills', 'all'),
      this.getLeaderboard('crypto', 'all'),
    ]);
    const meBills = bills.entries.find((e) => e.userId === userId);
    const meCrypto = crypto.entries.find((e) => e.userId === userId);
    return {
      bills: {
        rank: meBills?.rank ?? null,
        sharePct: meBills?.sharePct ?? null,
        golden: !!meBills && meBills.rank <= 5,
      },
      crypto: {
        rank: meCrypto?.rank ?? null,
        totalUsd: meCrypto?.total ?? null,
        golden: !!meCrypto && meCrypto.rank <= 5,
      },
    };
  }
}
