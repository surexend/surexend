import { Controller, Get, Post, Body, Query, UseGuards, Headers } from '@nestjs/common';
import { BillsService } from './bills.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { IdempotencyService } from '../common/idempotency/idempotency.service';

@Controller('bills')
@UseGuards(JwtAuthGuard)
export class BillsController {
  constructor(
    private readonly billsService: BillsService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Get('providers')
  async getProviders(@Query('type') type: string, @Query('country') country: string) {
    return this.billsService.getProviders(type, country);
  }

  @Get('data-plans')
  async getDataPlans(@Query('provider') provider: string) {
    return this.billsService.getDataPlans(provider);
  }

  @Get('validate-meter')
  async validateMeter(@Query('meter') meter: string, @Query('provider') provider: string) {
    return this.billsService.validateMeter(meter, provider);
  }

  @Post('purchase')
  async purchase(
    @CurrentUser() user: any,
    @Headers('idempotency-key') idempotencyKey: string,
    @Body('type') type: string,
    @Body('provider') provider: string,
    @Body('recipient') recipient: string,
    @Body('amount') amount: number,
    @Body('pin') pin?: string,
    @Body('planCode') planCode?: string,
    @Body('passkeyToken') passkeyToken?: string,
    @Body('portedNumber') portedNumber?: boolean,
  ) {
    const { result } = await this.idempotency.run(
      { userId: user.id, scope: 'bills.purchase', key: idempotencyKey },
      () => this.billsService.purchaseBill(user.id, type, provider, recipient, amount, pin, planCode, passkeyToken, portedNumber),
    );
    return result;
  }
}
