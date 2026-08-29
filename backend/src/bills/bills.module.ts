import { Module } from '@nestjs/common';
import { BillsService } from './bills.service';
import { BillsController } from './bills.controller';
import { TransactionsModule } from '../transactions/transactions.module';
import { ConversionsModule } from '../conversions/conversions.module';
import { TransactionAuthModule } from '../common/transaction-auth/transaction-auth.module';
import { IdempotencyModule } from '../common/idempotency/idempotency.module';
import { LedgerModule } from '../common/ledger.module';

@Module({
  imports: [TransactionsModule, ConversionsModule, TransactionAuthModule, IdempotencyModule, LedgerModule],
  providers: [BillsService],
  controllers: [BillsController],
  exports: [BillsService],
})
export class BillsModule {}
