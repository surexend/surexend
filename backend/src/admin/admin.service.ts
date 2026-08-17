import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async getOverview() {
    const [totalUsers, activeUsers, kycPending, totalTransactions, completedTransactions, inAgg, outAgg, conversionAgg, recentUsers, recentTransactions] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isActive: true, isBanned: false } }),
      this.prisma.user.count({ where: { kycStatus: 'PENDING' } }),
      this.prisma.transaction.count(),
      this.prisma.transaction.count({ where: { status: 'COMPLETED' } }),
      // Money in: deposits + referral earnings only. Conversions and bill
      // payments are cash OUT and are NOT counted here.
      this.prisma.transaction.aggregate({
        where: { status: 'COMPLETED', type: { in: ['RECEIVE', 'REFERRAL_EARNING'] } },
        _sum: { amount: true },
      }),
      // Money out: sends, withdrawals, conversions and bills (all cash leaving
      // the platform). Each of these creates its own Transaction row, so this
      // single aggregate is complete — conversions/bills are NOT double-counted.
      this.prisma.transaction.aggregate({
        where: { status: 'COMPLETED', type: { in: ['SEND', 'WITHDRAWAL', 'CONVERT', 'BILL_PAYMENT'] } },
        _sum: { amount: true, fee: true },
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
      totalVolumeIn: (inAgg._sum.amount ?? 0),
      totalVolumeOut: (outAgg._sum.amount ?? 0),
      revenue: ((outAgg._sum.fee ?? 0) + (conversionAgg._sum.fee ?? 0)),
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
        wallet: { select: { usdtBalance: true, usdcBalance: true, lockedBalance: true, localBalance: true, localBalances: true, pendingBalance: true } },
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

  // Manual deposits: admin credits a user's stablecoin balance (USDT/USDC)
  // after confirming an off-platform transfer, and the user gets a completed
  // RECEIVE transaction + notification. The credit is attributed to the admin.
  async creditBalance(userId: string, adminId: string, body: { amount: number; currency?: string; note?: string }) {
    const amount = Number(body.amount);
    if (!amount || amount <= 0) throw new Error('Amount must be greater than zero');
    const currency = (body.currency || 'USDT').toUpperCase();
    if (!['USDT', 'USDC'].includes(currency)) throw new Error('Currency must be USDT or USDC');

    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new Error('Wallet not found');

    const reference = `DEP-${Date.now()}${Math.floor(Math.random() * 1000)}`;

    const result = await this.prisma.$transaction(async (prisma) => {
      const field = currency === 'USDT' ? 'usdtBalance' : 'usdcBalance';
      await prisma.wallet.update({ where: { userId }, data: { [field]: { increment: amount } } });
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
}