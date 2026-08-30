import { Module } from '@nestjs/common';
import { LedgerService } from './ledger.service';
import { LedgerReconciliationService } from './ledger-reconciliation.service';
import { LedgerAlertService } from './ledger-alert.service';
@Module({
  providers: [LedgerService, LedgerReconciliationService, LedgerAlertService],
  exports: [LedgerService],
})
export class LedgerModule {}
