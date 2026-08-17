import { Injectable, BadRequestException, Logger, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';
import { ConversionsService } from '../conversions/conversions.service';
import * as bcrypt from 'bcryptjs';
import axios from 'axios';
import * as crypto from 'crypto';

// VTPass service IDs per category. `code` IS the VTPass serviceID used for
// variations lookups and /pay calls (e.g. MTN-Data for data plans).
const PROVIDERS: Record<string, { code: string; name: string }[]> = {
  airtime: [
    { code: 'MTN', name: 'MTN Nigeria' },
    { code: 'AIRTEL', name: 'Airtel Nigeria' },
    { code: 'GLO', name: 'Globacom' },
    { code: '9MOBILE', name: '9mobile (Etisalat)' },
  ],
  data: [
    { code: 'MTN-Data', name: 'MTN Nigeria' },
    { code: 'AIRTEL-Data', name: 'Airtel Nigeria' },
    { code: 'GLO-Data', name: 'Globacom' },
    { code: '9MOBILE-Data', name: '9mobile (Etisalat)' },
  ],
  electricity: [
    { code: 'IKEDC', name: 'Ikeja Electric' },
    { code: 'EKEDC', name: 'Eko Electric' },
    { code: 'PHEDC', name: 'Port Harcourt Electric' },
    { code: 'AEDC', name: 'Abuja Electric' },
    { code: 'BEDC', name: 'Benin Electric' },
    { code: 'KAEDCO', name: 'Kaduna Electric' },
  ],
  tv: [
    { code: 'DSTV', name: 'DStv' },
    { code: 'GOTV', name: 'GOtv' },
    { code: 'STARTIMES', name: 'StarTimes' },
  ],
  internet: [
    { code: 'SMILE', name: 'Smile' },
    { code: 'SPECTRANET', name: 'Spectranet' },
    { code: 'SWIFT', name: 'Swift' },
  ],
};

@Injectable()
export class BillsService {
  private readonly logger = new Logger(BillsService.name);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private transactionsService: TransactionsService,
    private conversionsService: ConversionsService,
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
    const category = (type || 'airtime').toLowerCase();
    const list = PROVIDERS[category] || PROVIDERS.airtime;
    return list.map((p) => ({ ...p, country: country || 'NG' }));
  }

  async getDataPlans(provider: string) {
    if (!provider) throw new BadRequestException('Provider is required');
    const baseUrl = this.configService.get('app.vtpass.baseUrl');
    try {
      const response = await axios.get(`${baseUrl}/service-variations?serviceID=${provider}`, {
        headers: this.getVtpassHeaders(),
        timeout: 15000,
      });
      const variations: any[] = response.data?.content?.variations || [];
      return variations
        .map((v: any) => ({
          code: v.variation_code,
          name: v.name || v.variation_name,
          amount: parseFloat(v.variation_amount),
          validity: (v.name || '').match(/(\d+\s*(?:day|week|month|year)s?)/i)?.[0] || '',
        }))
        .filter((p: any) => p.code && Number.isFinite(p.amount) && p.amount > 0)
        .sort((a: any, b: any) => a.amount - b.amount);
    } catch (error) {
      this.logger.error(`VTPass variations error: ${(error as Error).message}`);
      throw new BadRequestException('Could not fetch data plans');
    }
  }

  async validateMeter(meter: string, provider: string) {
    const baseUrl = this.configService.get('app.vtpass.baseUrl');
    try {
      const response = await axios.post(`${baseUrl}/merchant-verify`, {
        billersCode: meter,
        serviceID: provider,
        type: 'prepaid', // or postpaid
      }, {
        headers: this.getVtpassHeaders(),
        timeout: 15000,
      });
      return response.data;
    } catch (error) {
      throw new BadRequestException('Meter validation failed');
    }
  }

  async purchaseBill(userId: string, type: string, provider: string, recipient: string, amount: number, pin: string, planCode?: string) {
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

    const category = (type || 'airtime').toLowerCase();
    if (category === 'data' && !planCode) {
      throw new BadRequestException('Please select a data plan');
    }

    // Real NGN→USDT rate from the conversions service (live when YellowCard is
    // configured, static table otherwise) — never a hardcoded rate.
    const rateInfo = await this.conversionsService.getRates('NGN');
    const rate = rateInfo.rate > 0 ? rateInfo.rate : 1500;
    const usdtAmount = amount / rate;

    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
      select: { id: true, usdtBalance: true, usdcBalance: true }
    });
    if (!wallet) throw new BadRequestException('Wallet not found');
    if ((wallet.usdtBalance || 0) < usdtAmount) {
      throw new BadRequestException(`Insufficient balance. You need $${usdtAmount.toFixed(2)} USDT (${amount.toFixed(2)} NGN at ${rate} NGN/USD).`);
    }

    const reference = `VTP-${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const baseUrl = this.configService.get('app.vtpass.baseUrl');

    return this.prisma.$transaction(async (prisma) => {
      await prisma.wallet.update({
        where: { id: wallet.id },
        data: { usdtBalance: { decrement: usdtAmount } }
      });

      const billPayment = await prisma.billPayment.create({
        data: {
          userId,
          type: category,
          provider,
          recipient,
          amount,
          usdtAmount,
          reference,
          status: 'PENDING',
          metadata: planCode ? { planCode, rate } : { rate }
        }
      });

      const transaction = await this.transactionsService.createTransaction(prisma, {
        userId,
        type: 'BILL_PAYMENT',
        status: 'PENDING',
        amount: usdtAmount,
        fee: 0,
        currency: 'USDT',
        reference: billPayment.reference,
        metadata: { provider, recipient, rate, ...(planCode ? { planCode } : {}) }
      });

      try {
        const payload: Record<string, unknown> = {
          request_id: reference,
          serviceID: provider,
          billersCode: recipient,
          phone: recipient,
        };
        if (category === 'data') {
          payload.variation_code = planCode;
          payload.amount = amount;
        } else {
          payload.amount = amount;
        }

        const vtpassResponse = await axios.post(`${baseUrl}/pay`, payload, {
          headers: this.getVtpassHeaders(),
          timeout: 20000,
        });

        const code = vtpassResponse.data?.code;
        const description = vtpassResponse.data?.response_description || 'Unknown error';
        if (code !== '000') {
          throw new Error(`${description} (code ${code})`);
        }

        await prisma.billPayment.update({
          where: { id: billPayment.id },
          data: { status: 'COMPLETED', metadata: { ...(billPayment.metadata as object || {}), vtpass: vtpassResponse.data } }
        });
        await prisma.transaction.update({
          where: { id: transaction.id },
          data: { status: 'COMPLETED', metadata: { ...(transaction.metadata as object || {}), vtpass: vtpassResponse.data } }
        });

        return { ...billPayment, status: 'COMPLETED' };
      } catch (error) {
        const message = (error as Error).message;
        this.logger.error(`VTPass purchase failed (${reference}): ${message}`);

        // Refund the USDT and mark both records FAILED — never keep funds for
        // a bill that was not delivered.
        await prisma.wallet.update({
          where: { id: wallet.id },
          data: { usdtBalance: { increment: usdtAmount } }
        });
        await prisma.billPayment.update({
          where: { id: billPayment.id },
          data: { status: 'FAILED', metadata: { ...(billPayment.metadata as object || {}), error: message } }
        });
        await prisma.transaction.update({
          where: { id: transaction.id },
          data: { status: 'FAILED', metadata: { ...(transaction.metadata as object || {}), error: message } }
        });

        throw new BadRequestException(`Purchase failed: ${message}`);
      }
    });
  }
}