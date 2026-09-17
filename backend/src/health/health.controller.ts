import {
  Controller,
  Get,
  HttpCode,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FinancialSafetyService } from '../common/financial-safety.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Orchestrator-safe probes. These endpoints expose no customer or financial
 * data. A live process is not necessarily ready to serve money movement: the
 * readiness probe verifies PostgreSQL and the fail-closed financial control
 * plane before a load balancer sends traffic to the instance.
 */
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly financialSafety: FinancialSafetyService,
    private readonly config: ConfigService,
  ) {}

  @Get('live')
  @HttpCode(200)
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  @HttpCode(200)
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      await this.financialSafety.assertStorageReady();
      await this.financialSafety.getControl();
      if (this.config.get<boolean>('app.moneyMovement.enabled') === true) {
        await this.financialSafety.assertLedgerBaselineReady();
      }
      return { status: 'ready' };
    } catch (error: any) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException('Service is not ready.');
    }
  }
}
