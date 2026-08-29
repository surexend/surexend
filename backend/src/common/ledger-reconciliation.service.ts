import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from './ledger.service';

@Injectable()
export class LedgerReconciliationService {
  private readonly logger = new Logger(LedgerReconciliationService.name);
  constructor(private readonly prisma: PrismaService, private readonly ledger: LedgerService) {}
  @Cron('0 * * * *')
  async reconcile() {
    const accounts = await this.prisma.ledgerEntry.findMany({ distinct: ['account', 'currency'], select: { account: true, currency: true } });
    for (const { account, currency } of accounts) {
      const balance = await this.ledger.balanceOf(account, currency);
      const match = account.match(/^user:([^:]+):(.+)$/);
      if (!match) continue;
      const wallet = await this.prisma.wallet.findUnique({ where: { userId: match[1] }, select: { usdcBalance: true, usdtBalance: true } });
      const legacy = currency === 'USDC' ? wallet?.usdcBalance : currency === 'USDT' ? wallet?.usdtBalance : undefined;
      if (legacy !== undefined && Number(balance) / 10 ** 6 !== legacy) this.logger.warn(`Ledger drift ${account} ${currency}: ledger=${balance} legacy=${legacy}`);
    }
  }
}
