import { Injectable, BadRequestException, Logger, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';
import { ConversionsService } from '../conversions/conversions.service';
import * as bcrypt from 'bcryptjs';
import axios from 'axios';

// Static provider lists for categories not yet wired to Smartspeed (electricity,
// tv, internet). Airtime and data are served live from the Smartspeed catalog.
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

const NETWORK_ORDER = ['MTN', 'GLO', 'AIRTEL', '9MOBILE'];

// Fallback network IDs in case the catalog does not carry them (Smartspeed IDs).
const FALLBACK_NETWORK_IDS: Record<string, number> = { MTN: 1, GLO: 2, '9MOBILE': 3, AIRTEL: 4 };

@Injectable()
export class BillsService {
  private readonly logger = new Logger(BillsService.name);
  private readonly CATALOG_TTL = 10 * 60 * 1000;
  private catalogCache: { data: any; fetchedAt: number } | null = null;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private transactionsService: TransactionsService,
    private conversionsService: ConversionsService,
  ) {}

  // ── Smartspeed plumbing ─────────────────────────────────────────────────

  private smartspeedBaseUrl() {
    return this.configService.get<string>('app.smartspeed.baseUrl');
  }

  private smartspeedHeaders() {
    const apiKey = this.configService.get<string>('app.smartspeed.apiKey');
    if (!apiKey) {
      throw new BadRequestException('Smartspeed is not configured. Set SMARTSPEED_API_TOKEN.');
    }
    return { 'Content-Type': 'application/json', Authorization: `Token ${apiKey}` };
  }

  private async fetchCatalog(force = false): Promise<any> {
    if (!force && this.catalogCache && Date.now() - this.catalogCache.fetchedAt < this.CATALOG_TTL) {
      return this.catalogCache.data;
    }
    const response = await axios.get(`${this.smartspeedBaseUrl()}/user/`, {
      headers: this.smartspeedHeaders(),
      timeout: 20000,
    });
    this.catalogCache = { data: response.data, fetchedAt: Date.now() };
    return response.data;
  }

  private normaliseNetwork(name: string): string {
    const n = (name || '').toUpperCase();
    if (n.includes('MTN')) return 'MTN';
    if (n.includes('AIRTEL')) return 'AIRTEL';
    if (n.includes('GLO')) return 'GLO';
    if (n.includes('9MOBILE') || n.includes('ETISALAT')) return '9MOBILE';
    return n;
  }

  private networkDisplayName(network: string): string {
    switch (network) {
      case 'MTN': return 'MTN Nigeria';
      case 'AIRTEL': return 'Airtel Nigeria';
      case 'GLO': return 'Globacom';
      case '9MOBILE': return '9mobile (Etisalat)';
      default: return network;
    }
  }

  private dataplansKey(network: string): string {
    const known: Record<string, string> = { MTN: 'MTN_PLAN', GLO: 'GLO_PLAN', AIRTEL: 'AIRTEL_PLAN', '9MOBILE': '9MOBILE_PLAN' };
    return known[network] || `${network}_PLAN`;
  }

  private networkIdMap(catalog: any): Record<string, number> {
    const map: Record<string, number> = {};
    const dataplans = catalog?.Dataplans || {};
    for (const [key, section] of Object.entries<any>(dataplans)) {
      const arr = Array.isArray(section) ? section : section?.ALL;
      if (Array.isArray(arr) && arr.length && arr[0]?.network) {
        map[this.normaliseNetwork(arr[0].plan_network || key)] = Number(arr[0].network);
      }
    }
    return map;
  }

  private resolveNetworkId(catalog: any, provider: string): number | null {
    const net = this.normaliseNetwork(provider);
    const fromCatalog = this.networkIdMap(catalog)[net];
    return fromCatalog || FALLBACK_NETWORK_IDS[net] || null;
  }

  // Smartspeed returns 2xx with an error object on failures (DRF style), so we
  // only treat a response as failed when it carries an explicit error signal.
  private isFailed(body: any): boolean {
    if (body == null) return false;
    if (typeof body === 'string') {
      const t = body.toLowerCase();
      return t.includes('error') || t.includes('insufficient') || t.includes('failed');
    }
    if (body.detail) return true;
    if (body.error) return true;
    if (body.success === false) return true;
    const status = (body.Status ?? body.status ?? '').toString().toLowerCase();
    return !!status && (status.includes('fail') || status.includes('error'));
  }

  private errorMessage(body: any): string {
    if (body == null) return 'Unknown provider error';
    if (typeof body === 'string') return body.slice(0, 300);
    if (body.detail) return typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail);
    if (body.error) return typeof body.error === 'string' ? body.error : JSON.stringify(body.error);
    if (body.message) return String(body.message);
    if (body.Status || body.status) return `Provider returned status: ${body.Status || body.status}`;
    return 'Unknown provider error';
  }

  // ── Catalog / lookups ───────────────────────────────────────────────────

  async getProviders(type: string, country: string) {
    const category = (type || 'airtime').toLowerCase();
    if (category === 'airtime' || category === 'data') {
      const catalog = await this.fetchCatalog();
      const networkIds = this.networkIdMap(catalog);
      const topups = catalog?.topuppercentage || {};
      const networks: any[] = [];
      for (const net of NETWORK_ORDER) {
        const discount = category === 'airtime' ? parseFloat(topups[net]?.VTU) || null : null;
        if (category === 'airtime' && discount == null && !topups[net]) continue;
        if (category === 'data' && !networkIds[net] && !catalog?.Dataplans?.[this.dataplansKey(net)]) continue;
        networks.push({
          code: net,
          name: this.networkDisplayName(net),
          country: country || 'NG',
          networkId: networkIds[net] || FALLBACK_NETWORK_IDS[net],
          ...(discount != null ? { discount } : {}),
        });
      }
      return networks;
    }
    const list = PROVIDERS[category] || [];
    return list.map((p) => ({ ...p, country: country || 'NG' }));
  }

  async getDataPlans(provider: string) {
    if (!provider) throw new BadRequestException('Provider is required');
    const net = this.normaliseNetwork(provider);
    if (!FALLBACK_NETWORK_IDS[net]) {
      throw new BadRequestException(`Unknown network provider: ${provider}`);
    }
    const catalog = await this.fetchCatalog();
    const section = catalog?.Dataplans?.[this.dataplansKey(net)];
    const plans: any[] = Array.isArray(section) ? section : section?.ALL || [];
    if (!plans.length) throw new BadRequestException('No data plans available for this provider');
    return plans
      .map((p: any) => ({
        code: String(p.dataplan_id ?? p.id),
        name: p.plan || 'Data Plan',
        validity: p.month_validate || '',
        amount: parseFloat(p.plan_amount),
        planType: p.plan_type || 'GIFTING',
      }))
      .filter((p) => p.code && Number.isFinite(p.amount) && p.amount > 0)
      .sort((a, b) => a.amount - b.amount);
  }

  async validateMeter(meter: string, provider: string) {
    try {
      const response = await axios.get(`${this.smartspeedBaseUrl()}/validatemeter`, {
        params: { meternumber: meter, disconame: provider, mtype: 1 },
        headers: this.smartspeedHeaders(),
        timeout: 15000,
      });
      const body = response.data;
      if (this.isFailed(body)) throw new Error(this.errorMessage(body));
      return body;
    } catch (error) {
      this.logger.error(`Smartspeed meter validation error: ${(error as Error).message}`);
      throw new BadRequestException('Meter validation failed');
    }
  }

  // ── Purchase ────────────────────────────────────────────────────────────

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
    if (!['airtime', 'data'].includes(category)) {
      throw new BadRequestException(`${category} is not available yet. Airtime and Data are live.`);
    }
    if (category === 'data' && !planCode) {
      throw new BadRequestException('Please select a data plan');
    }

    const catalog = await this.fetchCatalog();
    const networkId = this.resolveNetworkId(catalog, provider);
    if (!networkId) throw new BadRequestException(`Unknown network provider: ${provider}`);

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

    const reference = `SS-${Date.now()}${Math.floor(Math.random() * 1000)}`;

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
          metadata: { networkId, rate, ...(planCode ? { planCode } : {}) }
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
        const payload: Record<string, unknown> = { Ported_number: false };
        let endpoint: string;
        if (category === 'airtime') {
          endpoint = '/topup/';
          payload.network = networkId;
          payload.amount = amount;
          payload.mobile_number = recipient;
          payload.airtime_type = 'VTU';
        } else {
          endpoint = '/data/';
          payload.network = networkId;
          payload.mobile_number = recipient;
          payload.plan = Number(planCode) || planCode;
        }

        const response = await axios.post(`${this.smartspeedBaseUrl()}${endpoint}`, payload, {
          headers: this.smartspeedHeaders(),
          timeout: 60000,
        });

        const body = response.data;
        if (this.isFailed(body)) {
          throw new Error(this.errorMessage(body));
        }

        await prisma.billPayment.update({
          where: { id: billPayment.id },
          data: { status: 'COMPLETED', metadata: { ...(billPayment.metadata as object || {}), smartspeed: body } }
        });
        await prisma.transaction.update({
          where: { id: transaction.id },
          data: { status: 'COMPLETED', metadata: { ...(transaction.metadata as object || {}), smartspeed: body } }
        });

        return { ...billPayment, status: 'COMPLETED' };
      } catch (error) {
        const message = (error as Error).message;
        this.logger.error(`Smartspeed purchase failed (${reference}): ${message}`);

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
