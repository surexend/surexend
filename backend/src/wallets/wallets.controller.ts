import { Controller, Get, Post, Body, Query, UseGuards, Headers } from '@nestjs/common';
import { WalletsService } from './wallets.service';
import { LocalFundingService } from './local-funding.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PinGuard } from '../common/guards/pin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { IdempotencyService } from '../common/idempotency/idempotency.service';

@Controller('wallets')
@UseGuards(JwtAuthGuard)
export class WalletsController {
  constructor(
    private readonly walletsService: WalletsService,
    private readonly localFundingService: LocalFundingService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Get('balance')
  async getBalance(@CurrentUser() user: any) {
    return this.walletsService.getBalance(user.id);
  }

  // Dedicated bank account for funding the local-currency wallet by transfer.
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

  // Cross-chain (CCTP) network fee estimate for the chosen destination, so the
  // send form can show the user what Circle's forwarder will deduct before
  // they confirm.
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
  @UseGuards(PinGuard)
  async sendCrypto(
    @CurrentUser() user: any,
    @Headers('idempotency-key') idempotencyKey: string,
    @Body('toAddress') toAddress: string,
    @Body('amount') amount: number,
    @Body('network') network: string,
    @Body('destinationNetwork') destinationNetwork?: string,
    @Body('pin') pin?: string, // PIN is validated by PinGuard
  ) {
    // A retry with the same key replays the first response instead of sending
    // a second time.
    const { result } = await this.idempotency.run(
      { userId: user.id, scope: 'wallets.send', key: idempotencyKey },
      () => this.walletsService.sendCrypto(user.id, toAddress, amount, network, destinationNetwork),
    );
    return result;
  }
}
