import { Controller, Get, Post, Body, Query, UseGuards, Headers } from '@nestjs/common';
import { WalletsService } from './wallets.service';
import { LocalFundingService } from './local-funding.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { TransactionAuthService } from '../common/transaction-auth/transaction-auth.service';

@Controller('wallets')
@UseGuards(JwtAuthGuard)
export class WalletsController {
  constructor(
    private readonly walletsService: WalletsService,
    private readonly localFundingService: LocalFundingService,
    private readonly idempotency: IdempotencyService,
    private readonly transactionAuth: TransactionAuthService,
  ) {}

  @Get('balance')
  async getBalance(@CurrentUser() user: any) {
    return this.walletsService.getBalance(user.id);
  }

  @Get('local-funding/account')
  async getLocalFundingAccount(@CurrentUser() user: any) {
    return this.localFundingService.getOrCreateAccount(user.id);
  }

  @Get('deposit-address')
  async getDepositAddress(
    @CurrentUser() user: any,
    @Query('network') network: string,
  ) {
    return this.walletsService.getDepositAddress(user.id, network);
  }

  @Get('networks')
  async getNetworks() {
    return this.walletsService.getNetworks();
  }

  @Get('cctp-fee')
  async getCctpFee(
    @CurrentUser() user: any,
    @Query('destinationNetwork') destinationNetwork: string,
    @Query('amount') amount: string,
  ) {
    return this.walletsService.estimateSendFee(
      user.id,
      destinationNetwork,
      parseFloat(amount) || 0,
    );
  }

  @Post('send')
  async sendCrypto(
    @CurrentUser() user: any,
    @Headers('idempotency-key') idempotencyKey: string,
    @Body('toAddress') toAddress: string,
    @Body('amount') amount: number,
    @Body('network') network: string,
    @Body('destinationNetwork') destinationNetwork?: string,
    @Body('currency') currency?: string,
    @Body('pin') pin?: string,
    @Body('passkeyToken') passkeyToken?: string,
  ) {
    const fingerprint = JSON.stringify({
      toAddress: String(toAddress || '').trim(),
      amount: Number(amount),
      network: String(network || '').toUpperCase(),
      destinationNetwork: destinationNetwork ? String(destinationNetwork).toUpperCase() : null,
      currency: String(currency || 'USDC').toUpperCase(),
    });

    const { result } = await this.idempotency.run(
      { userId: user.id, scope: 'wallets.send', key: idempotencyKey, fingerprint },
      async () => {
        await this.transactionAuth.verify(user, { pin, passkeyToken }, {
          action: 'wallets.send',
          toAddress: String(toAddress || '').trim(),
          amount: Number(amount),
          network: String(network || '').toUpperCase(),
          destinationNetwork: destinationNetwork ? String(destinationNetwork).toUpperCase() : null,
          currency: String(currency || 'USDC').toUpperCase(),
        });
        return this.walletsService.sendCrypto(user.id, toAddress, amount, network, destinationNetwork, currency);
      },
    );
    return result;
  }
}
