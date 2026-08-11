import { Module } from '@nestjs/common';
import { WalletsService } from './wallets.service';
import { WalletsController } from './wallets.controller';
import { TransactionsModule } from '../transactions/transactions.module';
import { ArcListenerService } from './arc-listener.service';
import { CctpService } from './cctp.service';

@Module({
  imports: [TransactionsModule],
  providers: [WalletsService, ArcListenerService, CctpService],
  controllers: [WalletsController],
  exports: [WalletsService, CctpService],
})
export class WalletsModule {}
