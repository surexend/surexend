import { Module } from '@nestjs/common';
import { PasskeysService } from './passkeys.service';
import { PasskeysController } from './passkeys.controller';
import { TransactionAuthModule } from '../common/transaction-auth/transaction-auth.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TransactionAuthModule, AuthModule],
  controllers: [PasskeysController],
  providers: [PasskeysService],
})
export class PasskeysModule {}
