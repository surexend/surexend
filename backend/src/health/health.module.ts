import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { FinancialSafetyModule } from '../common/financial-safety.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule, FinancialSafetyModule],
  controllers: [HealthController],
})
export class HealthModule {}
