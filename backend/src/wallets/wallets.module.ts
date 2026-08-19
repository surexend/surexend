import { Module } from '@nestjs/common';
import { WalletsService } from './wallets.service';
import { WalletsController } from './wallets.controller';
import { TransactionsModule } from '../transactions/transactions.module';
import { CctpService } from './cctp.service';
import { OnchainService } from './onchain.service';
import { DepositMonitorService } from './deposit-monitor.service';
import { LocalFundingService } from './local-funding.service';
import { TransactionAuthModule } from '../common/transaction-auth/transaction-auth.module';

@Module({
  imports: [TransactionsModule, TransactionAuthModule],
  providers: [WalletsService, CctpService, OnchainService, DepositMonitorService, LocalFundingService],
  controllers: [WalletsController],
  exports: [WalletsService, CctpService],
})
export class WalletsModule {}
