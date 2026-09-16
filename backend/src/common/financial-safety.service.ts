import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { toMinor } from './money';
import { randomUUID } from 'crypto';

interface FinancialControlRow {
  id: string;
  moneyMovementEnabled: boolean;
  cryptoEnabled: boolean;
  billPaymentsEnabled: boolean;
  inboundCreditsEnabled: boolean;
  version: number;
  reason: string | null;
  updatedById: string | null;
  updatedAt: Date;
}

const CONTROL_ID = 'global';

/**
 * Central fail-closed policy for all money-moving paths.
 *
 * This is intentionally separate from the environment flag: a leaked config,
 * a bad deployment, or a compromised operator cannot turn movement on without
 * a database release-control decision. Reads use raw SQL so a rolling deploy
 * can run safely before Prisma Client has been regenerated for the control
 * models; missing/unavailable control storage is always treated as paused.
 */
@Injectable()
export class FinancialSafetyService {
  private readonly logger = new Logger(FinancialSafetyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  private async readControl(client: any = this.prisma): Promise<FinancialControlRow> {
    try {
      const rows = await client.$queryRaw<FinancialControlRow[]>`
        SELECT "id", "moneyMovementEnabled", "cryptoEnabled", "billPaymentsEnabled",
               "inboundCreditsEnabled", "version", "reason", "updatedById", "updatedAt"
        FROM "FinancialControl"
        WHERE "id" = ${CONTROL_ID}
        LIMIT 1
      `;
      const control = rows[0];
      if (!control) throw new Error('global control row is missing');
      return control;
    } catch (error: any) {
      this.logger.error(`Financial control unavailable; keeping movement paused: ${error?.message || error}`);
      throw new ServiceUnavailableException('Financial operations are paused while the release control plane is unavailable.');
    }
  }

  private environmentMovementEnabled(): boolean {
    return this.configService.get<boolean>('app.moneyMovement.enabled') === true;
  }

  async getControl() {
    return this.readControl();
  }

  async assertStorageReady() {
    try {
      const rows = await this.prisma.$queryRaw<{ table_name: string }[]>`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN ('FinancialControl', 'FinancialControlChange', 'FinancialLimitBucket', 'FinancialLimitReservation')
      `;
      const found = new Set(rows.map((row) => row.table_name));
      const required = ['FinancialControl', 'FinancialControlChange', 'FinancialLimitBucket', 'FinancialLimitReservation'];
      const missing = required.filter((table) => !found.has(table));
      if (missing.length) throw new Error(`missing tables: ${missing.join(', ')}`);
    } catch (error: any) {
      this.logger.error(`Financial control storage is incomplete: ${error?.message || error}`);
      throw new ServiceUnavailableException('Financial control storage is incomplete; refusing to start.');
    }
  }

  async assertLedgerBaselineReady() {
    if (!this.environmentMovementEnabled()) return;
    try {
      const rows = await this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count
        FROM "Wallet" w
        WHERE (COALESCE(w."usdcBalance", 0) <> 0
            OR COALESCE(w."usdtBalance", 0) <> 0
            OR COALESCE(w."localBalance", 0) <> 0
            OR COALESCE(w."realLocalBalance", 0) <> 0
            OR COALESCE(w."localBalances", '{}'::jsonb) <> '{}'::jsonb)
          AND NOT EXISTS (
            SELECT 1 FROM "LedgerEntry" l
            WHERE l."account" LIKE 'user:' || w."userId" || ':%'
          )
      `;
      const unbaselined = Number(rows[0]?.count || 0);
      if (unbaselined > 0) {
        throw new Error(`${unbaselined} wallet(s) have non-zero legacy balances without a ledger baseline`);
      }
    } catch (error: any) {
      this.logger.error(`Ledger baseline is not ready: ${error?.message || error}`);
      throw new ServiceUnavailableException('Ledger baseline is incomplete; refusing to start money movement.');
    }
  }

  /** Require both the deployment flag and the database circuit breaker. */
  async assertEnabled(operation: 'crypto' | 'bills' | 'conversion' | 'inbound' | 'admin', userId?: string) {
    if (!this.environmentMovementEnabled()) {
      throw new ServiceUnavailableException('Money movement is disabled by deployment policy.');
    }
    const control = await this.readControl();
    if (!control.moneyMovementEnabled) {
      throw new ServiceUnavailableException('Money movement is paused by operations.');
    }
    if (operation === 'crypto' && !control.cryptoEnabled) {
      throw new ServiceUnavailableException('Crypto movement is paused by operations.');
    }
    if (operation === 'bills' && !control.billPaymentsEnabled) {
      throw new ServiceUnavailableException('Bill payments are paused by operations.');
    }
    if (operation === 'inbound' && !control.inboundCreditsEnabled) {
      throw new ServiceUnavailableException('Inbound credits are paused by operations.');
    }

    if (userId && this.configService.get<string>('app.network.environment') === 'mainnet' && this.configService.get<boolean>('app.canary.enabled') === true) {
      const allowedUsers = this.configService.get<string[]>('app.canary.userIds') || [];
      if (!allowedUsers.includes(userId)) {
        throw new ServiceUnavailableException('Mainnet canary mode is active; this account is not on the approved canary allowlist.');
      }
    }

    if (userId && this.configService.get<boolean>('app.compliance.requireKyc') === true) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, isActive: true, isBanned: true, kycStatus: true },
      });
      if (!user || !user.isActive || user.isBanned || user.kycStatus !== 'VERIFIED') {
        throw new BadRequestException('Verified KYC is required before financial activity.');
      }
    }
    return control;
  }

  /** Exact-match sanctions/blocked-address stop; upstream screening remains required. */
  assertRecipientAllowed(recipient: string) {
    const normalized = String(recipient || '').trim().toLowerCase();
    if (!normalized) throw new BadRequestException('Recipient is required.');
    const blocked = (this.configService.get<string>('app.compliance.blockedAddresses') || '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    if (blocked.includes(normalized)) {
      throw new BadRequestException('This recipient is blocked pending compliance review.');
    }
  }

  assertRecipientShape(network: string, recipient: string) {
    const normalizedNetwork = String(network || '').toUpperCase();
    if (normalizedNetwork === 'SUREX_TAG') return;
    const value = String(recipient || '').trim();
    if (normalizedNetwork === 'SOLANA') {
      if (!/^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(value)) {
        throw new BadRequestException('Invalid Solana recipient address.');
      }
      return;
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
      throw new BadRequestException('Invalid EVM recipient address.');
    }
  }

  /**
   * Conservative per-user daily reservation. A reservation is not released on
   * provider failure; this can inconvenience a user, but never lets retries
   * bypass a limit after an uncertain external outcome. The caller must use a
   * stable operation reference so retries cannot consume the quota twice.
   */
  async reserveDailyLimit(params: {
    userId: string;
    reference: string;
    amount: number;
    currency: string;
    limit: number;
  }) {
    const amountMinor = toMinor(params.amount, params.currency);
    const limitMinor = toMinor(params.limit, params.currency);
    if (amountMinor <= 0 || limitMinor <= 0) throw new BadRequestException('Invalid transaction limit amount.');
    const currency = params.currency.toUpperCase();
    const day = new Date().toISOString().slice(0, 10);

    try {
      await this.prisma.$transaction(async (tx: any) => {
        const already = await tx.$queryRaw<{ amountMinor: bigint }[]>`
          SELECT "amountMinor"
          FROM "FinancialLimitReservation"
          WHERE "userId" = ${params.userId} AND "operationReference" = ${params.reference}
          LIMIT 1
        `;
        if (already.length) return;

        await tx.$executeRaw`
          INSERT INTO "FinancialLimitBucket" ("id", "userId", "limitDate", "currency", "reservedMinor", "createdAt", "updatedAt")
          VALUES (${randomUUID()}, ${params.userId}, ${day}::date, ${currency}, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT ("userId", "limitDate", "currency") DO NOTHING
        `;
        const buckets = await tx.$queryRaw<{ id: string; reservedMinor: bigint }[]>`
          SELECT "id", "reservedMinor"
          FROM "FinancialLimitBucket"
          WHERE "userId" = ${params.userId} AND "limitDate" = ${day}::date AND "currency" = ${currency}
          FOR UPDATE
        `;
        const reservationAfterLock = await tx.$queryRaw<{ id: string }[]>`
          SELECT "id"
          FROM "FinancialLimitReservation"
          WHERE "userId" = ${params.userId} AND "operationReference" = ${params.reference}
          LIMIT 1
        `;
        if (reservationAfterLock.length) return;
        const current = BigInt(buckets[0]?.reservedMinor || 0);
        if (current + BigInt(amountMinor) > BigInt(limitMinor)) {
          throw new ConflictException(`Daily ${currency} transaction limit exceeded.`);
        }
        await tx.$executeRaw`
          UPDATE "FinancialLimitBucket"
          SET "reservedMinor" = "reservedMinor" + ${BigInt(amountMinor)}, "updatedAt" = CURRENT_TIMESTAMP
          WHERE "id" = ${buckets[0].id}
        `;
        await tx.$executeRaw`
          INSERT INTO "FinancialLimitReservation" ("id", "userId", "operationReference", "currency", "amountMinor", "limitDate", "createdAt")
          VALUES (${randomUUID()}, ${params.userId}, ${params.reference}, ${currency}, ${BigInt(amountMinor)}, ${day}::date, CURRENT_TIMESTAMP)
        `;
      });
    } catch (error: any) {
      if (error instanceof ConflictException) throw error;
      this.logger.error(`Daily limit reservation failed closed: ${error?.message || error}`);
      throw new ServiceUnavailableException('Transaction limits are unavailable; the transaction was not started.');
    }
  }

  async requestChange(input: {
    moneyMovementEnabled: boolean;
    cryptoEnabled: boolean;
    billPaymentsEnabled: boolean;
    inboundCreditsEnabled: boolean;
    reason: string;
    requestedById: string;
  }) {
    if (!input.reason?.trim()) throw new BadRequestException('A release-control reason is required.');
    for (const value of [input.moneyMovementEnabled, input.cryptoEnabled, input.billPaymentsEnabled, input.inboundCreditsEnabled]) {
      if (typeof value !== 'boolean') throw new BadRequestException('Release-control switches must be booleans.');
    }
    if (input.moneyMovementEnabled && (
      this.configService.get<string>('app.nodeEnv') === 'production'
      || this.configService.get<string>('app.network.environment') === 'mainnet'
    )) {
      const requiredEvidence = [
        process.env.FINANCIAL_RELEASE_TICKET,
        process.env.FINANCIAL_RELEASE_EVIDENCE_ID,
        process.env.KYC_AML_EVIDENCE_ID,
        process.env.SANCTIONS_PROVIDER_EVIDENCE_ID,
        process.env.CUSTODY_DUAL_CONTROL_EVIDENCE_ID,
        process.env.INDEPENDENT_SECURITY_REVIEW_EVIDENCE_ID,
        process.env.POSTGRES_REHEARSAL_EVIDENCE_ID,
        process.env.DISASTER_RECOVERY_EVIDENCE_ID,
      ];
      const canaryEvidenceValid = process.env.CHAIN_ENV === 'mainnet'
        ? (process.env.CANARY_MODE === 'true'
          ? Boolean(process.env.CANARY_USER_IDS?.split(',').map((value) => value.trim()).filter(Boolean).length)
          : Boolean(process.env.STAGED_CANARY_EVIDENCE_ID?.trim()))
        : true;
      if (process.env.FINANCIAL_RELEASE_APPROVED !== 'true' || requiredEvidence.some((value) => !value?.trim()) || !canaryEvidenceValid) {
        throw new ServiceUnavailableException('Production movement cannot be enabled without signed release evidence and a staged canary allowlist/evidence packet.');
      }
    }
    const id = randomUUID();
    await this.prisma.$executeRaw`
      INSERT INTO "FinancialControlChange"
        ("id", "controlId", "moneyMovementEnabled", "cryptoEnabled", "billPaymentsEnabled", "inboundCreditsEnabled", "reason", "requestedById")
      VALUES (${id}, ${CONTROL_ID}, ${input.moneyMovementEnabled}, ${input.cryptoEnabled}, ${input.billPaymentsEnabled}, ${input.inboundCreditsEnabled}, ${input.reason.trim()}, ${input.requestedById})
    `;
    return { id, status: 'PENDING', message: 'A second, distinct admin must approve before movement can be enabled.' };
  }

  async approveChange(changeId: string, approverId: string) {
    return this.prisma.$transaction(async (tx: any) => {
      // Keep the same lock order as pause(): control first, then change.
      await tx.$queryRaw`SELECT "id" FROM "FinancialControl" WHERE "id" = ${CONTROL_ID} FOR UPDATE`;
      const changes = await tx.$queryRaw<any[]>`
        SELECT * FROM "FinancialControlChange" WHERE "id" = ${changeId} FOR UPDATE
      `;
      const change = changes[0];
      if (!change) throw new BadRequestException('Release-control change not found.');
      if (change.status !== 'PENDING') throw new ConflictException('Release-control change is no longer pending.');
      if (change.requestedById === approverId) throw new ConflictException('The requesting admin cannot approve the same release.');

      await tx.$executeRaw`
        UPDATE "FinancialControl" SET
          "moneyMovementEnabled" = ${change.moneyMovementEnabled},
          "cryptoEnabled" = ${change.cryptoEnabled},
          "billPaymentsEnabled" = ${change.billPaymentsEnabled},
          "inboundCreditsEnabled" = ${change.inboundCreditsEnabled},
          "version" = "version" + 1,
          "reason" = ${change.reason},
          "updatedById" = ${approverId},
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${CONTROL_ID}
      `;
      await tx.$executeRaw`
        UPDATE "FinancialControlChange"
        SET "status" = 'APPROVED', "approvedById" = ${approverId}, "approvedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${changeId}
      `;
      return { id: changeId, status: 'APPROVED' };
    });
  }

  /** Emergency pause is intentionally one-person and immediate. Re-enabling is not. */
  async pause(reason: string, adminId: string) {
    if (!reason?.trim()) throw new BadRequestException('A pause reason is required.');
    await this.prisma.$transaction(async (tx: any) => {
      // Lock the control row so an approval cannot race an emergency pause.
      await tx.$queryRaw`SELECT "id" FROM "FinancialControl" WHERE "id" = ${CONTROL_ID} FOR UPDATE`;
      await tx.$executeRaw`
        UPDATE "FinancialControl"
        SET "moneyMovementEnabled" = false, "cryptoEnabled" = false,
            "billPaymentsEnabled" = false, "inboundCreditsEnabled" = false,
            "version" = "version" + 1, "reason" = ${reason.trim()},
            "updatedById" = ${adminId}, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${CONTROL_ID}
      `;
      // A pending enable request must never resurrect movement after the pause.
      await tx.$executeRaw`
        UPDATE "FinancialControlChange"
        SET "status" = 'CANCELLED'
        WHERE "controlId" = ${CONTROL_ID} AND "status" = 'PENDING'
      `;
    });
    return this.getControl();
  }
}

