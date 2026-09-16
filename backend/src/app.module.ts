import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bull';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import configuration from './config/configuration';
import { ThrottlerProxyGuard } from './common/guards/throttler-proxy.guard';
import { RedisThrottlerStorage } from './common/guards/redis-throttler.storage';
import { AuditLogInterceptor } from './common/interceptors/audit-log.interceptor';

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
import { FinancialSafetyModule } from './common/financial-safety.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    // Generous baseline: the dashboard polls, so this only has to stop abuse.
    // Sensitive endpoints tighten it with @Throttle, and transaction PINs are
    // protected by a Redis-backed attempt lockout.
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        throttlers: [{ ttl: 60000, limit: 300 }],
        storage: new RedisThrottlerStorage(configService),
      }),
    }),
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
    FinancialSafetyModule,
  ],
  providers: [
    // Applied globally so no new endpoint ships unthrottled by default.
    // Webhooks opt out with @SkipThrottle (they come from provider IPs).
    { provide: APP_GUARD, useClass: ThrottlerProxyGuard },
    // Every successful state-changing request is attributable, including
    // customer money actions and admin operations. Sensitive body fields are
    // redacted by the interceptor before persistence.
    { provide: APP_INTERCEPTOR, useClass: AuditLogInterceptor },
  ],
})
export class AppModule {}
