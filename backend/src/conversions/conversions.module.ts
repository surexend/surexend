import { Module } from '@nestjs/common';
import { ConversionsService } from './conversions.service';
import { ConversionsController } from './conversions.controller';
import { TransactionsModule } from '../transactions/transactions.module';
import { TransactionAuthModule } from '../common/transaction-auth/transaction-auth.module';

@Module({
  imports: [TransactionsModule, TransactionAuthModule],
  providers: [ConversionsService],
  controllers: [ConversionsController],
  exports: [ConversionsService],
})
export class ConversionsModule {}
