import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TransactionsService {
  constructor(private prisma: PrismaService) {}

  async createTransaction(prismaClient: any, data: any) {
    return prismaClient.transaction.create({
      data: {
        userId: data.userId,
        type: data.type,
        status: data.status,
        amount: data.amount,
        fee: data.fee,
        currency: data.currency,
        reference: data.reference,
        metadata: data.metadata || {},
      }
    });
  }

  async getUserTransactions(userId: string, limit = 10, offset = 0) {
    return this.prisma.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });
  }

  async getUserTransactionsFiltered(
    userId: string,
    filters: {
      page?: number;
      limit?: number;
      year?: number;
      month?: number;
      week?: number;
      day?: string;
      type?: string;
    } = {},
  ) {
    const { page = 1, limit = 10, year, month, week, day, type } = filters;

    const where: any = { userId };

    if (type && type !== 'ALL') {
      where.type = type.toUpperCase();
    }

    if (year) {
      const start = new Date(Date.UTC(year, 0, 1));
      const end = new Date(Date.UTC(year + 1, 0, 1));
      where.createdAt = { gte: start, lt: end };
    }

    if (year && month) {
      const start = new Date(Date.UTC(year, month - 1, 1));
      const end = new Date(Date.UTC(year, month, 1));
      where.createdAt = { gte: start, lt: end };
    }

    if (year && week) {
      // Week 1 starts from the first day of the year
      const start = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
      const end = new Date(Date.UTC(year, 0, 1 + week * 7));
      where.createdAt = { gte: start, lt: end };
    }

    if (day) {
      const dayStart = new Date(day + 'T00:00:00.000Z');
      const dayEnd = new Date(day + 'T23:59:59.999Z');
      where.createdAt = { gte: dayStart, lte: dayEnd };
    }

    const [transactions, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: (page - 1) * limit,
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return { transactions, total, totalPages: Math.max(1, Math.ceil(total / limit)), page };
  }

  async getTransactionById(userId: string, id: string) {
    const transaction = await this.prisma.transaction.findFirst({
      where: { id, userId },
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    return transaction;
  }
}
