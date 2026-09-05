import { Module } from '@nestjs/common';
import { BankAccountsService } from './bank-accounts.service';
import { BankAccountsController } from './bank-accounts.controller';
import { PaymentPointModule } from '../paymentpoint/paymentpoint.module';

@Module({
  imports: [PaymentPointModule],
  providers: [BankAccountsService],
  controllers: [BankAccountsController],
  exports: [BankAccountsService],
})
export class BankAccountsModule {}
