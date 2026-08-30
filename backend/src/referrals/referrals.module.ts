import { Module } from '@nestjs/common';
import { ReferralsService } from './referrals.service';
import { ReferralsController } from './referrals.controller';
import { TransactionsModule } from '../transactions/transactions.module';
import { LedgerModule } from '../common/ledger.module';

@Module({
  imports: [TransactionsModule, LedgerModule],
  providers: [ReferralsService],
  controllers: [ReferralsController],
  exports: [ReferralsService],
})
export class ReferralsModule {}
