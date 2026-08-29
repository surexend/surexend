import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { guardMinor } from './money';
import { PrismaService } from '../prisma/prisma.service';

export interface LedgerLine { account: string; currency: string; amountMinor: bigint | number | string; }
export interface LedgerRecord extends LedgerLine { transferId: string; reference?: string; kind?: string; }

@Injectable()
export class LedgerService {
  private readonly logger = new Logger(LedgerService.name);
  constructor(private readonly prisma: PrismaService) {}
  async record(entries: LedgerRecord[], tx: Prisma.TransactionClient | PrismaService = this.prisma) {
    if (entries.length < 2) throw new BadRequestException('A ledger transfer requires at least 2 entries');
    const sums = new Map<string, bigint>();
    for (const e of entries) {
      const amount = guardMinor(e.amountMinor);
      if (amount === 0n) throw new BadRequestException('Ledger entries cannot have zero amounts');
      sums.set(e.currency, (sums.get(e.currency) || 0n) + amount);
    }
    for (const [currency, amount] of sums) if (amount !== 0n) throw new BadRequestException(`Unaccounted amount for ${currency}: ${amount}`);
    try {
      return await Promise.all(entries.map(e => tx.ledgerEntry.create({ data: { transferId: e.transferId, account: e.account, currency: e.currency, amountMinor: guardMinor(e.amountMinor), reference: e.reference, kind: e.kind || 'TRANSFER' } })));
    } catch (error: any) {
      if (error?.code === 'P2002') { this.logger.debug(`Ledger replay ignored for ${entries[0].transferId}`); return []; }
      throw error;
    }
  }
  async balanceOf(account: string, currency: string) { const r = await this.prisma.ledgerEntry.aggregate({ where: { account, currency }, _sum: { amountMinor: true } }); return r._sum.amountMinor || 0n; }
  async balancesOf(account: string) { const rows = await this.prisma.ledgerEntry.groupBy({ by: ['currency'], where: { account }, _sum: { amountMinor: true } }); return Object.fromEntries(rows.map(r => [r.currency, r._sum.amountMinor || 0n])); }
  entriesForTransfer(transferId: string) { return this.prisma.ledgerEntry.findMany({ where: { transferId }, orderBy: { createdAt: 'asc' } }); }
  userAccount(id: string, ccy: string) { return `user:${id}:${ccy}`; }
  feesAccount(ccy: string) { return `platform:fees:${ccy}`; }
  treasuryAccount(ccy: string) { return `platform:treasury:${ccy}`; }
  externalAccount(provider: string, ccy: string) { return `external:${provider}:${ccy}`; }
  userAccountName(id: string, ccy: string) { return this.userAccount(id, ccy); }
  feesAccountName(ccy: string) { return this.feesAccount(ccy); }
  treasuryAccountName(ccy: string) { return this.treasuryAccount(ccy); }
  externalAccountName(provider: string, ccy: string) { return this.externalAccount(provider, ccy); }
}
