import { Injectable, UnauthorizedException, BadRequestException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import axios from 'axios';
import { RegisterDto, LoginDto, VerifyOtpDto } from './dto/auth.dto';
import { v4 as uuidv4 } from 'uuid';
import Redis from 'ioredis';
import { BullModule } from '@nestjs/bull';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  // For this implementation, we will assume a simple Redis setup using ioredis or bull
  // In a real app we'd inject Redis properly. We use Prisma for now for simplicity,
  // but requirements asked for OtpCode model in DB and Refresh Token in Redis.

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private usersService: UsersService,
    private notificationsService: NotificationsService,
  ) {}

  async register(dto: RegisterDto) {
    const existingUser = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email }, { phone: dto.phone }] }
    });

    if (existingUser) {
      throw new BadRequestException('User with email or phone already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const referralCode = crypto.randomBytes(4).toString('hex').toUpperCase();

    // SureX tag is user-chosen at registration. Normalize to lowercase, strip a
    // leading @, and fall back to a name-based handle if none was provided so
    // every user always has a resolvable tag for in-app sends.
    let surexTag = (dto.surexTag || '').trim().replace(/^@/, '').toLowerCase();
    if (!surexTag) {
      surexTag = `${dto.firstName.replace(/[^a-zA-Z0-9]/g, '')}.${dto.lastName.replace(/[^a-zA-Z0-9]/g, '')}`.toLowerCase();
    }
    const existingTag = await this.prisma.user.findUnique({ where: { surexTag } });
    if (existingTag) {
      throw new BadRequestException(`The SureX tag @${surexTag} is already taken.`);
    }

    let referredById = null;
    if (dto.referralCode) {
      const referrer = await this.prisma.user.findUnique({ where: { referralCode: dto.referralCode } });
      if (referrer) referredById = referrer.id;
    }

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        phone: dto.phone,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        surexTag,
        referralCode,
        referredById,
        wallet: {
          create: {} // Create an empty wallet
        }
      }
    });

    if (referredById) {
      await this.prisma.referral.create({
        data: {
          referrerId: referredById,
          referredId: user.id
        }
      });
    }

    await this.generateAndSendOtp(user.email, 'REGISTER');

    return { message: 'Registration successful, OTP sent' };
  }

  async login(dto: LoginDto, req?: any) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email }
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials or inactive account');
    }

    const isMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isMatch) {
      // Google-created accounts have a random unusable password, so a failed
      // password here means the user must sign in via Google instead.
      if (user.phone.startsWith('google-')) {
        throw new UnauthorizedException('This account was created with Google. Click "Continue with Google" to sign in.');
      }
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.twoFactorEnabled) {
      return {
        message: '2FA required',
        userId: user.id,
        requires2FA: true
      };
    }

    // Record a "new login" notification with device + location so the bell
    // drawer shows real activity (date/time/location) instead of fake entries.
    try {
      const ip = (req?.ip || req?.headers?.['x-forwarded-for'] || 'Unknown').toString();
      const cleanIp = ip.includes(',') ? ip.split(',')[0].trim() : ip;
      const userAgent = req?.headers?.['user-agent'] || '';
      const device = this.parseDevice(userAgent);
      let location = 'Unknown location';
      try {
        const geo = await axios.get(`https://ipwho.is/${encodeURIComponent(cleanIp)}`, { timeout: 3000 });
        if (geo.data?.success) {
          const c = geo.data;
          location = [c.city, c.region, c.country].filter(Boolean).join(', ') || 'Unknown location';
        }
      } catch { /* geolocation is best-effort */ }

      const time = new Date().toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
      });

      await this.notificationsService.createNotification(user.id, {
        title: 'New Login',
        body: `Signed in from ${device} (${location}). ${time}.`,
        type: 'LOGIN',
        data: { ip: cleanIp, device, location, time }
      });
    } catch (err: any) {
      this.logger.error(`Failed to record login notification: ${err.message}`);
    }

    user.role = await this.ensureAdminIfListed(user);
    return this.generateTokens(user);
  }

  private parseDevice(userAgent: string): string {
    if (!userAgent) return 'Unknown device';
    const ua = userAgent.toLowerCase();
    if (ua.includes('iphone')) return 'iPhone';
    if (ua.includes('ipad')) return 'iPad';
    if (ua.includes('android')) return 'Android';
    if (ua.includes('macintosh')) return 'Mac';
    if (ua.includes('windows')) return 'Windows';
    if (ua.includes('linux')) return 'Linux';
    return userAgent.slice(0, 40);
  }

  // Promote accounts listed in ADMIN_EMAILS (comma-separated) the moment they
  // sign in, so there's no boot-order dependency. Idempotent and safe to call
  // on every login.
  private async ensureAdminIfListed(user: { id: string; email: string; role?: string }): Promise<string> {
    const adminEmails = (process.env.ADMIN_EMAILS || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (adminEmails.includes((user.email || '').toLowerCase())) {
      try {
        const updated = await this.prisma.user.update({
          where: { id: user.id },
          data: { role: 'ADMIN' },
          select: { role: true },
        });
        return updated.role;
      } catch {
        // Fall through and keep whatever role they already had
      }
    }
    return user.role || 'USER';
  }

  async generateTokens(user: any) {
    const payload = { sub: user.id, email: user.email };
    
    const accessToken = this.jwtService.sign(payload, {
      expiresIn: '15m'
    });
    
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get('app.jwt.refreshSecret'),
      expiresIn: '7d'
    });

    // In a full implementation, you'd store the refresh token hash in Redis here.
    
    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        kycStatus: user.kycStatus,
        role: user.role,
      }
    };
  }

  async generateAndSendOtp(identifier: string, type: string) {
    // Basic rate limit check could go here
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60000); // 10 mins

    await this.prisma.otpCode.create({
      data: {
        identifier,
        code,
        type,
        expiresAt
      }
    });

    await this.notificationsService.sendOTPEmail(identifier, code);
  }

  // ── Passwordless OTP login (email) ──────────────────────────────────────
  async requestLoginOtp(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email?.toLowerCase().trim() } });
    if (!user || !user.isActive) {
      throw new BadRequestException('No active account found with this email');
    }
    await this.generateAndSendOtp(user.email, 'LOGIN');
    return { message: 'One-time code sent to your email' };
  }

  async verifyLoginOtp(dto: { email: string; code: string }) {
    const identifier = dto.email?.toLowerCase().trim();
    const otpRecord = await this.prisma.otpCode.findFirst({
      where: {
        identifier,
        code: dto.code,
        type: 'LOGIN',
        used: false,
        expiresAt: { gt: new Date() }
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!otpRecord) {
      throw new BadRequestException('Invalid or expired code');
    }

    await this.prisma.otpCode.update({ where: { id: otpRecord.id }, data: { used: true } });

    const user = await this.prisma.user.findUnique({ where: { email: identifier } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('No active account found with this email');
    }

    user.role = await this.ensureAdminIfListed(user);
    return this.generateTokens(user);
  }

  // ── Google OAuth ────────────────────────────────────────────────────────
  googleEnabled(): boolean {
    return Boolean(this.configService.get('app.google.clientId') && this.configService.get('app.google.clientSecret'));
  }

  configFrontendUrl(): string {
    return this.configService.get<string>('app.frontendUrl') || 'http://localhost:3000';
  }

  googleAuthUrl(): string {
    const clientId = this.configService.get<string>('app.google.clientId');
    if (!clientId) throw new BadRequestException('Google OAuth is not configured');
    const redirectUri = `${this.configService.get<string>('app.frontendUrl') || 'http://localhost:3001'}/api/v1/auth/google/callback`;
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      prompt: 'select_account',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async googleCallback(code: string): Promise<{ accessToken: string; refreshToken: string; user: any }> {
    const clientId = this.configService.get<string>('app.google.clientId');
    const clientSecret = this.configService.get<string>('app.google.clientSecret');
    if (!clientId || !clientSecret) throw new BadRequestException('Google OAuth is not configured');
    const redirectUri = `${this.configService.get<string>('app.frontendUrl') || 'http://localhost:3001'}/api/v1/auth/google/callback`;

    // 1. Exchange the authorization code for tokens
    let tokenRes;
    try {
      tokenRes = await axios.post('https://oauth2.googleapis.com/token', new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }).toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 });
    } catch {
      throw new BadRequestException('Google sign-in failed. Please try again.');
    }

    const accessToken = tokenRes.data?.access_token;
    if (!accessToken) throw new BadRequestException('Google sign-in failed. Please try again.');

    // 2. Fetch the user's profile
    let profile;
    try {
      const profileRes = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 10000,
      });
      profile = profileRes.data;
    } catch {
      throw new BadRequestException('Could not fetch your Google profile. Please try again.');
    }

    const email: string = profile?.email?.toLowerCase().trim();
    if (!email) throw new BadRequestException('Your Google account has no verified email.');

    // 3. Find or create the user by email
    let user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      const firstName = profile.given_name || email.split('@')[0] || 'Google';
      const lastName = profile.family_name || 'User';
      let surexTag = `${firstName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}.${lastName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}`;
      let tagTaken = await this.prisma.user.findUnique({ where: { surexTag } });
      if (tagTaken) {
        surexTag = `${surexTag}${Math.floor(Math.random() * 10000)}`;
      }
      user = await this.prisma.user.create({
        data: {
          email,
          phone: `google-${Math.floor(Math.random() * 100000000)}`, // placeholder; editable in admin console
          passwordHash: await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10), // unusable password
          firstName,
          lastName,
          surexTag,
          referralCode: crypto.randomBytes(4).toString('hex').toUpperCase(),
          wallet: { create: {} },
        },
      });
    }

    if (!user.isActive) throw new UnauthorizedException('This account is inactive');

    user.role = await this.ensureAdminIfListed(user);
    const tokens = await this.generateTokens(user);
    return { ...tokens, user: tokens.user };
  }

  async resendOtp(identifier: string, type: string) {
    if (!identifier) {
      throw new BadRequestException('Identifier is required');
    }
    await this.generateAndSendOtp(identifier, type || 'REGISTER');
    return { message: 'OTP resent successfully' };
  }

  async refreshTokens(refreshToken: string) {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is required');
    }

    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get('app.jwt.refreshSecret'),
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user || !user.isActive) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      return this.generateTokens(user);
    } catch (err) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Do not leak whether the email exists
      return { message: 'If the email exists, a reset OTP has been sent' };
    }

    await this.generateAndSendOtp(user.email, 'PASSWORD_RESET');
    return { message: 'If the email exists, a reset OTP has been sent' };
  }

  async resetPassword(token: string, newPassword: string) {
    if (!token || !newPassword) {
      throw new BadRequestException('Token and new password are required');
    }

    // The token here is an OTP code used to authorize the password reset
    const otpRecord = await this.prisma.otpCode.findFirst({
      where: {
        code: token,
        type: 'PASSWORD_RESET',
        used: false,
        expiresAt: { gt: new Date() }
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!otpRecord) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const user = await this.prisma.user.findFirst({
      where: { OR: [{ email: otpRecord.identifier }, { phone: otpRecord.identifier }] }
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash }
    });

    await this.prisma.otpCode.update({
      where: { id: otpRecord.id },
      data: { used: true }
    });

    return { message: 'Password reset successfully' };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const otpRecord = await this.prisma.otpCode.findFirst({
      where: {
        identifier: dto.identifier,
        code: dto.code,
        used: false,
        expiresAt: { gt: new Date() }
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!otpRecord) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    await this.prisma.otpCode.update({
      where: { id: otpRecord.id },
      data: { used: true }
    });

    // Sign the user in after successful verification
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: dto.identifier },
          { phone: dto.identifier },
        ]
      }
    });

    if (!user) {
      return { message: 'OTP verified successfully' };
    }

    const tokens = await this.generateTokens(user);
    return {
      message: 'OTP verified successfully',
      ...tokens,
    };
  }
}
