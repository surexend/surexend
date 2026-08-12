import { Injectable, BadRequestException, Logger, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';
import * as bcrypt from 'bcryptjs';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';

@Injectable()
export class BillsService {
  private readonly logger = new Logger(BillsService.name);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private transactionsService: TransactionsService,
  ) {}

  private getVtpassHeaders() {
    const apiKey = this.configService.get('app.vtpass.apiKey');
    const secretKey = this.configService.get('app.vtpass.secretKey');
    const publicKey = this.configService.get('app.vtpass.publicKey');
    return {
      'api-key': apiKey,
      'secret-key': secretKey,
      'public-key': publicKey,
    };
  }

  async getProviders(type: string, country: string) {
    // Usually mapping local codes to VTPass service IDs.
    // e.g. type: airtime -> [mtn, airtel, glo, 9mobile]
    return [
      { id: 'mtn', name: 'MTN Nigeria' },
      { id: 'airtel', name: 'Airtel Nigeria' }
    ];
  }

  async getDataPlans(provider: string) {
    const baseUrl = this.configService.get('app.vtpass.baseUrl');
    try {
      const response = await axios.get(`${baseUrl}/service-variations?serviceID=${provider}`, {
        headers: this.getVtpassHeaders()
      });
      return response.data;
    } catch (error) {
      this.logger.error(`VTPass error: ${error.message}`);
      throw new BadRequestException('Could not fetch data plans');
    }
  }

  async validateMeter(meter: string, provider: string) {
    const baseUrl = this.configService.get('app.vtpass.baseUrl');
    try {
      const response = await axios.post(`${baseUrl}/merchant-verify`, {
        billersCode: meter,
        serviceID: provider,
        type: 'prepaid' // or postpaid
      }, {
        headers: this.getVtpassHeaders()
      });
      return response.data;
    } catch (error) {
      throw new BadRequestException('Meter validation failed');
    }
  }

  async purchaseBill(userId: string, type: string, provider: string, recipient: string, amount: number, pin: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    // Testing mode: accept the default PIN if the user hasn't set a custom one yet
    const testing = this.configService.get<{ enabled: boolean; defaultPin: string }>('app.testing');
    if ((!user || !user.pin) && testing?.enabled) {
      if (pin !== testing.defaultPin) throw new ForbiddenException('Invalid PIN');
    } else {
      if (!user || !user.pin) throw new ForbiddenException('PIN not set up');
      const isPinValid = await bcrypt.compare(pin, user.pin);
      if (!isPinValid) throw new ForbiddenException('Invalid PIN');
    }

    // Exchange rate logic (mocked to 1500 for NGN to USDT)
    const rate = 1500;
    const usdtAmount = amount / rate;

    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
      select: { id: true, usdtBalance: true }
    });
    if (wallet.usdtBalance < usdtAmount) throw new BadRequestException('Insufficient balance');

    const reference = `VTP-${Date.now()}${Math.floor(Math.random() * 100)}`;
    const baseUrl = this.configService.get('app.vtpass.baseUrl');

    return this.prisma.$transaction(async (prisma) => {
      await prisma.wallet.update({
        where: { id: wallet.id },
        data: { usdtBalance: { decrement: usdtAmount } }
      });

      const billPayment = await prisma.billPayment.create({
        data: {
          userId,
          type,
          provider,
          recipient,
          amount,
          usdtAmount,
          reference,
          status: 'PENDING'
        }
      });

      await this.transactionsService.createTransaction(prisma, {
        userId,
        type: 'BILL_PAYMENT',
        status: 'PENDING',
        amount: usdtAmount,
        fee: 0,
        currency: 'USDT',
        reference: billPayment.reference,
        metadata: { provider, recipient }
      });

      try {
        const vtpassResponse = await axios.post(`${baseUrl}/pay`, {
          request_id: reference,
          serviceID: provider,
          billersCode: recipient,
          variation_code: type === 'data' ? amount.toString() : undefined, // depending on vtpass logic
          amount: type === 'data' ? undefined : amount,
          phone: recipient
        }, {
          headers: this.getVtpassHeaders()
        });

        await prisma.billPayment.update({
          where: { id: billPayment.id },
          data: { status: 'COMPLETED' }
        });
      } catch (error) {
        this.logger.error(`VTPass purchase failed: ${error.message}`);
        // Handle failure properly
      }

      return billPayment;
    });
  }
}
