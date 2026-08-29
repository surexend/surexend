import { Controller, Get, Post, Patch, Body, UseGuards, BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SUPPORTED_LOCAL_CURRENCIES } from '../common/currency.constants';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async getProfile(@CurrentUser() user: any) {
    return this.usersService.getProfile(user.id);
  }

  @Patch('me')
  async updateProfile(
    @CurrentUser() user: any,
    @Body() body: { firstName?: string; lastName?: string; avatar?: string | null },
  ) {
    return this.usersService.updateProfile(user.id, body);
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

  @Post('preferences')
  async updatePreferences(
    @CurrentUser() user: any,
    @Body() body: { currencyDisplay?: string; defaultWallet?: string },
  ) {
    const validCurrencies: string[] = SUPPORTED_LOCAL_CURRENCIES.map((c) => c.code);
    const validWallets: string[] = ['AUTO', 'USD', 'LOCAL'];

    const prefs: { currencyDisplay?: string; defaultWallet?: string } = {};
    if (body.currencyDisplay) {
      if (!validCurrencies.includes(body.currencyDisplay)) {
        throw new BadRequestException('Invalid currencyDisplay');
      }
      prefs.currencyDisplay = body.currencyDisplay;
    }
    if (body.defaultWallet) {
      if (!validWallets.includes(body.defaultWallet)) {
        throw new BadRequestException('Invalid defaultWallet');
      }
      prefs.defaultWallet = body.defaultWallet;
    }

    return this.usersService.updatePreferences(user.id, prefs);
  }

  @Post('2fa/setup')
  async setup2FA(@CurrentUser() user: any) {
    return this.usersService.setup2FA(user.id);
  }

  @Post('2fa/verify')
  async verify2FA(@CurrentUser() user: any, @Body('code') code: string) {
    return this.usersService.verify2FA(user.id, code);
  }

  @Get('kyc')
  async getKyc(@CurrentUser() user: any) {
    return this.usersService.getKycStatus(user.id);
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

  @Post('fcm-token')
  async saveFcmToken(@CurrentUser() user: any, @Body('token') token: string) {
    return this.usersService.saveFcmToken(user.id, token);
  }

  @Post('fcm-topic')
  async subscribeTopic(@CurrentUser() user: any, @Body('topic') topic: string) {
    return this.usersService.subscribeToTopic(user.id, topic);
  }
}
