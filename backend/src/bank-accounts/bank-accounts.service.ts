import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import axios from 'axios';

@Injectable()
export class BankAccountsService {
  private readonly logger = new Logger(BankAccountsService.name);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  async listBanks(country: string) {
    const flwSecret = this.configService.get('app.flutterwave.secretKey');
    try {
      const response = await axios.get(`https://api.flutterwave.com/v3/banks/${country}`, {
        headers: { Authorization: `Bearer ${flwSecret}` }
      });
      return response.data.data;
    } catch (error) {
      this.logger.error(`Error fetching banks: ${error.message}`);
      throw new BadRequestException('Could not fetch banks');
    }
  }

  async addBankAccount(userId: string, bankCode: string, accountNumber: string, country: string, currency: string) {
    const flwSecret = this.configService.get('app.flutterwave.secretKey');
    
    let accountName = '';
    try {
      const response = await axios.post('https://api.flutterwave.com/v3/accounts/resolve', {
        account_number: accountNumber,
        account_bank: bankCode
      }, {
        headers: { Authorization: `Bearer ${flwSecret}` }
      });
      accountName = response.data.data.account_name;
    } catch (error) {
      this.logger.error(`Account resolution failed: ${error.message}`);
      throw new BadRequestException('Could not verify bank account');
    }

    const existingBank = await this.prisma.bankAccount.findFirst({
      where: { userId, accountNumber, bankCode }
    });

    if (existingBank) throw new BadRequestException('Bank account already exists');

    return this.prisma.bankAccount.create({
      data: {
        userId,
        bankName: 'Resolved Bank', // In a real app, map code to name
        bankCode,
        accountNumber,
        accountName,
        country,
        currency,
        isVerified: true,
      }
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
