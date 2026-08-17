import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import axios from 'axios';
import * as crypto from 'crypto';

// Local-currency funding via Flutterwave VNUBAN virtual accounts. Each user
// gets a permanent dedicated bank account number; when they transfer to it,
// Flutterwave fires a charge.completed webhook and the webhooks service credits
// their local-currency wallet automatically (see WebhooksService).
@Injectable()
export class LocalFundingService {
  private readonly logger = new Logger(LocalFundingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  private get secretKey(): string {
    return this.configService.get<string>('app.flutterwave.secretKey') || '';
  }

  // Returns the user's dedicated bank account, creating it via Flutterwave on
  // first request. If Flutterwave isn't configured yet, returns a helpful
  // "configured: false" so the app falls back to the manual deposit flow.
  async getOrCreateAccount(userId: string) {
    const existing = await this.prisma.virtualAccount.findFirst({
      where: { userId, isActive: true },
    });
    if (existing) {
      return { configured: true, account: this.toDto(existing) };
    }

    if (!this.secretKey) {
      return {
        configured: false,
        message: 'Bank deposits are being set up. Contact support to fund your local wallet for now.',
      };
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new BadRequestException('User not found');

    const reference = `VA-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
    // Google-created accounts carry a placeholder phone ("google-...") that
    // Flutterwave would reject, so only send a real-looking number.
    const phone = /^\+?\d[\d\s-]{6,}$/.test(user.phone || '') ? user.phone : undefined;

    try {
      const response = await axios.post(
        'https://api.flutterwave.com/v3/virtual-account-numbers',
        {
          email: user.email,
          is_permanent: true,
          tx_ref: reference,
          phonenumber: phone,
          firstname: user.firstName,
          lastname: user.lastName,
          narration: `SureXend ${user.surexTag || reference}`,
        },
        {
          headers: { Authorization: `Bearer ${this.secretKey}`, 'Content-Type': 'application/json' },
          timeout: 20000,
        },
      );
      const data = response.data?.data;
      if (!data || !data.account_number) {
        this.logger.error(`Flutterwave VNUBAN create failed: ${JSON.stringify(response.data)}`);
        throw new BadRequestException('Could not create your bank account. Please try again or contact support.');
      }

      const account = await this.prisma.virtualAccount.create({
        data: {
          userId,
          provider: 'FLUTTERWAVE',
          reference,
          accountNumber: String(data.account_number),
          accountName: data.account_name || 'SureXend User',
          bankName: data.bank_name || 'Providus Bank',
          bankCode: data.bank_code || '',
          currency: 'NGN',
        },
      });

      return { configured: true, account: this.toDto(account) };
    } catch (err: any) {
      this.logger.error(`Flutterwave VNUBAN create error: ${err.message}`);
      throw new BadRequestException(
        err.response?.data?.message || 'Could not create your bank account. Please try again later.',
      );
    }
  }

  private toDto(a: any) {
    return {
      accountNumber: a.accountNumber,
      accountName: a.accountName,
      bankName: a.bankName,
      bankCode: a.bankCode,
      currency: a.currency,
      reference: a.reference,
    };
  }
}