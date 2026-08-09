import { Injectable } from '@nestjs/common';
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
}
