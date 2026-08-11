import { Module } from '@nestjs/common';
import { WalletsService } from './wallets.service';
import { WalletsController } from './wallets.controller';
import { TransactionsModule } from '../transactions/transactions.module';
import { ArcListenerService } from './arc-listener.service';

@Module({
  imports: [TransactionsModule],
  providers: [WalletsService, ArcListenerService],
  controllers: [WalletsController],
  exports: [WalletsService],
})
export class WalletsModule {}
