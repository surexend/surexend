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
    // A server that is reachable but cannot read/write its database must never
    // advertise a healthy money API. Boot failure lets the orchestrator retry
    // and prevents requests from running against a partial or stale state.
    throw new Error('Database unreachable after startup retries; refusing to start.');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
