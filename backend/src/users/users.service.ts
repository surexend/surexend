import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import * as speakeasy from 'speakeasy';
import * as qrcode from 'qrcode';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async getProfile(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        kycTier: true,
        kycStatus: true,
        referralCode: true,
        twoFactorEnabled: true,
        createdAt: true,
        isActive: true,
      }
    });
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
          select: { id: true, tier: true, status: true, type: true, rejectionReason: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    return {
      tier: user?.kycTier ?? 0,
      status: user?.kycStatus ?? 'UNVERIFIED',
      limits: {
        dailyWithdrawal: user?.kycTier === 0 ? '1,000 USDT' : user?.kycTier === 1 ? '5,000 USDT' : '50,000 USDT',
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
