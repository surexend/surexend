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

  private get ppApiKey(): string {
    return this.configService.get<string>('app.paymentpoint.apiKey') || '';
  }

  private get ppSecretKey(): string {
    return this.configService.get<string>('app.paymentpoint.secretKey') || '';
  }

  private get ppBusinessId(): string {
    return this.configService.get<string>('app.paymentpoint.businessId') || '';
  }

  private get ppBaseUrl(): string {
    return this.configService.get<string>('app.paymentpoint.baseUrl') || 'https://api.paymentpoint.co/api/v1';
  }

  private get flwSecretKey(): string {
    return this.configService.get<string>('app.flutterwave.secretKey') || '';
  }

  // Returns the user's dedicated bank account, creating it via PaymentPoint (or Flutterwave fallback) on
  // first request. If neither is configured yet, returns "configured: false".
  async getOrCreateAccount(userId: string) {
    const existing = await this.prisma.virtualAccount.findFirst({
      where: { userId, isActive: true },
    });
    if (existing) {
      return { configured: true, account: this.toDto(existing) };
    }

    const hasPaymentPoint = !!(this.ppApiKey || this.ppSecretKey);
    const hasFlutterwave = !!this.flwSecretKey;

    if (!hasPaymentPoint && !hasFlutterwave) {
      return {
        configured: false,
        message: 'Bank deposits are being set up. Contact support to fund your local wallet for now.',
      };
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new BadRequestException('User not found');

    const reference = `VA-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
    const phone = /^\+?\d[\d\s-]{6,}$/.test(user.phone || '') ? user.phone : undefined;

    // 1. Try PaymentPoint first
    if (hasPaymentPoint) {
      try {
        const payload = {
          name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'SureXend User',
          email: user.email,
          phoneNumber: phone || '08000000000',
          bankCode: ['20946', '20897'],
          businessId: this.ppBusinessId,
        };

        const response = await axios.post(
          `${this.ppBaseUrl}/createVirtualAccount`,
          payload,
          {
            headers: {
              Authorization: `Bearer ${this.ppSecretKey || this.ppApiKey}`,
              'api-key': this.ppApiKey || this.ppSecretKey,
              'Content-Type': 'application/json',
            },
            timeout: 20000,
          },
        );

        const resData = response.data;
        const acctData = resData?.data || resData?.account || resData;
        const acctObj = Array.isArray(acctData) ? acctData[0] : acctData;

        const accountNumber = acctObj?.accountNumber || acctObj?.account_number || acctObj?.account_no;
        if (accountNumber) {
          const account = await this.prisma.virtualAccount.create({
            data: {
              userId,
              provider: 'PAYMENTPOINT',
              reference,
              accountNumber: String(accountNumber),
              accountName: acctObj?.accountName || acctObj?.account_name || `${user.firstName} ${user.lastName}`,
              bankName: acctObj?.bankName || acctObj?.bank_name || 'PalmPay',
              bankCode: String(acctObj?.bankCode || acctObj?.bank_code || '20946'),
              currency: 'NGN',
            },
          });
          return { configured: true, account: this.toDto(account) };
        }
      } catch (ppErr: any) {
        this.logger.error(`PaymentPoint VNUBAN create error: ${ppErr.response?.data?.message || ppErr.message}`);
        if (!hasFlutterwave) {
          throw new BadRequestException(
            ppErr.response?.data?.message || 'Could not generate virtual bank account. Please check your details or try again later.',
          );
        }
      }
    }

    // 2. Fallback to Flutterwave if configured
    if (hasFlutterwave) {
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
            headers: { Authorization: `Bearer ${this.flwSecretKey}`, 'Content-Type': 'application/json' },
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