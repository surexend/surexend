import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TransactionAuthService } from '../transaction-auth/transaction-auth.service';

@Injectable()
export class PinGuard implements CanActivate {
  constructor(
    private prisma: PrismaService,
    private transactionAuth: TransactionAuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    const dbUser = await this.prisma.user.findUnique({ where: { id: user.id } });

    await this.transactionAuth.verify(dbUser, request.body);

    return true;
  }
}