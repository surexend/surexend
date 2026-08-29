import { Controller, Post, Body, HttpCode, HttpStatus, UseInterceptors, Req, Get, Res, Query } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto, VerifyOtpDto } from './dto/auth.dto';
import { AuditLogInterceptor } from '../common/interceptors/audit-log.interceptor';
import { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';

@Controller('auth')
@UseInterceptors(AuditLogInterceptor)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, req);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto);
  }

  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post('resend-otp')
  @HttpCode(HttpStatus.OK)
  async resendOtp(@Body('identifier') identifier: string, @Body('type') type: string) {
    return this.authService.resendOtp(identifier, type);
  }

  @Get('google/config')
  googleConfig() {
    return { enabled: this.authService.googleEnabled() };
  }

  @Get('google')
  googleAuth() {
    return { url: this.authService.googleAuthUrl() };
  }

  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Get('google/callback')
  async googleCallback(@Query('code') code: string, @Res() res: Response) {
    const frontendUrl = this.authService.configFrontendUrl();
    try {
      const tokens = await this.authService.googleCallback(code);
      return res.redirect(`${frontendUrl}/auth/oauth-callback?accessToken=${encodeURIComponent(tokens.accessToken)}&refreshToken=${encodeURIComponent(tokens.refreshToken)}`);
    } catch (error: any) {
      return res.redirect(`${frontendUrl}/auth/oauth-callback?error=${encodeURIComponent(error?.response?.data?.message || error?.message || 'Google sign-in failed')}`);
    }
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('otp/request')
  @HttpCode(HttpStatus.OK)
  async requestLoginOtp(@Body('email') email: string) {
    return this.authService.requestLoginOtp(email);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('otp/verify-login')
  @HttpCode(HttpStatus.OK)
  async verifyLoginOtp(@Body() dto: { email: string; code: string }) {
    return this.authService.verifyLoginOtp(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body('refreshToken') refreshToken: string) {
    return this.authService.refreshTokens(refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout() {
    return { message: 'Logged out successfully' };
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body('email') email: string) {
    return this.authService.forgotPassword(email);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body('token') token: string, @Body('newPassword') newPassword: string) {
    return this.authService.resetPassword(token, newPassword);
  }
}
