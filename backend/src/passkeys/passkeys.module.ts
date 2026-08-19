import { Module } from '@nestjs/common';
import { PasskeysService } from './passkeys.service';
import { PasskeysController } from './passkeys.controller';
import { TransactionAuthModule } from '../common/transaction-auth/transaction-auth.module';

@Module({
  imports: [TransactionAuthModule],
  controllers: [PasskeysController],
  providers: [PasskeysService],
})
export class PasskeysModule {}