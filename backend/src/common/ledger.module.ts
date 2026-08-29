import { Module } from '@nestjs/common';
import { LedgerService } from './ledger.service';
import { LedgerReconciliationService } from './ledger-reconciliation.service';
@Module({ providers: [LedgerService, LedgerReconciliationService], exports: [LedgerService] })
export class LedgerModule {}
