import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bull';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import configuration from './config/configuration';
import { ThrottlerProxyGuard } from './common/guards/throttler-proxy.guard';

import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { WalletsModule } from './wallets/wallets.module';
import { TransactionsModule } from './transactions/transactions.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ConversionsModule } from './conversions/conversions.module';
import { BankAccountsModule } from './bank-accounts/bank-accounts.module';
import { BillsModule } from './bills/bills.module';
import { ReferralsModule } from './referrals/referrals.module';
import { SupportModule } from './support/support.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { AdminModule } from './admin/admin.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { PasskeysModule } from './passkeys/passkeys.module';
import { LedgerModule } from './common/ledger.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    // Generous baseline: the dashboard polls, so this only has to stop abuse.
    // Sensitive endpoints tighten it with @Throttle, and transaction PINs are
    // protected by a Redis-backed attempt lockout.
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 300,
    }]),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        redis: configService.get('app.redisUrl') || 'redis://localhost:6379',
      }),
      inject: [ConfigService],
    }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    PrismaModule,
    NotificationsModule,
    TransactionsModule,
    UsersModule,
    AuthModule,
    WalletsModule,
    ConversionsModule,
    BankAccountsModule,
    BillsModule,
    ReferralsModule,
    SupportModule,
    WebhooksModule,
    AdminModule,
    CampaignsModule,
    PasskeysModule,
    LedgerModule,
  ],
  providers: [
    // Applied globally so no new endpoint ships unthrottled by default.
    // Webhooks opt out with @SkipThrottle (they come from provider IPs).
    { provide: APP_GUARD, useClass: ThrottlerProxyGuard },
  ],
})
export class AppModule {}
