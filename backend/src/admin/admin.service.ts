import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BillsService } from '../bills/bills.service';
import { getLocalRate } from '../common/currency.constants';

// Normalize any recorded transaction amount to its USD value. Transactions
// store `amount` in `currency` (e.g. CONVERT rows record the LOCAL amount, bill
// rows record USDT) so a raw sum across currencies is meaningless — the admin
// dashboard must sum in USD terms. Live rates (same source the app uses) are
// preferred so admin figures match what users see; the static table is the
// reliable fallback when the rate feed is unreachable.
function toUsd(amount: number, currency: string, liveRates?: Record<string, number>): number {
  const code = (currency || 'USDT').toUpperCase();
  if (code === 'USD' || code === 'USDT' || code === 'USDC') return amount;
  const rate = liveRates?.[code] || getLocalRate(code);
  return rate > 0 ? amount / rate : amount;
}

const RATE_TTL_MS = 30 * 60 * 1000;
let cachedRates: Record<string, number> | null = null;
let cachedAt = 0;

// Live USD rates from the same feed the user app uses (floatrates), cached
// 30 min. Never throws: returns {} so the static table is used as fallback.
async function getLiveRates(): Promise<Record<string, number>> {
  const now = Date.now();
  if (cachedRates && now - cachedAt < RATE_TTL_MS) return cachedRates;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch('https://www.floatrates.com/daily/usd.json', { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) {
      const json: Record<string, { rate?: number }> = await res.json();
      const map: Record<string, number> = {};
      for (const key of Object.keys(json)) {
        const r = Number(json[key]?.rate);
        if (r > 0) map[key.toUpperCase()] = r;
      }
      cachedRates = map;
      cachedAt = now;
      return map;
    }
  } catch {
    // rate feed unavailable — fall back to static table
  }
  return cachedRates || {};
}

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly billsService: BillsService,
  ) {}

  async getOverview() {
    const [totalUsers, activeUsers, kycPending, totalTransactions, completedTransactions, moneyIn, convertTxs, moneyOut, conversionFeeAgg, recentUsers, recentTransactions] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isActive: true, isBanned: false } }),
      this.prisma.user.count({ where: { kycStatus: 'PENDING' } }),
      this.prisma.transaction.count(),
      this.prisma.transaction.count({ where: { status: 'COMPLETED' } }),
      // Money in: deposits + referral earnings only.
      this.prisma.transaction.findMany({
        where: { status: 'COMPLETED', type: { in: ['RECEIVE', 'REFERRAL_EARNING'] } },
        select: { amount: true, currency: true },
      }),
      // All conversions, so direction is classified below (buy crypto =
      // fiat in, sell crypto = fiat out). Fetching them apart avoids treating
      // every CONVERT as money out.
      this.prisma.transaction.findMany({
        where: { status: 'COMPLETED', type: 'CONVERT' },
        select: { amount: true, currency: true, fee: true, metadata: true },
      }),
      // Money out: sends, withdrawals and bills (cash leaving the platform).
      // Each creates its own Transaction row, so this list is complete — bills
      // are NOT double-counted.
      this.prisma.transaction.findMany({
        where: { status: 'COMPLETED', type: { in: ['SEND', 'WITHDRAWAL', 'BILL_PAYMENT'] } },
        select: { amount: true, currency: true, fee: true },
      }),
      this.prisma.conversion.aggregate({
        where: { status: 'COMPLETED' },
        _sum: { fee: true },
      }),
      this.prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        take: 7,
        select: { id: true, firstName: true, lastName: true, email: true, kycStatus: true, createdAt: true },
      }),
      this.prisma.transaction.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { user: { select: { firstName: true, lastName: true, email: true } } },
      }),
    ]);

    // Sum every amount converted to USD (never a raw cross-currency sum).
    // A conversion is money OUT only when USD-family is sold for fiat; buying
    // crypto (fiat -> USD) is money IN (fiat received by the platform).
    const sellConverts = convertTxs.filter(
      (t) => ['USDT', 'USDC', 'USD'].includes(String((t.metadata as any)?.from || t.currency || '').toUpperCase()),
    );
    const buyConverts = convertTxs.filter((t) => !sellConverts.includes(t));
    const liveRates = await getLiveRates();
    const totalVolumeIn = [...moneyIn, ...buyConverts].reduce((acc, t) => acc + toUsd(t.amount, t.currency, liveRates), 0);
    const totalVolumeOut = [...moneyOut, ...sellConverts].reduce((acc, t) => acc + toUsd(t.amount, t.currency, liveRates), 0);
    const revenueFromTxs = moneyOut.reduce((acc, t) => acc + (t.fee || 0), 0);

    const since = new Date();
    since.setDate(since.getDate() - 6);
    since.setHours(0, 0, 0, 0);
    const last7Days = await this.prisma.user.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true },
    });
    const signups = Array.from({ length: 7 }, (_, i) => {
      const day = new Date(since);
      day.setDate(since.getDate() + i);
      const key = day.toISOString().slice(0, 10);
      return {
        date: key,
        label: day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        count: last7Days.filter((u) => new Date(u.createdAt).toISOString().slice(0, 10) === key).length,
      };
    });

    return {
      totalUsers,
      activeUsers,
      kycPending,
      totalTransactions,
      completedTransactions,
      totalVolumeIn,
      totalVolumeOut,
      revenue: (revenueFromTxs + (conversionFeeAgg._sum.fee ?? 0)),
      signups: signups.reverse(),
      recentUsers: recentUsers.reverse(),
      recentTransactions,
    };
  }

  async listUsers(query: { search?: string; kycStatus?: string; page?: string; limit?: string }) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const where: Record<string, unknown> = {};
    if (query.search) {
      const q = query.search;
      where.OR = [
        { email: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q } },
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
        { surexTag: { contains: q, mode: 'insensitive' } },
      ];
    }
    if (query.kycStatus) where.kycStatus = query.kycStatus;

    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          surexTag: true,
          kycStatus: true,
          kycTier: true,
          isActive: true,
          isBanned: true,
          role: true,
          createdAt: true,
          wallet: { select: { usdtBalance: true, usdcBalance: true, localBalance: true, localBalances: true } },
        },
      }),
    ]);

    return { total, page, limit, users };
  }

  async getUserDetail(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        surexTag: true,
        kycStatus: true,
        kycTier: true,
        isActive: true,
        isBanned: true,
        role: true,
        twoFactorEnabled: true,
        currencyDisplay: true,
        defaultWallet: true,
        referralCode: true,
        createdAt: true,
        updatedAt: true,
        wallet: { select: { usdtBalance: true, usdcBalance: true, lockedBalance: true, localBalance: true, localBalances: true, realLocalBalance: true, pendingBalance: true } },
        bankAccounts: true,
        kycDocuments: { orderBy: { createdAt: 'desc' } },
        referralsMade: { include: { referred: { select: { firstName: true, lastName: true, email: true, createdAt: true } } } },
      },
    });
    if (!user) return null;

    const [transactions, conversions, bills] = await Promise.all([
      this.prisma.transaction.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 20 }),
      this.prisma.conversion.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 20 }),
      this.prisma.billPayment.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 20 }),
    ]);

    return { ...user, activity: { transactions, conversions, bills } };
  }

  async updateUser(id: string, body: { isActive?: boolean; isBanned?: boolean; kycStatus?: string; kycTier?: number; role?: string; email?: string; phone?: string }) {
    const data: Record<string, unknown> = {};
    if (typeof body.isActive === 'boolean') data.isActive = body.isActive;
    if (typeof body.isBanned === 'boolean') data.isBanned = body.isBanned;
    if (typeof body.kycTier === 'number') data.kycTier = body.kycTier;
    if (body.kycStatus && ['UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED'].includes(body.kycStatus)) data.kycStatus = body.kycStatus;
    if (body.role && ['USER', 'ADMIN'].includes(body.role)) data.role = body.role;
    if (body.email) data.email = body.email.toLowerCase().trim();
    if (body.phone) data.phone = body.phone.trim();

    try {
      const updated = await this.prisma.user.update({ where: { id }, data });
      return { id: updated.id, role: updated.role, email: updated.email, phone: updated.phone, isActive: updated.isActive, isBanned: updated.isBanned, kycStatus: updated.kycStatus, kycTier: updated.kycTier };
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new Error('Email or phone is already in use');
      }
      throw error;
    }
  }

  // Hard-delete a user (cascades wallet, transactions, kyc docs, notifications).
  // Guardrails: can't delete yourself, and can't delete the last remaining admin.
  async deleteUser(id: string, adminId: string) {
    if (id === adminId) throw new BadRequestException('You cannot delete your own account');

    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    if (user.role === 'ADMIN') {
      const adminCount = await this.prisma.user.count({ where: { role: 'ADMIN' } });
      if (adminCount <= 1) throw new BadRequestException('Cannot delete the last admin account');
    }

    await this.prisma.user.delete({ where: { id } });
    return { message: 'User deleted', id };
  }

  // Manual deposits: admin credits a user's balance after confirming an
  // off-platform transfer. USDT/USDC credit the stablecoin (testnet) wallet;
  // NGN credits REAL naira (realLocalBalance) that can pay bills/withdrawals.
  async creditBalance(userId: string, adminId: string, body: { amount: number; currency?: string; note?: string }) {
    const amount = Number(body.amount);
    if (!amount || amount <= 0) throw new Error('Amount must be greater than zero');
    const currency = (body.currency || 'USDT').toUpperCase();
    if (!['USDT', 'USDC', 'NGN'].includes(currency)) throw new Error('Currency must be USDT, USDC or NGN');

    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new Error('Wallet not found');

    const reference = `DEP-${Date.now()}${Math.floor(Math.random() * 1000)}`;

    const result = await this.prisma.$transaction(async (prisma) => {
      if (currency === 'NGN') {
        let localBalances: Record<string, number> = {};
        try {
          const parsed = wallet.localBalances as any;
          if (parsed && typeof parsed === 'object') localBalances = { ...parsed };
        } catch { /* ignore */ }
        localBalances['NGN'] = (localBalances['NGN'] || 0) + amount;
        try {
          await prisma.wallet.update({
            where: { userId },
            data: { localBalances, realLocalBalance: { increment: amount } },
          });
        } catch {
          await prisma.wallet.update({
            where: { userId },
            data: { localBalance: localBalances['NGN'] ?? 0, realLocalBalance: { increment: amount } },
          });
        }
      } else {
        const field = currency === 'USDT' ? 'usdtBalance' : 'usdcBalance';
        await prisma.wallet.update({ where: { userId }, data: { [field]: { increment: amount } } });
      }

      const transaction = await prisma.transaction.create({
        data: {
          userId,
          type: 'RECEIVE',
          status: 'COMPLETED',
          amount,
          fee: 0,
          currency,
          reference,
          metadata: { channel: 'manual_deposit', creditedBy: adminId, note: body.note || 'Manual deposit' },
        },
      });
      return transaction;
    });

    try {
      await this.notificationsService.createNotification(userId, {
        title: 'Deposit Received',
        body: `${amount} ${currency} credited to your wallet${body.note ? ` (${body.note})` : ''}. Reference: ${reference}`,
        type: 'DEPOSIT',
        data: { reference, amount, currency },
      });
    } catch { /* notifications are best-effort */ }

    return { reference, amount, currency, transactionId: result.id };
  }

  async listTransactions(query: { type?: string; status?: string; search?: string; page?: string; limit?: string }) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const where: Record<string, unknown> = {};
    if (query.type && ['SEND', 'RECEIVE', 'CONVERT', 'BILL_PAYMENT', 'REFERRAL_EARNING', 'WITHDRAWAL'].includes(query.type.toUpperCase())) {
      where.type = query.type.toUpperCase();
    }
    if (query.status && ['PENDING', 'COMPLETED', 'FAILED'].includes(query.status.toUpperCase())) {
      where.status = query.status.toUpperCase();
    }
    if (query.search) {
      where.OR = [
        { reference: { contains: query.search, mode: 'insensitive' } },
        { user: { is: { email: { contains: query.search, mode: 'insensitive' } } } },
      ];
    }

    const [total, transactions] = await Promise.all([
      this.prisma.transaction.count({ where }),
      this.prisma.transaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { user: { select: { firstName: true, lastName: true, email: true } } },
      }),
    ]);

    return { total, page, limit, transactions };
  }

  async listKyc(query: { status?: string; page?: string; limit?: string }) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const status: 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED' =
      query.status && ['UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED'].includes(query.status.toUpperCase())
        ? (query.status.toUpperCase() as 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED')
        : 'PENDING';

    const [total, documents] = await Promise.all([
      this.prisma.kycDocument.count({ where: { status } }),
      this.prisma.kycDocument.findMany({
        where: { status },
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, kycTier: true, surexTag: true } } },
      }),
    ]);

    return { total, page, limit, status, documents };
  }

  async decideKyc(documentId: string, body: { approve: boolean; reason?: string }) {
    const document = await this.prisma.kycDocument.findUnique({ where: { id: documentId } });
    if (!document) return null;

    const newStatus: 'VERIFIED' | 'REJECTED' = body.approve ? 'VERIFIED' : 'REJECTED';
    await this.prisma.kycDocument.update({
      where: { id: documentId },
      data: { status: newStatus, rejectionReason: body.approve ? null : (body.reason || null) },
    });

    // If approved, raise the user to the document's tier and mark them verified
    // (only forward: never downgrade).
    const user = await this.prisma.user.findUnique({ where: { id: document.userId }, select: { kycTier: true } });
    const nextTier = body.approve ? Math.max(user?.kycTier ?? 0, document.tier) : user?.kycTier;
    await this.prisma.user.update({
      where: { id: document.userId },
      data: {
        kycTier: nextTier ?? 0,
        kycStatus: body.approve ? 'VERIFIED' : 'REJECTED',
      },
    });

    return { id: document.id, status: newStatus, userId: document.userId };
  }

  // ── Service pricing (sell prices / margins) ─────────────────────────────

  async getPricing() {
    return this.billsService.getPricingView();
  }

  async setAirtimePricing(provider: string, marginPct: number) {
    return this.billsService.setAirtimeMargin(provider, marginPct);
  }

  async setDataMargin(provider: string, marginPct: number) {
    return this.billsService.setDataNetworkMargin(provider, marginPct);
  }

  async setDataPlanPrice(provider: string, planCode: string, sellPrice: number | null) {
    return this.billsService.setDataPlanPrice(provider, planCode, sellPrice);
  }

  async setDataPlanEnabled(provider: string, planCode: string, enabled: boolean) {
    return this.billsService.setDataPlanEnabled(provider, planCode, enabled);
  }

  // Full transaction record for the admin (any user), with the linked bill
  // payment when it is a BILL_PAYMENT (invoice details for support/debugging).
  async getTransactionDetail(id: string) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, surexTag: true } } },
    });
    if (!transaction) throw new NotFoundException('Transaction not found');

    let bill = null;
    if ((transaction.type || '').toUpperCase() === 'BILL_PAYMENT') {
      bill = await this.prisma.billPayment.findFirst({ where: { reference: transaction.reference } });
    }

    return { ...transaction, invoiceNumber: transaction.reference, bill };
  }

  // ── Broadcast / announcement ────────────────────────────────────────────────────

  async broadcastMessage(body: { title: string; body: string; type?: string; data?: any }, adminId: string) {
    const users = await this.prisma.user.findMany({
      select: { id: true, email: true },
      where: { isActive: true, isBanned: false },
    })
    if (users.length === 0) return { success: true, message: 'No users to notify', userCount: 0 }

    const title = body.title
    const msgBody = body.body
    const type = body.type || 'BROADCAST'
    const data = body.data || {}

    for (const user of users) {
      await this.prisma.notification.create({
        data: {
          userId: user.id,
          title,
          body: msgBody,
          type,
          data,
        },
      })

      this.notificationsService.sendPushNotification(user.id, {
        title,
        body: msgBody,
        data: { ...data, type, source: 'admin' },
      }).catch(() => null)
    }

    await this.notificationsService.markAllRead('admin')
      .catch(() => null)

    return { success: true, message: 'Broadcast sent to all users', userCount: users.length }
  }

  async getBroadcastHistory(query: { page?: string; limit?: string }) {
    const page = Math.max(1, Number(query.page) || 1)
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20))

    const where: Record<string, unknown> = { type: 'BROADCAST' }

    const [total, broadcasts] = await Promise.all([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
      }),
    ])

    return { total, page, limit, broadcasts }
  }
}