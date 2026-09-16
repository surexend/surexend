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
    // A replay must be equivalent to the original transfer. A skipDuplicates-only implementation would silently accept a reused transferId with a different amount or account, hiding a corrupt journal or provider-reference collision. Partial transfers are repaired by inserting missing rows, but any existing mismatch is fatal.
    const existing = await tx.ledgerEntry.findMany({
      where: { transferId: entries[0].transferId },
      select: { account: true, currency: true, amountMinor: true, reference: true, kind: true },
    });
    for (const row of existing) {
      const expected = entries.find((entry) => entry.account === row.account && entry.currency === row.currency);
      if (!expected || guardMinor(expected.amountMinor) !== row.amountMinor || (expected.reference || null) !== (row.reference || null) || (expected.kind || 'TRANSFER') !== row.kind) {
        throw new BadRequestException(`Ledger transfer ${entries[0].transferId} conflicts with an existing journal row`);
      }
    }

    // Single atomic CREATE ... ON CONFLICT DO NOTHING. skipDuplicates repairs
    // only a genuinely partial transfer after the compatibility check above.

    // Promise.all could leave a PARTIAL transfer when one row conflicted (e.g.
    // a webhook replay), which permanently skews the balance — reconciliation
    // would then always report drift that nothing will ever fix. skipDuplicates
    // also self-heals: rows missing from a partially-written transfer are
    // inserted; a full replay writes nothing.
    const result = await tx.ledgerEntry.createMany({
      data: entries.map(e => ({ transferId: e.transferId, account: e.account, currency: e.currency, amountMinor: guardMinor(e.amountMinor), reference: e.reference, kind: e.kind || 'TRANSFER' })),
      skipDuplicates: true,
    });
    if (result.count < entries.length) {
      this.logger.debug(`Ledger replay/partial write for ${entries[0].transferId}: ${result.count}/${entries.length} rows`);
      return [];
    }
    return entries;
  }
  /**
   * Mirror every entry of a previously recorded transfer under `<transferId>-REFUND`.
   * Used by refund paths (failed sends, reverted bills) so the ledger is
   * reversed in exactly the amounts it was written, regardless of fee splits.
   * Callers must guard on the source transaction still being unsettled.
   */
  async reverse(transferId: string, tx: Prisma.TransactionClient | PrismaService = this.prisma) {
    const entries = await tx.ledgerEntry.findMany({ where: { transferId }, orderBy: { createdAt: 'asc' } });
    if (!entries.length) {
      this.logger.warn(`No ledger entries to reverse for ${transferId}`);
      return [];
    }
    return this.record(entries.map(e => ({
      transferId: `${transferId}-REFUND`,
      account: e.account,
      currency: e.currency,
      amountMinor: -e.amountMinor,
      reference: e.reference || transferId,
      kind: `${e.kind}_REFUND`,
    })), tx);
  }
  // tx-scoped variants let callers read the ledger INSIDE the same DB
  // transaction that locks the wallet row, so the spendable check is
  // serialised with concurrent conversions/deposits (same guarantee the float
  // reads get from SELECT ... FOR UPDATE).
  async balanceOf(account: string, currency: string, tx: Prisma.TransactionClient | PrismaService = this.prisma) { const r = await tx.ledgerEntry.aggregate({ where: { account, currency }, _sum: { amountMinor: true } }); return r._sum.amountMinor || 0n; }
  async balancesOf(account: string, tx: Prisma.TransactionClient | PrismaService = this.prisma) { const rows = await tx.ledgerEntry.groupBy({ by: ['currency'], where: { account }, _sum: { amountMinor: true } }); return Object.fromEntries(rows.map(r => [r.currency, r._sum.amountMinor || 0n])); }
  /** All currency balances for a user's account set (`user:<id>:<ccy>`). */
  async balancesOfUser(userId: string, tx: Prisma.TransactionClient | PrismaService = this.prisma) {
    const rows = await tx.ledgerEntry.groupBy({ by: ['currency'], where: { account: { startsWith: `user:${userId}:` } }, _sum: { amountMinor: true } });
    return Object.fromEntries(rows.map(r => [r.currency, r._sum.amountMinor || 0n]));
  }
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
