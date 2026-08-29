import { Module } from '@nestjs/common';
import { ConversionsService } from './conversions.service';
import { ConversionsController } from './conversions.controller';
import { TransactionsModule } from '../transactions/transactions.module';
import { TransactionAuthModule } from '../common/transaction-auth/transaction-auth.module';
import { IdempotencyModule } from '../common/idempotency/idempotency.module';
import { LedgerModule } from '../common/ledger.module';

@Module({
  imports: [TransactionsModule, TransactionAuthModule, IdempotencyModule, LedgerModule],
  providers: [ConversionsService],
  controllers: [ConversionsController],
  exports: [ConversionsService],
})
export class ConversionsModule {}
