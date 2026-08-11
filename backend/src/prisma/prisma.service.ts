import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    const maxAttempts = 5;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.$connect();
        this.logger.log('Database connected.');
        return;
      } catch (err: any) {
        this.logger.error(
          `Database connection attempt ${attempt}/${maxAttempts} failed: ${err?.message || err}`,
        );
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 3000));
        }
      }
    }
    // Do NOT throw: let the app boot so the deploy stays up. Prisma will
    // reconnect lazily on the next query once the DB becomes reachable.
    this.logger.error(
      'Database unreachable after retries. Continuing; queries will retry until the DB is reachable.',
    );
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
