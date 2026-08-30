import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';
import { LedgerService } from '../common/ledger.service';
import { toMinor } from '../common/money';

@Injectable()
export class ReferralsService {
  constructor(
    private prisma: PrismaService,
    private transactionsService: TransactionsService,
    private ledger: LedgerService,
  ) {}

  async getStats(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { referralCode: true },
    });
    
    const totalReferrals = await this.prisma.referral.count({ where: { referrerId: userId } });
    const activeReferrals = await this.prisma.referral.count({ where: { referrerId: userId, isActive: true } });
    
    const earningsAggr = await this.prisma.referral.aggregate({
      where: { referrerId: userId },
      _sum: { earnings: true }
    });
    const totalEarned = earningsAggr._sum.earnings || 0;

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const monthEarnings = await this.prisma.transaction.aggregate({
      where: {
        userId,
        type: 'REFERRAL_EARNING',
        createdAt: { gte: startOfMonth }
      },
      _sum: { amount: true }
    });
    const thisMonthEarned = monthEarnings._sum.amount || 0;

    let commissionRate = 0.3; // Bronze
    if (totalReferrals >= 200) commissionRate = 0.6;
    else if (totalReferrals >= 50) commissionRate = 0.5;
    else if (totalReferrals >= 10) commissionRate = 0.4;

    return {
      totalReferrals,
      activeReferrals,
      totalEarned,
      thisMonthEarned,
      referralCode: user.referralCode,
      referralLink: `https://surexend.com/ref/${user.referralCode}`,
      commissionRate
    };
  }

  async getReferrals(userId: string, page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.referral.findMany({
        where: { referrerId: userId },
        skip,
        take: limit,
        include: {
          referred: { select: { id: true, firstName: true, lastName: true, createdAt: true } }
        }
      }),
      this.prisma.referral.count({ where: { referrerId: userId } })
    ]);

    return {
      referrals: data.map((referral) => ({
        id: referral.id,
        userId: referral.referred.id,
        firstName: referral.referred.firstName,
        lastName: referral.referred.lastName,
        joinedAt: referral.referred.createdAt,
        isActive: referral.isActive,
        earnings: referral.earnings,
      })),
      total,
      page,
      limit,
    };
  }

  async getEarningsBreakdown(userId: string) {
    const transactions = await this.prisma.transaction.findMany({
      where: { userId, type: 'REFERRAL_EARNING' },
      select: { amount: true, createdAt: true },
      orderBy: { createdAt: 'desc' }
    });

    // Simple grouping by month
    const breakdown = transactions.reduce((acc, tx) => {
      const month = tx.createdAt.toISOString().slice(0, 7); // YYYY-MM
      acc[month] = (acc[month] || 0) + tx.amount;
      return acc;
    }, {});

    return Object.entries(breakdown)
      .map(([month, amount]) => ({ month, amount }))
      .sort((a, b) => b.month.localeCompare(a.month));
  }

  async processReferralEarning(referrerId: string, txFeeAmount: number) {
    const totalReferrals = await this.prisma.referral.count({ where: { referrerId } });
    
    let commissionRate = 0.3 / 100; // 0.3% default
    if (totalReferrals >= 200) commissionRate = 0.6 / 100;
    else if (totalReferrals >= 50) commissionRate = 0.5 / 100;
    else if (totalReferrals >= 10) commissionRate = 0.4 / 100;

    const commissionAmount = txFeeAmount * commissionRate;
    if (commissionAmount <= 0) return;

    const reference = `REF-EARN-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    await this.prisma.$transaction(async (prisma) => {
      const wallet = await prisma.wallet.findUnique({
        where: { userId: referrerId },
        select: { id: true }
      });
      if (!wallet) return;
      // USDC-only product (Circle owns USDC; USDT was removed from the app), so
      // commissions never land in the invisible USDT bucket again.
      await prisma.wallet.update({
        where: { id: wallet.id },
        data: { usdcBalance: { increment: commissionAmount } }
      });

      await this.transactionsService.createTransaction(prisma, {
        userId: referrerId,
        type: 'REFERRAL_EARNING',
        status: 'COMPLETED',
        amount: commissionAmount,
        fee: 0,
        currency: 'USDC',
        reference
      });

      // The commission is minted by the platform (treasury pays the referral),
      // so record both sides of the credit in the double-entry ledger.
      await this.ledger.record([
        { transferId: reference, account: this.ledger.treasuryAccount('USDC'), currency: 'USDC', amountMinor: -toMinor(commissionAmount, 'USDC'), reference, kind: 'REFERRAL_EARNING_SOURCE' },
        { transferId: reference, account: this.ledger.userAccount(referrerId, 'USDC'), currency: 'USDC', amountMinor: toMinor(commissionAmount, 'USDC'), reference, kind: 'REFERRAL_EARNING' },
      ], prisma);
    });
  }
}
