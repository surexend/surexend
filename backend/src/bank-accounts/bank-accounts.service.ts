import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import axios from 'axios';
import { PaymentPointService } from '../paymentpoint/paymentpoint.service';

@Injectable()
export class BankAccountsService {
  private readonly logger = new Logger(BankAccountsService.name);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private paymentPointService: PaymentPointService,
  ) {}

  async listBanks(country: string) {
    // Use PaymentPoint bank codes for supported banks
    const bankCodes: Record<string, string> = {
      'NG': '20946', // PalmPay
      'GH': '', // No equivalent
      'KE': '', // No equivalent
    };
    const code = bankCodes[country];
    if (!code) {
      throw new BadRequestException('Bank listing not supported for this country via PaymentPoint');
    }
    // Return known bank code mapping
    return [{ bankCode: code, bankName: country === 'NG' ? 'Palmpay' : 'Unknown Bank' }];
  }

  /**
   * Legacy entry point used by the "add bank account" form. The customer
   * details PaymentPoint needs (email / name / phone) are taken from the
   * authenticated user's profile.
   */
  async addBankAccount(userId: string, bankCode: string, _accountNumber: string, country: string, currency: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new BadRequestException('User not found');

    const businessId = this.configService.get('app.paymentpoint.businessId') || 'default-business-id';

    return this.provisionVirtualAccount(userId, {
      customerEmail: user.email,
      customerName: `${user.firstName} ${user.lastName}`.trim(),
      customerPhone: user.phone,
      bankCode,
      businessId,
      country: country || 'NG',
      currency: currency || 'NGN',
    });
  }

  async getUserBanks(userId: string) {
    return this.prisma.bankAccount.findMany({ where: { userId } });
  }

  async deleteBank(userId: string, bankId: string) {
    const bank = await this.prisma.bankAccount.findFirst({ where: { id: bankId, userId } });
    if (!bank) throw new BadRequestException('Bank account not found');
    
    await this.prisma.bankAccount.delete({ where: { id: bankId } });
    return { message: 'Bank account deleted' };
  }

  async createPaymentPointVirtualAccount(
    userId: string,
    payload: {
      customerEmail: string;
      customerName: string;
      customerPhone: string;
      bankCode: string;
      businessId: string;
    },
  ) {
    return this.provisionVirtualAccount(userId, { ...payload, country: 'NG', currency: 'NGN' });
  }

  private async provisionVirtualAccount(
    userId: string,
    input: {
      customerEmail: string;
      customerName: string;
      customerPhone: string;
      bankCode: string;
      businessId: string;
      country: string;
      currency: string;
    },
  ) {
    try {
      const response = await this.paymentPointService.createVirtualAccount(
        input.customerEmail,
        input.customerName,
        input.customerPhone,
        input.bankCode,
        input.businessId,
      );

      const bankAccount = response.bankAccounts?.[0];
      if (!bankAccount) {
        throw new BadRequestException('No bank account returned from PaymentPoint');
      }

      const customerId: string | undefined = response.customer?.customer_id;

      return this.prisma.$transaction(async (prisma) => {
        const created = await prisma.bankAccount.create({
          data: {
            userId,
            bankName: bankAccount.bankName,
            bankCode: bankAccount.bankCode,
            accountNumber: bankAccount.accountNumber,
            accountName: bankAccount.accountName,
            country: input.country,
            currency: input.currency,
            isVerified: true,
          },
        });

        // Record the PaymentPoint mapping so incoming webhooks can be routed
        // back to this user (BankAccount has no metadata column).
        await prisma.virtualAccount.create({
          data: {
            userId,
            provider: 'PAYMENTPOINT',
            reference: customerId ? `PAYPT-${customerId}` : `PAYPT-${bankAccount.accountNumber}`,
            accountNumber: bankAccount.accountNumber,
            accountName: bankAccount.accountName,
            bankName: bankAccount.bankName,
            bankCode: bankAccount.bankCode,
            currency: input.currency,
          },
        });

        return created;
      });
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(`Error creating PaymentPoint virtual account: ${error.message}`);
      throw new BadRequestException('Could not create PaymentPoint virtual account');
    }
  }

  async setDefault(userId: string, bankId: string) {
    const bank = await this.prisma.bankAccount.findFirst({ where: { id: bankId, userId } });
    if (!bank) throw new BadRequestException('Bank account not found');

    await this.prisma.$transaction(async (prisma) => {
      await prisma.bankAccount.updateMany({
        where: { userId },
        data: { isDefault: false }
      });
      await prisma.bankAccount.update({
        where: { id: bankId },
        data: { isDefault: true }
      });
    });

    return { message: 'Default bank account updated' };
  }
}
