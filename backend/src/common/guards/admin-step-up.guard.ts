import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { TransactionAuthService } from '../transaction-auth/transaction-auth.service';

@Injectable()
export class AdminStepUpGuard implements CanActivate {
  constructor(private readonly transactionAuthService: TransactionAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const body = request.body || {};

    await this.transactionAuthService.verify(user, {
      pin: body.adminPin,
      passkeyToken: body.adminPasskeyToken,
    }, { action: 'admin.stepup' });

    if (request.body && typeof request.body === 'object') {
      delete request.body.adminPin;
      delete request.body.adminPasskeyToken;
    }

    return true;
  }
}
