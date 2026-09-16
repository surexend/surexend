import { Controller, Post, Body, HttpCode, HttpStatus, Req, Get, Res, Query } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto, VerifyOtpDto } from './dto/auth.dto';
import { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import * as crypto from 'crypto';
import { clearAuthCookies, OAUTH_STATE_COOKIE, publicAuthResponse, readCookie, REFRESH_TOKEN_COOKIE, setAuthCookies, setOAuthStateCookie } from './auth-cookies';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private issueSession(response: Response, tokens: any) {
    setAuthCookies(response, tokens);
    return publicAuthResponse(tokens);
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(dto, req);
    return result?.accessToken ? this.issueSession(res, result) : result;
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(@Body() dto: VerifyOtpDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.verifyOtp(dto);
    return result?.accessToken ? this.issueSession(res, result) : result;
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
  googleAuth(@Res({ passthrough: true }) res: Response) {
    const state = this.authService.createGoogleOAuthState();
    setOAuthStateCookie(res, state);
    return { url: this.authService.googleAuthUrl(state) };
  }

  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Get('google/callback')
  async googleCallback(@Query('code') code: string, @Query('state') state: string, @Req() req: Request, @Res() res: Response) {
    const frontendUrl = this.authService.configFrontendUrl();
    try {
      // Bind the signed OAuth state to the browser that started the flow. A
      // valid Google code from another browser must not be able to log a victim
      // into an attacker-controlled account.
      const stateCookie = readCookie(req, OAUTH_STATE_COOKIE);
      if (!state || !stateCookie || state.length !== stateCookie.length || !crypto.timingSafeEqual(Buffer.from(state), Buffer.from(stateCookie))) {
        throw new Error('OAuth state mismatch');
      }
      const tokens = await this.authService.googleCallback(code, state);
      setAuthCookies(res, tokens);
      res.clearCookie(OAUTH_STATE_COOKIE, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/api/v1/auth' });
      // Credentials are now HttpOnly cookies. Never put access or refresh JWTs
      // in a URL fragment/query string where browser extensions, history, or
      // observability tools can capture them.
      return res.redirect(`${frontendUrl}/auth/oauth-callback`);
    } catch {
      return res.redirect(`${frontendUrl}/auth/oauth-callback?error=oauth_failed`);
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
  async verifyLoginOtp(@Body() dto: { email: string; code: string }, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.verifyLoginOtp(dto, req);
    return result?.accessToken ? this.issueSession(res, result) : result;
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('2fa/verify-login')
  @HttpCode(HttpStatus.OK)
  async verifyTwoFactorLogin(@Body() dto: { challengeToken: string; code: string }, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.verifyTwoFactorLogin(dto.challengeToken, dto.code, req);
    return this.issueSession(res, result);
  }

  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body('refreshToken') bodyToken: string, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = readCookie(req, REFRESH_TOKEN_COOKIE) || bodyToken;
    const result = await this.authService.refreshTokens(refreshToken);
    return this.issueSession(res, result);
  }

  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Body('refreshToken') bodyToken: string | undefined, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.authService.logout(readCookie(req, REFRESH_TOKEN_COOKIE) || bodyToken);
    clearAuthCookies(res);
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
  async resetPassword(@Body('token') token: string, @Body('newPassword') newPassword: string, @Body('email') email: string, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.resetPassword(token, newPassword, email);
    clearAuthCookies(res);
    return result;
  }
}
