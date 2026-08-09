import { Module } from '@nestjs/common';
import { ConversionsService } from './conversions.service';
import { ConversionsController } from './conversions.controller';
import { TransactionsModule } from '../transactions/transactions.module';

@Module({
  imports: [TransactionsModule],
  providers: [ConversionsService],
  controllers: [ConversionsController],
  exports: [ConversionsService],
})
export class ConversionsModule {}
