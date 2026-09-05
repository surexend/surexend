import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import axios from 'axios';

@Injectable()
export class PaymentPointService {
  private readonly logger = new Logger(PaymentPointService.name);

  private readonly BASE_URL = 'https://api.paymentpoint.co';

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) { }

  async createVirtualAccount(
    customerEmail: string,
    customerName: string,
    customerPhone: string,
    bankCode: string,
    businessId: string,
    idType?: string,
    idNumber?: string,
  ) {
    const secretKey = this.configService.get('app.paymentpoint.secretKey');
    const apiKey = this.configService.get('app.paymentpoint.apiKey');

    try {
      const response = await axios.post(
        `${this.BASE_URL}/api/v1/createVirtualAccount`,
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
            'Authorization': `Bearer ${secretKey}`,
            'api-key': apiKey,
            'Content-Type': 'application/json',
          },
        },
      );

      return response.data;
    } catch (error) {
      this.logger.error(`Error creating PaymentPoint virtual account: ${error.message}`);
      if (error.response) {
        throw new BadRequestException(
          `PaymentPoint error: ${error.response.data.message || error.response.data}`,
        );
      }
      throw new BadRequestException('Could not create PaymentPoint virtual account');
    }
  }

  async resolveBankAccount(accountNumber: string, bankCode: string, country: string) {
    const secretKey = this.configService.get('app.paymentpoint.secretKey');
    const apiKey = this.configService.get('app.paymentpoint.apiKey');

    try {
      const response = await axios.post(
        `${this.BASE_URL}/api/v1/resolveBankAccount`,
        {
          account_number: accountNumber,
          bank_code: bankCode,
          country,
        },
        {
          headers: {
            'Authorization': `Bearer ${secretKey}`,
            'api-key': apiKey,
            'Content-Type': 'application/json',
          },
        },
      );

      return response.data;
    } catch (error) {
      this.logger.error(`Error resolving PaymentPoint bank account: ${error.message}`);
      throw new BadRequestException('Could not resolve PaymentPoint bank account');
    }
  }
}