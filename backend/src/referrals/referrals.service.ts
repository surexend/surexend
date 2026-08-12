import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';

@Injectable()
export class ReferralsService {
  constructor(
    private prisma: PrismaService,
    private transactionsService: TransactionsService,
  ) {}

  async getStats(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    
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
          referred: { select: { firstName: true, lastName: true, createdAt: true } }
        }
      }),
      this.prisma.referral.count({ where: { referrerId: userId } })
    ]);

    return { data, total, page, limit };
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

    return breakdown;
  }

  async processReferralEarning(referrerId: string, txFeeAmount: number) {
    const totalReferrals = await this.prisma.referral.count({ where: { referrerId } });
    
    let commissionRate = 0.3 / 100; // 0.3% default
    if (totalReferrals >= 200) commissionRate = 0.6 / 100;
    else if (totalReferrals >= 50) commissionRate = 0.5 / 100;
    else if (totalReferrals >= 10) commissionRate = 0.4 / 100;

    const commissionAmount = txFeeAmount * commissionRate;
    if (commissionAmount <= 0) return;

    await this.prisma.$transaction(async (prisma) => {
      const wallet = await prisma.wallet.findUnique({
        where: { userId: referrerId },
        select: { id: true }
      });
      await prisma.wallet.update({
        where: { id: wallet.id },
        data: { usdtBalance: { increment: commissionAmount } }
      });

      await this.transactionsService.createTransaction(prisma, {
        userId: referrerId,
        type: 'REFERRAL_EARNING',
        status: 'COMPLETED',
        amount: commissionAmount,
        fee: 0,
        currency: 'USDT',
        reference: `REF-EARN-${Date.now()}`
      });
    });
  }
}
