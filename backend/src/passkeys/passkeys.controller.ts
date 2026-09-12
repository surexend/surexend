import { Controller, Get, Post, Body, Param, Delete, UseGuards, HttpCode } from '@nestjs/common';
import { PasskeysService } from './passkeys.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('auth/passkey')
export class PasskeysController {
  constructor(private readonly passkeysService: PasskeysService) {}

  // Public: sign in with a passkey
  @Post('login/begin')
  @HttpCode(200)
  async loginBegin(@Body('email') email?: string) {
    return this.passkeysService.loginBegin(email);
  }

  @Post('login/complete')
  @HttpCode(200)
  async loginComplete(
    @Body('challengeId') challengeId: string,
    @Body('response') response: any,
  ) {
    return this.passkeysService.loginComplete(challengeId, response);
  }

  // Authenticated: register a new device
  @UseGuards(JwtAuthGuard)
  @Post('register/begin')
  async registerBegin(@CurrentUser() user: any) {
    return this.passkeysService.registerBegin(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('register/complete')
  async registerComplete(
    @CurrentUser() user: any,
    @Body('response') response: any,
    @Body('deviceName') deviceName?: string,
  ) {
    return this.passkeysService.registerComplete(user.id, response, deviceName);
  }

  // Authenticated: approve a transaction instead of entering the PIN
  @UseGuards(JwtAuthGuard)
  @Post('approve/begin')
  @HttpCode(200)
  async approveBegin(@CurrentUser() user: any, @Body('intent') intent: Record<string, unknown>) {
    return this.passkeysService.approveBegin(user.id, intent);
  }

  @UseGuards(JwtAuthGuard)
  @Post('approve/complete')
  @HttpCode(200)
  async approveComplete(
    @CurrentUser() user: any,
    @Body('challengeId') challengeId: string,
    @Body('response') response: any,
  ) {
    return this.passkeysService.approveComplete(user.id, challengeId, response);
  }

  // Authenticated: manage enrolled devices
  @UseGuards(JwtAuthGuard)
  @Get('devices')
  async listDevices(@CurrentUser() user: any) {
    return this.passkeysService.listDevices(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('devices/:id')
  async removeDevice(@CurrentUser() user: any, @Param('id') id: string) {
    return this.passkeysService.removeDevice(user.id, id);
  }
}