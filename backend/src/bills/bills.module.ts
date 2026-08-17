import { Module } from '@nestjs/common';
import { BillsService } from './bills.service';
import { BillsController } from './bills.controller';
import { TransactionsModule } from '../transactions/transactions.module';
import { ConversionsModule } from '../conversions/conversions.module';

@Module({
  imports: [TransactionsModule, ConversionsModule],
  providers: [BillsService],
  controllers: [BillsController],
  exports: [BillsService],
})
export class BillsModule {}
