import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import * as speakeasy from 'speakeasy';
import * as qrcode from 'qrcode';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        avatar: true,
        surexTag: true,
        kycTier: true,
        kycStatus: true,
        referralCode: true,
        twoFactorEnabled: true,
        currencyDisplay: true,
        defaultWallet: true,
        createdAt: true,
        isActive: true,
        role: true,
        pin: true,
      }
    });

    if (!user) return null;

    // Lazy-backfill a SureX tag for users who registered before the tag system
    // shipped, so tag sends always have a resolvable handle.
    if (!user.surexTag) {
      const base = `${user.firstName.replace(/[^a-zA-Z0-9]/g, '')}.${user.lastName.replace(/[^a-zA-Z0-9]/g, '')}`.toLowerCase();
      let tag = base;
      let n = 1;
      while (await this.prisma.user.findUnique({ where: { surexTag: tag } })) {
        n += 1;
        tag = `${base}${n}`;
      }
      await this.prisma.user.update({ where: { id: userId }, data: { surexTag: tag } });
      user.surexTag = tag;
    }

    const { pin, ...profile } = user;
    const passkeyCount = await this.prisma.passkey.count({ where: { userId } });
    return { ...profile, pinSet: !!pin, passkeysEnabled: passkeyCount > 0 };
  }

  async updateProfile(
    userId: string,
    profile: { firstName?: string; lastName?: string; avatar?: string | null },
  ) {
    const data: { firstName?: string; lastName?: string; avatar?: string | null } = {};
    if (profile.firstName !== undefined) {
      const firstName = profile.firstName.trim();
      if (!firstName) throw new BadRequestException('First name is required');
      data.firstName = firstName;
    }
    if (profile.lastName !== undefined) data.lastName = profile.lastName.trim();
    if (profile.avatar !== undefined) {
      if (profile.avatar !== null && !profile.avatar.startsWith('data:image/')) {
        throw new BadRequestException('Invalid avatar image');
      }
      data.avatar = profile.avatar;
    }
    if (!Object.keys(data).length) return { message: 'No profile changes to update' };
    await this.prisma.user.update({ where: { id: userId }, data });
    return { message: 'Profile updated successfully' };
  }

  async updatePreferences(
    userId: string,
    prefs: { currencyDisplay?: string; defaultWallet?: string },
  ) {
    const data: { currencyDisplay?: string; defaultWallet?: string } = {};
    if (prefs.currencyDisplay !== undefined) data.currencyDisplay = prefs.currencyDisplay;
    if (prefs.defaultWallet !== undefined) data.defaultWallet = prefs.defaultWallet;
    if (Object.keys(data).length === 0) {
      return { message: 'No preferences to update' };
    }

    await this.prisma.user.update({ where: { id: userId }, data });
    return { message: 'Preferences updated successfully' };
  }

  async setupPin(userId: string, pin: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (user.pin) {
      throw new BadRequestException('PIN is already set up. Use change-pin instead.');
    }

    if (pin.length !== 4 || !/^\d+$/.test(pin)) {
      throw new BadRequestException('PIN must be exactly 4 digits');
    }

    const hashedPin = await bcrypt.hash(pin, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { pin: hashedPin }
    });

    return { message: 'PIN set up successfully' };
  }

  async changePin(userId: string, currentPin: string, newPin: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    
    if (!user.pin) {
      throw new BadRequestException('PIN is not set up yet');
    }

    const isMatch = await bcrypt.compare(currentPin, user.pin);
    if (!isMatch) {
      throw new BadRequestException('Invalid current PIN');
    }

    if (newPin.length !== 4 || !/^\d+$/.test(newPin)) {
      throw new BadRequestException('New PIN must be exactly 4 digits');
    }

    const hashedPin = await bcrypt.hash(newPin, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { pin: hashedPin }
    });

    return { message: 'PIN changed successfully' };
  }

  async setup2FA(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (user.twoFactorEnabled) {
      throw new BadRequestException('2FA is already enabled');
    }

    const secret = speakeasy.generateSecret({
      name: `SureXend (${user.email})`
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: secret.base32 }
    });

    const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url);

    return {
      secret: secret.base32,
      qrCodeUrl
    };
  }

  async verify2FA(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user.twoFactorSecret) {
      throw new BadRequestException('2FA is not set up');
    }

    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: code
    });

    if (!verified) {
      throw new BadRequestException('Invalid 2FA code');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true }
    });

    return { message: '2FA enabled successfully' };
  }

  async getKycStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        kycTier: true,
        kycStatus: true,
        kycDocuments: {
          select: { id: true, status: true, type: true, rejectionReason: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    const status = user?.kycStatus ?? 'UNVERIFIED';

    return {
      status,
      isVerified: status === 'VERIFIED',
      limits: {
        dailyWithdrawal: status === 'VERIFIED' ? '50,000 USDT' : '1,000 USDT',
      },
      latestDocument: user?.kycDocuments?.[0] ?? null,
    };
  }

  async submitKyc(userId: string, tier: number, documentUrl: string, type: string) {
    // In a real implementation, we'd call Smile Identity here
    const kycDoc = await this.prisma.kycDocument.create({
      data: {
        userId,
        tier,
        type,
        documentUrl,
        status: 'PENDING'
      }
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { kycStatus: 'PENDING' }
    });

    return { message: 'KYC submitted successfully', kycDoc };
  }
}
