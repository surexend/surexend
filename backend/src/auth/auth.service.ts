import { Injectable, UnauthorizedException, BadRequestException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import axios from 'axios';
import * as speakeasy from 'speakeasy';
import { RegisterDto, LoginDto, VerifyOtpDto } from './dto/auth.dto';
import { RefreshSessionService } from './refresh-session.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private notificationsService: NotificationsService,
    private refreshSessionService: RefreshSessionService,
  ) {}

  private normalizeIdentifier(identifier: string) {
    return String(identifier || '').trim().toLowerCase();
  }

  private normalizePhone(phone: string) {
    return String(phone || '').trim();
  }

  private assertStrongPassword(password: string) {
    if (
      typeof password !== 'string' ||
      password.length < 8 ||
      password.length > 128 ||
      !/[a-z]/.test(password) ||
      !/[A-Z]/.test(password) ||
      !/[0-9]/.test(password)
    ) {
      throw new BadRequestException('Password must be 8–128 characters and include uppercase, lowercase, and a number');
    }
  }

  private otpDigest(identifier: string, type: string, code: string): string {
    const secret = this.configService.get<string>('app.jwt.secret');
    if (!secret) throw new Error('JWT_SECRET is not configured');
    return crypto
      .createHmac('sha256', secret)
      .update(`${type}:${this.normalizeIdentifier(identifier)}:${String(code).trim()}`)
      .digest('hex');
  }

  private otpMatches(record: { codeHash?: string | null; code?: string | null }, identifier: string, type: string, code: string): boolean {
    const expected = this.otpDigest(identifier, type, code);
    if (record.codeHash) {
      const actual = Buffer.from(record.codeHash, 'hex');
      const wanted = Buffer.from(expected, 'hex');
      return actual.length === wanted.length && crypto.timingSafeEqual(actual, wanted);
    }
    // One-time compatibility path for rows created before the hash migration.
    // New OTPs never persist the raw code.
    if (!record.code) return false;
    const actual = Buffer.from(String(record.code));
    const wanted = Buffer.from(String(code).trim());
    return actual.length === wanted.length && crypto.timingSafeEqual(actual, wanted);
  }

  private async findMatchingOtp(identifier: string, type: string, code: string) {
    const candidates = await this.prisma.otpCode.findMany({
      where: {
        identifier: this.normalizeIdentifier(identifier),
        type,
        used: false,
        attempts: { lt: 5 },
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    const match = candidates.find((candidate) => this.otpMatches(candidate, identifier, type, code)) || null;
    if (!match) {
      await this.prisma.otpCode.updateMany({
        where: { identifier: this.normalizeIdentifier(identifier), type, used: false, expiresAt: { gt: new Date() } },
        data: { attempts: { increment: 1 } },
      });
    }
    return match;
  }

  private buildLoginChallengeToken(userId: string) {
    return this.jwtService.sign(
      { sub: userId, purpose: '2fa-login' },
      { expiresIn: '5m' },
    );
  }

  async register(dto: RegisterDto) {
    const email = this.normalizeIdentifier(dto.email);
    const phone = this.normalizePhone(dto.phone);

    const existingUser = await this.prisma.user.findFirst({
      where: { OR: [{ email }, { phone }] }
    });

    if (existingUser) {
      throw new BadRequestException('User with email or phone already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
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

    let referrer: { id: string; firstName: string } | null = null;
    const submittedReferralCode = dto.referralCode?.trim().toUpperCase();
    if (submittedReferralCode) {
      referrer = await this.prisma.user.findUnique({
        where: { referralCode: submittedReferralCode },
        select: { id: true, firstName: true },
      });
      if (!referrer) {
        throw new BadRequestException('This referral code is invalid or no longer available');
      }
    }

    const user = await this.prisma.user.create({
      data: {
        email,
        phone,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        surexTag,
        referralCode,
        referredById: referrer?.id || null,
        wallet: {
          create: {} // Create an empty wallet
        }
      }
    });

    if (referrer) {
      await this.prisma.referral.create({
        data: {
          referrerId: referrer.id,
          referredId: user.id
        }
      });

      await this.notificationsService.createNotification(referrer.id, {
        title: 'A friend joined with your invite',
        body: `${user.firstName} ${user.lastName} signed up using your referral code.`,
        type: 'REFERRAL',
        data: { referredUserId: user.id },
      });
    }

    const otpDelivered = await this.generateAndSendOtp(email, 'REGISTER');

    return { message: 'Registration successful, OTP sent', otpDelivered };
  }

  async login(dto: LoginDto, req?: any) {
    const email = this.normalizeIdentifier(dto.email);
    const user = await this.prisma.user.findUnique({
      where: { email }
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
        requires2FA: true,
        challengeToken: this.buildLoginChallengeToken(user.id),
      };
    }

    await this.recordLoginNotification(user.id, req);

    user.role = await this.ensureAdminIfListed(user);
    return this.generateTokens(user);
  }

  private async recordLoginNotification(userId: string, req?: any) {
    try {
      const ip = (req?.ip || req?.headers?.['x-forwarded-for'] || 'Unknown').toString();
      const cleanIp = ip.includes(',') ? ip.split(',')[0].trim() : ip;
      const userAgent = req?.headers?.['user-agent'] || '';
      const device = this.parseDevice(userAgent);
      const location = 'Location unavailable';

      const time = new Date().toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
      });

      await this.notificationsService.createNotification(userId, {
        title: 'New Login',
        body: `Signed in from ${device} (${location}). ${time}.`,
        type: 'LOGIN',
        data: { ip: cleanIp, device, location, time }
      });
    } catch (err: any) {
      this.logger.error(`Failed to record login notification: ${err.message}`);
    }
  }

  async verifyTwoFactorLogin(challengeToken: string, code: string, req?: any) {
    if (!challengeToken || !code) {
      throw new BadRequestException('Challenge token and 2FA code are required');
    }

    let payload: any;
    try {
      payload = this.jwtService.verify(challengeToken);
    } catch {
      throw new UnauthorizedException('2FA challenge expired. Please sign in again.');
    }

    if (payload?.purpose !== '2fa-login' || !payload?.sub) {
      throw new UnauthorizedException('Invalid 2FA challenge');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive || !user.twoFactorEnabled || !user.twoFactorSecret) {
      throw new UnauthorizedException('2FA is not available for this account');
    }

    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: String(code).trim(),
      window: 1,
    });

    if (!verified) {
      throw new UnauthorizedException('Invalid 2FA code');
    }

    await this.recordLoginNotification(user.id, req);
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

    const refreshJti = crypto.randomBytes(16).toString('hex');
    const refreshToken = this.jwtService.sign(
      { ...payload, type: 'refresh', jti: refreshJti },
      {
        secret: this.configService.get('app.jwt.refreshSecret'),
        expiresIn: '7d'
      }
    );

    await this.refreshSessionService.create(user.id, refreshJti, refreshToken, this.refreshSessionService.ttlSeconds());

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

  async generateAndSendOtp(identifier: string, type: string): Promise<boolean> {
    const normalizedIdentifier = this.normalizeIdentifier(identifier);
    const recentAttempts = await this.prisma.otpCode.count({
      where: {
        identifier: normalizedIdentifier,
        type,
        createdAt: { gt: new Date(Date.now() - 10 * 60_000) },
      },
    });

    if (recentAttempts >= 3) {
      throw new BadRequestException('Too many codes requested. Please wait a few minutes before trying again.');
    }

    const code = crypto.randomInt(100000, 1000000).toString();
    const codeHash = this.otpDigest(normalizedIdentifier, type, code);
    const expiresAt = new Date(Date.now() + 10 * 60000);

    await this.prisma.otpCode.updateMany({
      where: {
        identifier: normalizedIdentifier,
        type,
        used: false,
      },
      data: { used: true },
    });

    await this.prisma.otpCode.create({
      data: {
        identifier: normalizedIdentifier,
        code: null,
        codeHash,
        type,
        expiresAt
      }
    });

    return this.notificationsService.sendOTPEmail(normalizedIdentifier, code);
  }

  // ── Passwordless OTP login (email) ──────────────────────────────────────
  async requestLoginOtp(email: string) {
    const normalizedEmail = this.normalizeIdentifier(email);
    const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    // Keep passwordless login enumeration-resistant. The same response is
    // returned whether or not an active account exists.
    if (user?.isActive) await this.generateAndSendOtp(user.email, 'LOGIN');
    return { message: 'If the email belongs to an active account, a one-time code has been sent' };
  }

  async verifyLoginOtp(dto: { email: string; code: string }, req?: any) {
    const identifier = this.normalizeIdentifier(dto.email);
    const otpRecord = await this.findMatchingOtp(identifier, 'LOGIN', dto.code);
    if (!otpRecord) {
      throw new BadRequestException('Invalid or expired code');
    }

    const consumed = await this.prisma.otpCode.updateMany({
      where: { id: otpRecord.id, used: false },
      data: { used: true },
    });
    if (consumed.count !== 1) throw new BadRequestException('Invalid or expired code');

    const user = await this.prisma.user.findUnique({ where: { email: identifier } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('No active account found with this email');
    }

    await this.recordLoginNotification(user.id, req);
    user.role = await this.ensureAdminIfListed(user);
    if (user.twoFactorEnabled) {
      return {
        message: '2FA required',
        requires2FA: true,
        challengeToken: this.buildLoginChallengeToken(user.id),
      };
    }
    return this.generateTokens(user);
  }

  // ── Google OAuth ────────────────────────────────────────────────────────
  googleEnabled(): boolean {
    return Boolean(this.configService.get('app.google.clientId') && this.configService.get('app.google.clientSecret'));
  }

  configFrontendUrl(): string {
    return this.configService.get<string>('app.frontendUrl') || 'http://localhost:3000';
  }

  createGoogleOAuthState(): string {
    return this.jwtService.sign(
      { purpose: 'google-oauth', nonce: crypto.randomBytes(16).toString('hex') },
      { expiresIn: '10m' },
    );
  }

  googleAuthUrl(state: string): string {
    const clientId = this.configService.get<string>('app.google.clientId');
    if (!clientId) throw new BadRequestException('Google OAuth is not configured');
    const redirectUri = `${this.configService.get<string>('app.frontendUrl') || 'http://localhost:3001'}/api/v1/auth/google/callback`;
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      prompt: 'select_account',
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async googleCallback(code: string, state: string): Promise<{ accessToken: string; refreshToken: string; user: any }> {
    try {
      const statePayload = this.jwtService.verify(state, { secret: this.configService.get('app.jwt.secret') });
      if (statePayload?.purpose !== 'google-oauth') throw new Error('Invalid OAuth state');
    } catch {
      throw new BadRequestException('Google sign-in session expired. Please try again.');
    }
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
          phone: `google-${crypto.randomInt(10000000, 100000000)}`, // placeholder; editable in admin console
          passwordHash: await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 12), // unusable password
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
    const normalizedType = String(type || 'REGISTER').toUpperCase();
    if (!['REGISTER', 'LOGIN', 'PASSWORD_RESET'].includes(normalizedType)) {
      throw new BadRequestException('Unsupported OTP type');
    }
    const otpDelivered = await this.generateAndSendOtp(identifier, normalizedType);
    return { message: 'OTP resent successfully', otpDelivered };
  }

  async refreshTokens(refreshToken: string) {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is required');
    }

    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get('app.jwt.refreshSecret'),
      }) as { sub?: string; type?: string; jti?: string };

      if (payload?.type !== 'refresh' || !payload?.sub || !payload?.jti) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const validSession = await this.refreshSessionService.validate(payload.sub, payload.jti, refreshToken);
      if (!validSession) {
        throw new UnauthorizedException('Refresh token has been revoked');
      }

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user || !user.isActive) {
        await this.refreshSessionService.revoke(payload.jti, payload.sub);
        throw new UnauthorizedException('Invalid refresh token');
      }

      user.role = await this.ensureAdminIfListed(user);
      await this.refreshSessionService.revoke(payload.jti, payload.sub);
      return this.generateTokens(user);
    } catch (err) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  async logout(refreshToken?: string) {
    if (refreshToken) {
      try {
        const payload = this.jwtService.verify(refreshToken, {
          secret: this.configService.get('app.jwt.refreshSecret'),
        }) as { sub?: string; jti?: string; type?: string };
        if (payload?.type === 'refresh' && payload?.jti) {
          await this.refreshSessionService.revoke(payload.jti, payload.sub);
        }
      } catch {
        // Already expired or invalid — treat as logged out.
      }
    }
    return { message: 'Logged out successfully' };
  }

  async forgotPassword(email: string) {
    const normalizedEmail = this.normalizeIdentifier(email);
    const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) {
      // Do not leak whether the email exists
      return { message: 'If the email exists, a reset OTP has been sent' };
    }

    await this.generateAndSendOtp(user.email, 'PASSWORD_RESET');
    return { message: 'If the email exists, a reset OTP has been sent' };
  }

  async resetPassword(token: string, newPassword: string, email?: string) {
    if (!token || !newPassword) {
      throw new BadRequestException('Token and new password are required');
    }
    this.assertStrongPassword(newPassword);

    // The token here is an OTP code used to authorize the password reset.
    // The identifier is stored on the OTP row, so compare against the hashed
    // code without ever persisting the submitted value.
    const otpRecord = email
      ? await this.findMatchingOtp(email, 'PASSWORD_RESET', token)
      : (await this.prisma.otpCode.findMany({
          where: { type: 'PASSWORD_RESET', used: false, attempts: { lt: 5 }, expiresAt: { gt: new Date() } },
          orderBy: { createdAt: 'desc' },
          take: 25,
        })).find((candidate) => this.otpMatches(candidate, candidate.identifier, 'PASSWORD_RESET', token)) || null;
    if (!otpRecord) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    // Claim the OTP before changing credentials. Two concurrent reset requests
    // must not both pass the pre-read and then race to rewrite the password.
    const consumed = await this.prisma.otpCode.updateMany({
      where: { id: otpRecord.id, used: false, attempts: { lt: 5 } },
      data: { used: true },
    });
    if (consumed.count !== 1) throw new BadRequestException('Invalid or expired reset token');

    const identifier = this.normalizeIdentifier(otpRecord.identifier);
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ email: identifier }, { phone: identifier }] }
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash }
    });
    await this.refreshSessionService.revokeAllForUser(user.id);

    return { message: 'Password reset successfully' };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const identifier = this.normalizeIdentifier(dto.identifier);
    // Registration verification must not accept a LOGIN or PASSWORD_RESET
    // code. The previous query omitted type, allowing a valid recovery OTP to
    // become a full login token.
    const otpRecord = await this.findMatchingOtp(identifier, 'REGISTER', dto.code);
    if (!otpRecord) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    const consumed = await this.prisma.otpCode.updateMany({
      where: { id: otpRecord.id, used: false },
      data: { used: true },
    });
    if (consumed.count !== 1) throw new BadRequestException('Invalid or expired OTP');

    // Sign the user in after successful verification
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: identifier },
          { phone: identifier },
        ]
      }
    });

    if (!user) {
      return { message: 'OTP verified successfully' };
    }

    user.role = await this.ensureAdminIfListed(user);
    const tokens = await this.generateTokens(user);
    return {
      message: 'OTP verified successfully',
      ...tokens,
    };
  }
}
