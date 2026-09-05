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

  async addBankAccount(userId: string, customerEmail: string, customerName: string, customerPhone: string, bankCode: string, country: string, currency: string) {
    // Use PaymentPoint to create a virtual account
    const businessId = this.configService.get('app.paymentpoint.businessId') || 'default-business-id';

    try {
      const response = await this.paymentPointService.createVirtualAccount(
        customerEmail,
        customerName,
        customerPhone,
        bankCode,
        businessId,
      );

      const bankAccount = response.bankAccounts?.[0];
      if (!bankAccount) {
        throw new BadRequestException('No bank account returned from PaymentPoint');
      }

      return this.prisma.bankAccount.create({
        data: {
          userId,
          bankName: bankAccount.bankName,
          bankCode: bankAccount.bankCode,
          accountNumber: bankAccount.accountNumber,
          accountName: bankAccount.accountName,
          country,
          currency,
          isVerified: true,
          metadata: { paymentPointCustomerId: response.customer?.customer_id },
        },
      });
    } catch (error) {
      this.logger.error(`Error creating PaymentPoint virtual account: ${error.message}`);
      throw new BadRequestException('Could not create PaymentPoint virtual account');
    }
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
    customerEmail: string,
    customerName: string,
    customerPhone: string,
    bankCode: string,
    businessId: string,
  ) {
    const secretKey = this.configService.get('app.paymentpoint.secretKey');
    const apiKey = this.configService.get('app.paymentpoint.apiKey');

    try {
      const response = await this.paymentPointService.createVirtualAccount(
        customerEmail,
        customerName,
        customerPhone,
        bankCode,
        businessId,
      );

      const bankAccount = response.bankAccounts?.[0];
      if (!bankAccount) {
        throw new BadRequestException('No bank account returned from PaymentPoint');
      }

      return this.prisma.bankAccount.create({
        data: {
          userId,
          bankName: bankAccount.bankName,
          bankCode: bankAccount.bankCode,
          accountNumber: bankAccount.accountNumber,
          accountName: bankAccount.accountName,
          country: 'NG',
          currency: 'NGN',
          isVerified: true,
          metadata: { paymentPointCustomerId: response.customer?.customer_id },
        },
      });
    } catch (error) {
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
