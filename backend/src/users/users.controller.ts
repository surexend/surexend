import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async getProfile(@CurrentUser() user: any) {
    return this.usersService.getProfile(user.id);
  }

  @Post('setup-pin')
  async setupPin(@CurrentUser() user: any, @Body('pin') pin: string) {
    return this.usersService.setupPin(user.id, pin);
  }

  @Post('change-pin')
  async changePin(
    @CurrentUser() user: any,
    @Body('currentPin') currentPin: string,
    @Body('newPin') newPin: string,
  ) {
    return this.usersService.changePin(user.id, currentPin, newPin);
  }

  @Post('2fa/setup')
  async setup2FA(@CurrentUser() user: any) {
    return this.usersService.setup2FA(user.id);
  }

  @Post('2fa/verify')
  async verify2FA(@CurrentUser() user: any, @Body('code') code: string) {
    return this.usersService.verify2FA(user.id, code);
  }

  @Post('kyc')
  async submitKyc(
    @CurrentUser() user: any,
    @Body('tier') tier: number,
    @Body('documentUrl') documentUrl: string,
    @Body('type') type: string,
  ) {
    return this.usersService.submitKyc(user.id, tier, documentUrl, type);
  }
}
