import { Controller, Get, Post, Delete, Patch, Body, Query, Param, UseGuards } from '@nestjs/common';
import { BankAccountsService } from './bank-accounts.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('bank-accounts')
@UseGuards(JwtAuthGuard)
export class BankAccountsController {
  constructor(private readonly bankAccountsService: BankAccountsService) {}

  @Get()
  async getUserBanks(@CurrentUser() user: any) {
    return this.bankAccountsService.getUserBanks(user.id);
  }

  @Get('banks')
  async listBanks(@Query('country') country: string) {
    return this.bankAccountsService.listBanks(country);
  }

  @Post()
  async addBankAccount(
    @CurrentUser() user: any,
    @Body('bankCode') bankCode: string,
    @Body('accountNumber') accountNumber: string,
    @Body('country') country: string,
    @Body('currency') currency: string,
  ) {
    return this.bankAccountsService.addBankAccount(user.id, bankCode, accountNumber, country, currency);
  }

  @Post('paymentpoint/create-virtual-account')
  async createPaymentPointVirtualAccount(
    @CurrentUser() user: any,
    @Body() payload: {
      customerEmail: string;
      customerName: string;
      customerPhone: string;
      bankCode: string;
      businessId: string;
    }
  ) {
    return this.bankAccountsService.createPaymentPointVirtualAccount(user.id, payload);
  }

  @Delete(':id')
  async deleteBank(@CurrentUser() user: any, @Param('id') id: string) {
    return this.bankAccountsService.deleteBank(user.id, id);
  }

  @Patch(':id/default')
  async setDefault(@CurrentUser() user: any, @Param('id') id: string) {
    return this.bankAccountsService.setDefault(user.id, id);
  }
}
