import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { BillsModule } from '../bills/bills.module';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { LedgerModule } from '../common/ledger.module';

@Module({
  imports: [NotificationsModule, BillsModule, CampaignsModule, LedgerModule],
  providers: [AdminService],
  controllers: [AdminController],
  exports: [AdminService],
})
export class AdminModule {}