import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import axios from 'axios';

@Injectable()
export class PaymentPointService {
  private readonly logger = new Logger(PaymentPointService.name);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  private get baseUrl(): string {
    return (this.configService.get<string>('app.paymentpoint.baseUrl') || 'https://api.paymentpoint.co/api/v1').replace(/\/+$/, '');
  }

  private credentials(): { secretKey: string; apiKey: string } {
    const secretKey = this.configService.get<string>('app.paymentpoint.secretKey') || '';
    const apiKey = this.configService.get<string>('app.paymentpoint.apiKey') || '';
    if (!secretKey || !apiKey) {
      throw new BadRequestException('PaymentPoint is not configured. Set PAYMENTPOINT_SECRET_KEY and PAYMENTPOINT_API_KEY.');
    }
    return { secretKey, apiKey };
  }

  async createVirtualAccount(
    customerEmail: string,
    customerName: string,
    customerPhone: string,
    bankCode: string,
    businessId: string,
    idType?: string,
    idNumber?: string,
  ) {
    const { secretKey, apiKey } = this.credentials();

    try {
      const response = await axios.post(
        `${this.baseUrl}/createVirtualAccount`,
        {
          email: customerEmail,
          name: customerName,
          phoneNumber: customerPhone,
          bankCode,
          businessId,
          ...(idType && idNumber ? { idType, idNumber } : {}),
        },
        {
          headers: {
            Authorization: `Bearer ${secretKey}`,
            'api-key': apiKey,
            'Content-Type': 'application/json',
          },
          timeout: 20_000,
        },
      );

      return response.data;
    } catch (error: any) {
      this.logger.error(`Error creating PaymentPoint virtual account: ${error?.message || error}`);
      if (error?.response) {
        throw new BadRequestException(
          `PaymentPoint error: ${error.response.data?.message || error.response.data}`,
        );
      }
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('Could not create PaymentPoint virtual account');
    }
  }

  async resolveBankAccount(accountNumber: string, bankCode: string, country: string) {
    const { secretKey, apiKey } = this.credentials();

    try {
      const response = await axios.post(
        `${this.baseUrl}/resolveBankAccount`,
        {
          account_number: accountNumber,
          bank_code: bankCode,
          country,
        },
        {
          headers: {
            Authorization: `Bearer ${secretKey}`,
            'api-key': apiKey,
            'Content-Type': 'application/json',
          },
          timeout: 20_000,
        },
      );

      return response.data;
    } catch (error: any) {
      this.logger.error(`Error resolving PaymentPoint bank account: ${error?.message || error}`);
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('Could not resolve PaymentPoint bank account');
    }
  }
}
