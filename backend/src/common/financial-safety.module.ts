import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { FinancialSafetyService } from './financial-safety.service';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [FinancialSafetyService],
  exports: [FinancialSafetyService],
})
export class FinancialSafetyModule {}
