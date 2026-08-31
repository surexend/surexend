import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { BillsModule } from '../bills/bills.module';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { LedgerModule } from '../common/ledger.module';
import { WalletsModule } from '../wallets/wallets.module';
import { TransactionAuthModule } from '../common/transaction-auth/transaction-auth.module';
import { AdminStepUpGuard } from '../common/guards/admin-step-up.guard';

@Module({
  imports: [NotificationsModule, BillsModule, CampaignsModule, LedgerModule, WalletsModule, TransactionAuthModule],
  providers: [AdminService, AdminStepUpGuard],
  controllers: [AdminController],
  exports: [AdminService],
})
export class AdminModule {}