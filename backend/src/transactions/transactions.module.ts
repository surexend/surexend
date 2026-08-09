import { Module, Global } from '@nestjs/common';
import { TransactionsService } from './transactions.service';

@Global()
@Module({
  providers: [TransactionsService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
