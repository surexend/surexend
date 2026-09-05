import { Module } from '@nestjs/common';
import { PaymentPointService } from './paymentpoint.service';

@Module({
  providers: [PaymentPointService],
  exports: [PaymentPointService],
})
export class PaymentPointModule {}
