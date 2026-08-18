import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { BillsService } from './bills.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('bills')
@UseGuards(JwtAuthGuard)
export class BillsController {
  constructor(private readonly billsService: BillsService) {}

  @Get('providers')
  async getProviders(@Query('type') type: string, @Query('country') country: string) {
    return this.billsService.getProviders(type, country);
  }

  @Get('status')
  async status() {
    return this.billsService.getBillsStatus();
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
    @Body('type') type: string,
    @Body('provider') provider: string,
    @Body('recipient') recipient: string,
    @Body('amount') amount: number,
    @Body('pin') pin: string,
    @Body('planCode') planCode?: string,
  ) {
    return this.billsService.purchaseBill(user.id, type, provider, recipient, amount, pin, planCode);
  }
}
