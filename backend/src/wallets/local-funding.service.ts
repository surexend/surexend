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

    // PaymentPoint requires exactly 11-digit local Nigerian format (07XXXXXXXXX).
    // Strip any international prefix (+234 or 234) and convert to local format.
    const normalizeNigerianPhone = (raw?: string | null): string => {
      if (!raw) return '08000000000';
      const digits = raw.replace(/[^\d]/g, ''); // strip +, spaces, dashes
      if (digits.startsWith('234') && digits.length === 13) return '0' + digits.slice(3);
      if (digits.length === 11 && digits.startsWith('0')) return digits;
      if (digits.length === 10) return '0' + digits; // rare: already dropped leading 0
      return '08000000000'; // safe fallback
    };

    // 1. Try PaymentPoint first
    if (hasPaymentPoint) {
      try {
        const payload = {
          name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'SureXend User',
          email: user.email,
          phoneNumber: normalizeNigerianPhone(phone),
          bankCode: ['20946', '20897'],
          businessId: this.ppBusinessId,
        };

        this.logger.log(`PaymentPoint VNUBAN create request: ${JSON.stringify(payload)}`);

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

        // Log the FULL response so we can debug field name mismatches
        this.logger.log(`PaymentPoint VNUBAN create response: ${JSON.stringify(response.data)}`);

        const resData = response.data;
        // Try all possible nesting patterns: data, account, accounts, direct object
        const acctData = resData?.data || resData?.account || resData?.accounts || resData;
        const acctObj = Array.isArray(acctData) ? acctData[0] : acctData;

        // Try all known field name variants
        const accountNumber =
          acctObj?.accountNumber ||
          acctObj?.account_number ||
          acctObj?.account_no ||
          acctObj?.nuban ||
          acctObj?.virtualAccountNumber ||
          acctObj?.virtual_account_number;

        if (accountNumber) {
          const account = await this.prisma.virtualAccount.create({
            data: {
              userId,
              provider: 'PAYMENTPOINT',
              reference,
              accountNumber: String(accountNumber),
              accountName:
                acctObj?.accountName ||
                acctObj?.account_name ||
                acctObj?.name ||
                `${user.firstName} ${user.lastName}`,
              bankName: acctObj?.bankName || acctObj?.bank_name || acctObj?.bank || 'PalmPay',
              bankCode: String(acctObj?.bankCode || acctObj?.bank_code || acctObj?.bankcode || '20946'),
              currency: 'NGN',
            },
          });
          return { configured: true, account: this.toDto(account) };
        }

        // Account number missing — log the full raw response to help diagnose
        const raw = JSON.stringify(resData);
        this.logger.error(`PaymentPoint returned success but no account number found. Full response: ${raw}`);
        throw new BadRequestException(
          `PaymentPoint returned an unexpected response format. Please contact support. (raw: ${raw.substring(0, 200)})`,
        );
      } catch (ppErr: any) {
        // Don't re-wrap BadRequestException we threw ourselves
        if (ppErr?.status === 400 || ppErr?.name === 'BadRequestException') throw ppErr;

        const errMsg = ppErr.response?.data?.message || ppErr.response?.data?.error || ppErr.message;
        const rawErrBody = ppErr.response?.data ? JSON.stringify(ppErr.response.data) : 'no body';
        this.logger.error(`PaymentPoint VNUBAN create error [${ppErr.response?.status}]: ${errMsg} | body: ${rawErrBody}`);
        if (!hasFlutterwave) {
          throw new BadRequestException(
            errMsg || 'Could not generate virtual bank account. Please check your details or try again later.',
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