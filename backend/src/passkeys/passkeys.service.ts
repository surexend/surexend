import { Injectable, BadRequestException, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import {
  generateRegistrationOptions,
  generateAuthenticationOptions,
  verifyRegistrationResponse,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  AuthenticatorTransport,
} from '@simplewebauthn/types';
import Redis from 'ioredis';
import * as crypto from 'crypto';

const CHALLENGE_TTL = 300; // seconds

@Injectable()
export class PasskeysService {
  private readonly logger = new Logger(PasskeysService.name);
  private redis: Redis | null = null;
  private memStore = new Map<string, { challenge: string; expiresAt: number }>();

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private jwtService: JwtService,
  ) {}

  private getRedis(): Redis | null {
    if (this.redis) return this.redis;
    try {
      this.redis = new Redis(this.configService.get<string>('app.redisUrl') || 'redis://localhost:6379');
      this.redis.on('error', () => { this.redis = null; });
    } catch {
      this.redis = null;
    }
    return this.redis;
  }

  private async saveChallenge(key: string, challenge: string) {
    const redis = this.getRedis();
    if (redis) {
      await redis.set(key, challenge, 'EX', CHALLENGE_TTL).catch(() => {});
      return;
    }
    this.memStore.set(key, { challenge, expiresAt: Date.now() + CHALLENGE_TTL * 1000 });
  }

  private async getChallenge(key: string): Promise<string | null> {
    const redis = this.getRedis();
    if (redis) {
      const value = await redis.get(key).catch(() => null);
      if (value) {
        await redis.del(key).catch(() => {});
        return value;
      }
    }
    const entry = this.memStore.get(key);
    if (!entry) return null;
    this.memStore.delete(key);
    if (entry.expiresAt < Date.now()) return null;
    return entry.challenge;
  }

  private webauthnConfig() {
    const webauthn = this.configService.get<{ rpId: string; rpName: string; origin: string }>('app.webauthn');
    return {
      rpID: webauthn?.rpId || 'localhost',
      rpName: webauthn?.rpName || 'SureXend',
      origin: webauthn?.origin || 'http://localhost:3000',
    };
  }

  private async userPasskeys(userId: string) {
    return this.prisma.passkey.findMany({ where: { userId } });
  }

  private transportsOf(rawTransports: string | null): AuthenticatorTransport[] {
    try {
      const parsed = JSON.parse(rawTransports || '[]');
      return Array.isArray(parsed)
        ? parsed.filter((t) => typeof t === 'string') as AuthenticatorTransport[]
        : [];
    } catch {
      return [];
    }
  }

  // ── Registration (enrolling a device while signed in) ───────────────────
  async registerBegin(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');

    const { rpID, rpName } = this.webauthnConfig();
    const existing = await this.userPasskeys(userId);
    const options = await generateRegistrationOptions({
      rpID,
      rpName,
      userName: user.email,
      userDisplayName: `${user.firstName} ${user.lastName}`.trim() || user.email,
      userID: Buffer.from(user.id, 'utf8'),
      attestationType: 'none',
      authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
      excludeCredentials: existing.map((p) => ({ id: p.credentialId })),
      timeout: 120000,
    });

    await this.saveChallenge(`passkey:register:${userId}`, options.challenge);
    return options;
  }

  async registerComplete(userId: string, response: RegistrationResponseJSON, deviceName?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');

    const challenge = await this.getChallenge(`passkey:register:${userId}`);
    if (!challenge) throw new BadRequestException('Registration challenge expired or not found. Please try again.');

    const { origin, rpID } = this.webauthnConfig();
    let verification;
    try {
      verification = await verifyRegistrationResponse({ response, expectedChallenge: challenge, expectedOrigin: origin, expectedRPID: rpID });
    } catch (err) {
      throw new BadRequestException(`Biometric registration failed: ${(err as Error).message}`);
    }
    if (!verification.verified || !verification.registrationInfo) {
      throw new BadRequestException('Biometric registration was not verified');
    }

const credential = verification.registrationInfo.credential;
    const credentialId = credential.id;
    const existing = await this.prisma.passkey.findUnique({ where: { credentialId } });
    if (existing) {
      throw new BadRequestException('This biometric has already been registered on your account');
    }

    await this.prisma.passkey.create({
      data: {
        userId,
        credentialId,
        publicKey: isoBase64URL.fromBuffer(credential.publicKey),
        counter: credential.counter ?? 0,
        transports: JSON.stringify(credential.transports ?? []),
        deviceName: deviceName?.slice(0, 80) || 'My device',
      },
    });

    return { success: true, message: 'Biometric registered successfully' };
  }

  // ── Sign-in (login with a passkey) ───────────────────────────────────────
  async loginBegin(email?: string) {
    const challengeId = crypto.randomBytes(16).toString('hex');
    const { rpID } = this.webauthnConfig();

    let allowCredentials: { id: string; type: 'public-key' }[] = [];
    if (email) {
      const user = await this.prisma.user.findUnique({ where: { email: (email || '').toLowerCase().trim() } });
      if (user) {
        const passkeys = await this.userPasskeys(user.id);
        allowCredentials = passkeys.map((p) => ({
          id: p.credentialId,
          type: 'public-key' as const,
          transports: this.transportsOf(p.transports),
        }));
      }
    }

    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials,
      userVerification: 'preferred',
      timeout: 120000,
    });

    await this.saveChallenge(`passkey:login:${challengeId}`, options.challenge);
    return { options, challengeId };
  }

  async loginComplete(challengeId: string, response: AuthenticationResponseJSON) {
    if (!challengeId) throw new BadRequestException('Missing challengeId');
    const challenge = await this.getChallenge(`passkey:login:${challengeId}`);
    if (!challenge) throw new BadRequestException('Sign-in challenge expired. Please try again.');

    const passkey = await this.prisma.passkey.findUnique({ where: { credentialId: response.id } });
    if (!passkey) throw new UnauthorizedException('This biometric is not registered on any account');

    const user = await this.prisma.user.findUnique({ where: { id: passkey.userId } });
    if (!user || !user.isActive) throw new UnauthorizedException('Account not found or inactive');

    const { origin, rpID } = this.webauthnConfig();
    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        credential: { id: passkey.credentialId, publicKey: isoBase64URL.toBuffer(passkey.publicKey), counter: passkey.counter },
      });
    } catch (err) {
      throw new UnauthorizedException(`Biometric sign-in failed: ${(err as Error).message}`);
    }
    if (!verification.verified) throw new UnauthorizedException('Biometric sign-in was not verified');

    await this.prisma.passkey.update({
      where: { id: passkey.id },
      data: { counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date() },
    });

    return this.issueTokens(user);
  }

  private issueTokens(user: any) {
    const payload = { sub: user.id, email: user.email };
    const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' });
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('app.jwt.refreshSecret'),
      expiresIn: '7d',
    });
    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        kycStatus: user.kycStatus,
        role: user.role || 'USER',
      },
    };
  }

  // ── Transaction approval (Face ID / fingerprint instead of PIN) ──────────
  async approveBegin(userId: string) {
    const passkeys = await this.userPasskeys(userId);
    if (passkeys.length === 0) {
      throw new BadRequestException('No biometric registered. Enroll one in Settings > Biometrics first.');
    }
    const { rpID } = this.webauthnConfig();
    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: passkeys.map((p) => ({
        id: p.credentialId,
        type: 'public-key' as const,
        transports: this.transportsOf(p.transports),
      })),
      userVerification: 'preferred',
      timeout: 120000,
    });
    await this.saveChallenge(`passkey:approve:${userId}`, options.challenge);
    return options;
  }

  async approveComplete(userId: string, response: AuthenticationResponseJSON) {
    const challenge = await this.getChallenge(`passkey:approve:${userId}`);
    if (!challenge) throw new BadRequestException('Approval challenge expired. Please try again.');

    const passkey = await this.prisma.passkey.findUnique({ where: { credentialId: response.id } });
    if (!passkey || passkey.userId !== userId) {
      throw new UnauthorizedException('This biometric is not registered on your account');
    }

    const { origin, rpID } = this.webauthnConfig();
    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        credential: { id: passkey.credentialId, publicKey: isoBase64URL.toBuffer(passkey.publicKey), counter: passkey.counter },
      });
    } catch (err) {
      throw new UnauthorizedException(`Biometric approval failed: ${(err as Error).message}`);
    }
    if (!verification.verified) throw new UnauthorizedException('Biometric approval was not verified');

    await this.prisma.passkey.update({
      where: { id: passkey.id },
      data: { counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date() },
    });

    // Short-lived, single-purpose token consumed by the transaction-auth flow
    const passkeyToken = this.jwtService.sign(
      { sub: userId, purpose: 'transaction' },
      { expiresIn: '2m' },
    );
    return { passkeyToken };
  }

  // ── Device management ────────────────────────────────────────────────────
  async listDevices(userId: string) {
    const devices = await this.prisma.passkey.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return devices.map((d) => ({
      id: d.id,
      deviceName: d.deviceName,
      lastUsedAt: d.lastUsedAt,
      createdAt: d.createdAt,
    }));
  }

  async removeDevice(userId: string, id: string) {
    const device = await this.prisma.passkey.findFirst({ where: { id, userId } });
    if (!device) throw new BadRequestException('Device not found');
    await this.prisma.passkey.delete({ where: { id } });
    return { success: true, message: 'Biometric removed' };
  }
}
