import { Injectable, BadRequestException, ConflictException, Logger, NotFoundException, Optional, ServiceUnavailableException } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';
import { ConversionsService } from '../conversions/conversions.service';
import { TransactionAuthService } from '../common/transaction-auth/transaction-auth.service';
import { LedgerService } from '../common/ledger.service';
import { toMinor } from '../common/money';
import { FinancialSafetyService } from '../common/financial-safety.service';
import axios from 'axios';
import { randomUUID } from 'crypto';

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
    private transactionAuth: TransactionAuthService,
    private ledger: LedgerService,
    @Optional() private financialSafety?: FinancialSafetyService,
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
    const statuses = this.providerStatuses(body);
    return statuses.some((status) => /fail|error|reject|denied|cancel|reverse/.test(status));
  }

  private providerStatuses(body: any): string[] {
    if (!body || typeof body !== 'object') return [];
    const candidates = [
      body.status,
      body.Status,
      body.transaction_status,
      body.transactionStatus,
      body.data?.status,
      body.data?.Status,
      body.data?.transaction_status,
      body.data?.transactionStatus,
    ];
    return candidates
      .filter((value) => value !== undefined && value !== null)
      .map((value) => String(value).trim().toLowerCase())
      .filter(Boolean);
  }

  private assertPurchaseConfirmed(body: any) {
    if (this.isFailed(body)) {
      const knownFailure: any = new Error(this.errorMessage(body));
      knownFailure.providerOutcomeKnown = true;
      throw knownFailure;
    }

    const statuses = this.providerStatuses(body);
    const pending = statuses.some((status) => /pending|processing|initiated|queued|in_progress/.test(status));
    const confirmed = statuses.some((status) => /success|successful|complete|completed|delivered/.test(status));
    const explicitlySuccessful = body?.success === true;
    if (!pending && (confirmed || explicitlySuccessful)) return;

    // Smartspeed's response contract has not been independently verified. A
    // 2xx response without an explicit final-success signal may mean pending,
    // not delivered. Keep the debit pending and reconcile instead of telling a
    // customer that a bill completed or issuing a duplicate request.
    const unknown: any = new Error(
      statuses.length ? `Smartspeed returned non-final status: ${statuses.join(', ')}` : 'Smartspeed returned no final success status',
    );
    unknown.providerOutcomeUnknown = true;
    throw unknown;
  }

  private errorMessage(body: any): string {
    if (body == null) return 'Unknown provider error';
    if (typeof body === 'string') return body.slice(0, 300);
    if (body.detail) return typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail);
    if (body.error) {
      if (typeof body.error === 'string') return body.error;
      if (Array.isArray(body.error)) return body.error.join(', ');
      return JSON.stringify(body.error);
    }
    if (body.message) return String(body.message);
    if (body.msg) return String(body.msg);
    if (body.mobile_number) {
      const mn = Array.isArray(body.mobile_number) ? body.mobile_number.join(', ') : body.mobile_number;
      return `Phone number error: ${mn}`;
    }
    if (body.network) {
      const net = Array.isArray(body.network) ? body.network.join(', ') : body.network;
      return `Network error: ${net}`;
    }
    if (body.plan) {
      const pl = Array.isArray(body.plan) ? body.plan.join(', ') : body.plan;
      return `Plan error: ${pl}`;
    }
    if (body.non_field_errors) {
      const nfe = Array.isArray(body.non_field_errors) ? body.non_field_errors.join(', ') : body.non_field_errors;
      return String(nfe);
    }
    if (typeof body === 'object') {
      const keys = Object.keys(body);
      if (keys.length > 0) {
        const val = body[keys[0]];
        const str = Array.isArray(val) ? val.join(', ') : typeof val === 'object' ? JSON.stringify(val) : String(val);
        return `${keys[0]}: ${str}`;
      }
    }
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
      let margins: Record<string, number> = {};
      if (category === 'airtime') {
        const rows = await this.prisma.servicePricing.findMany({ where: { category: 'airtime' } });
        for (const r of rows) margins[r.provider] = r.marginPct || 0;
      }
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
          ...(category === 'airtime' ? { sellMarkup: margins[net] || 0 } : {}),
        });
      }
      return networks;
    }
    const list = PROVIDERS[category] || [];
    return list.map((p) => ({ ...p, country: country || 'NG' }));
  }

  async getDataPlans(provider: string, includeDisabled = false) {
    if (!provider) throw new BadRequestException('Provider is required');
    const net = this.normaliseNetwork(provider);
    if (!FALLBACK_NETWORK_IDS[net]) {
      throw new BadRequestException(`Unknown network provider: ${provider}`);
    }
    const catalog = await this.fetchCatalog();
    const section = catalog?.Dataplans?.[this.dataplansKey(net)];
    const plans: any[] = Array.isArray(section) ? section : section?.ALL || [];
    if (!plans.length) throw new BadRequestException('No data plans available for this provider');

    // Apply admin pricing: per-plan override wins, then the network auto-margin,
    // else the raw provider cost. `amount` is always the SELL price the app shows.
    const rows = await this.prisma.servicePricing.findMany({ where: { category: 'data', provider: net } });
    const netMargin = rows.find((r) => r.planCode === '')?.marginPct || 0;
    const planCodeKey = (p: any) => String(p.dataplan_id ?? p.id);
    const disabledCodes = new Set(rows.filter((r) => r.disabled).map((r) => r.planCode).filter(Boolean));

    return plans
      .map((p: any) => {
        const code = planCodeKey(p);
        const cost = parseFloat(p.plan_amount);
        const override = rows.find((r) => r.planCode === code)?.sellPrice;
        const sell = override != null
          ? override
          : netMargin > 0
            ? Math.round(cost * (1 + netMargin / 100))
            : cost;
        return {
          code,
          name: p.plan || 'Data Plan',
          validity: p.month_validate || '',
          amount: sell,
          costPrice: cost,
          planType: p.plan_type || 'GIFTING',
          disabled: disabledCodes.has(code),
        };
      })
      .filter((p) => p.code && Number.isFinite(p.amount) && p.amount > 0 && (includeDisabled || !p.disabled))
      .sort((a, b) => a.amount - b.amount);
  }

  // Price for a single plan at purchase time (authoritative — never trusts the
  // client amount). Returns the sell price and, when applicable, the network
  // auto-margin that produced it.
  private async getDataPlanSellPrice(provider: string, planCode: string, cost: number): Promise<{ sellPrice: number; marginPct: number | null }> {
    const net = this.normaliseNetwork(provider);
    const rows = await this.prisma.servicePricing.findMany({ where: { category: 'data', provider: net } });
    const override = rows.find((r) => r.planCode === String(planCode))?.sellPrice;
    if (override != null) return { sellPrice: override, marginPct: null };
    const margin = rows.find((r) => r.planCode === '')?.marginPct || 0;
    if (margin > 0) return { sellPrice: Math.round(cost * (1 + margin / 100)), marginPct: margin };
    return { sellPrice: cost, marginPct: null };
  }

  private async getAirtimeMargin(provider: string): Promise<number> {
    const net = this.normaliseNetwork(provider);
    const row = await this.prisma.servicePricing.findFirst({ where: { category: 'airtime', provider: net, planCode: '' } });
    return row?.marginPct || 0;
  }

  // Plans belonging to a SPECIFIC network's catalog section. Resolving a plan
  // by id across the whole catalog let a plan code from another network be
  // priced/purchased under the wrong provider (cross-network desync). All plan
  // lookups below are scoped to the provider’s own section.
  private providerPlans(catalog: any, provider: string): any[] {
    const net = this.normaliseNetwork(provider);
    const section = catalog?.Dataplans?.[this.dataplansKey(net)];
    const arr = Array.isArray(section) ? section : section?.ALL || [];
    return Array.isArray(arr) ? arr : [];
  }

  private resolvePlan(catalog: any, provider: string, planCode: string): any {
    return this.providerPlans(catalog, provider).find(
      (x: any) => String(x.dataplan_id ?? x.id) === String(planCode),
    ) || null;
  }

  private planCost(catalog: any, provider: string, planCode: string): number {
    const p = this.resolvePlan(catalog, provider, planCode);
    return p ? parseFloat(p.plan_amount) : 0;
  }

  // ── Admin pricing ───────────────────────────────────────────────────────

  // Full pricing view for the admin console: airtime networks (cost % + markup)
  // and every data plan per network (cost vs sell).
  async getPricingView() {
    const catalog = await this.fetchCatalog();
    const networkIds = this.networkIdMap(catalog);
    const topups = catalog?.topuppercentage || {};

    const airtime: any[] = [];
    for (const net of NETWORK_ORDER) {
      const costPercent = parseFloat(topups[net]?.VTU);
      if (costPercent == null) continue;
      const row = await this.prisma.servicePricing.findFirst({ where: { category: 'airtime', provider: net, planCode: '' } });
      airtime.push({
        provider: net,
        name: this.networkDisplayName(net),
        networkId: networkIds[net] || FALLBACK_NETWORK_IDS[net],
        costPercent,
        markupPercent: row?.marginPct || 0,
      });
    }

    const data: any[] = [];
    for (const net of NETWORK_ORDER) {
      if (!catalog?.Dataplans?.[this.dataplansKey(net)]) continue;
      const rows = await this.prisma.servicePricing.findMany({ where: { category: 'data', provider: net } });
      const marginRow = rows.find((r) => r.planCode === '');
      data.push({
        provider: net,
        name: this.networkDisplayName(net),
        networkId: networkIds[net] || FALLBACK_NETWORK_IDS[net],
        marginPct: marginRow?.marginPct || 0,
        plans: await this.getDataPlans(net, true),
      });
    }

    return { airtime, data };
  }

  async setAirtimeMargin(provider: string, marginPct: number) {
    const net = this.normaliseNetwork(provider);
    const pct = Math.max(0, Number(marginPct) || 0);
    await this.prisma.servicePricing.upsert({
      where: { category_provider_planCode: { category: 'airtime', provider: net, planCode: '' } },
      create: { category: 'airtime', provider: net, planCode: '', marginPct: pct },
      update: { marginPct: pct },
    });
    return { provider: net, markupPercent: pct };
  }

  async setDataNetworkMargin(provider: string, marginPct: number) {
    const net = this.normaliseNetwork(provider);
    const pct = Math.max(0, Number(marginPct) || 0);
    await this.prisma.servicePricing.upsert({
      where: { category_provider_planCode: { category: 'data', provider: net, planCode: '' } },
      create: { category: 'data', provider: net, planCode: '', marginPct: pct },
      update: { marginPct: pct },
    });
    return { provider: net, marginPct: pct };
  }

  // Per-plan sell price override. sellPrice null/<=0 removes the override and
  // falls back to the network auto-margin (or raw cost).
  async setDataPlanPrice(provider: string, planCode: string, sellPrice: number | null) {
    const net = this.normaliseNetwork(provider);
    const catalog = await this.fetchCatalog();
    const cost = this.planCost(catalog, net, planCode);
    if (!cost || cost <= 0) throw new BadRequestException('Unknown data plan');
    if (sellPrice == null || Number(sellPrice) <= 0) {
      await this.prisma.servicePricing.deleteMany({ where: { category: 'data', provider: net, planCode: String(planCode) } });
      return { provider: net, planCode: String(planCode), sellPrice: null };
    }
    const price = Math.round(Number(sellPrice));
    await this.prisma.servicePricing.upsert({
      where: { category_provider_planCode: { category: 'data', provider: net, planCode: String(planCode) } },
      create: { category: 'data', provider: net, planCode: String(planCode), costPrice: cost, sellPrice: price },
      update: { sellPrice: price, costPrice: cost },
    });
    return { provider: net, planCode: String(planCode), sellPrice: price, costPrice: cost };
  }

  // Turn a single data bundle on/off. Disabled plans disappear from the app
  // and can't be purchased. Re-enabling keeps the sell price override if any.
  async setDataPlanEnabled(provider: string, planCode: string, enabled: boolean) {
    const net = this.normaliseNetwork(provider);
    const catalog = await this.fetchCatalog();
    const cost = this.planCost(catalog, net, planCode);
    if (!cost || cost <= 0) throw new BadRequestException('Unknown data plan');
    const code = String(planCode);
    await this.prisma.servicePricing.upsert({
      where: { category_provider_planCode: { category: 'data', provider: net, planCode: code } },
      create: { category: 'data', provider: net, planCode: code, costPrice: cost, disabled: !enabled },
      update: { disabled: !enabled },
    });
    return { provider: net, planCode: code, enabled };
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

  async purchaseBill(userId: string, type: string, provider: string, recipient: string, amount: number, pin?: string, planCode?: string, passkeyToken?: string, portedNumber?: boolean) {
    await this.financialSafety?.assertEnabled('bills', userId);
    if (this.configService.get<boolean>('app.moneyMovement.enabled') !== true) {
      throw new BadRequestException('Money movement is disabled while this environment is in testnet or maintenance mode.');
    }
    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
      throw new BadRequestException('Amount must be a finite number greater than zero.');
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    // Safety guard: bills spend REAL naira at Smartspeed, so only allow
    // accounts that have been funded with at least one completed deposit.
    // Prevents testnet/empty balances from spending the platform's money.
    const requireFunding = this.configService.get<boolean>('app.bills.requireFunding') ?? true;
    if (requireFunding && user) {
      const funded = await this.prisma.transaction.count({
        where: { userId, type: 'RECEIVE', status: 'COMPLETED' },
      });
      if (!funded) {
        throw new BadRequestException('Fund your wallet first before paying bills. Go to Receive to fund your local currency wallet.');
      }
    }

    const category = (type || 'airtime').toLowerCase();
    await this.transactionAuth.verify(user, { pin, passkeyToken }, {
      action: 'bills.purchase',
      type: category,
      provider: String(provider || '').toUpperCase(),
      recipient: String(recipient || '').trim(),
      amount: Number(amount),
      planCode: planCode ? String(planCode) : null,
      portedNumber: Boolean(portedNumber),
    });

    if (!['airtime', 'data'].includes(category)) {
      throw new BadRequestException(`${category} is not available yet. Airtime and Data are live.`);
    }

    // Validate and sanitize phone number for Airtime and Data
    let normalizedRecipient = (recipient || '').replace(/[^\d+]/g, '');
    if (normalizedRecipient.startsWith('+234')) {
      normalizedRecipient = '0' + normalizedRecipient.slice(4);
    } else if (normalizedRecipient.startsWith('234') && normalizedRecipient.length >= 13) {
      normalizedRecipient = '0' + normalizedRecipient.slice(3);
    } else if (normalizedRecipient.length === 10 && !normalizedRecipient.startsWith('0')) {
      normalizedRecipient = '0' + normalizedRecipient;
    }

    if (!/^0[789][01]\d{8}$/.test(normalizedRecipient)) {
      throw new BadRequestException(
        `Invalid Nigerian phone number (${recipient}). It must be an 11-digit mobile number starting with 070, 080, 081, 090, or 091.`
      );
    }
    recipient = normalizedRecipient;

    if (category === 'data' && !planCode) {
      throw new BadRequestException('Please select a data plan');
    }

    const catalog = await this.fetchCatalog();
    const networkId = this.resolveNetworkId(catalog, provider);
    if (!networkId) throw new BadRequestException(`Unknown network provider: ${provider}`);

    // Resolve pricing server-side — the client amount is never trusted.
    let chargeAmount = amount;      // NGN charged to the user (sell price)
    let providerAmount = amount;    // face value / provider cost sent upstream
    let costPrice: number | null = null;
    let marginPct: number | null = null;
    let planResolved: { name: string; validity: string } | null = null;

    if (category === 'data') {
      // Validate the plan belongs to THIS provider's network section. Scoping
      // the lookup prevents a plan code from another network being priced and
      // purchased under the wrong provider at a different price.
      const plan = this.resolvePlan(catalog, provider, planCode as string);
      const cost = plan ? parseFloat(plan.plan_amount) : 0;
      if (!plan || !Number.isFinite(cost) || cost <= 0) {
        throw new BadRequestException(`Data plan ${planCode} is not available for ${provider}`);
      }
      const net = this.normaliseNetwork(provider);
      const planCodeStr = String(planCode);
      const disabledRow = await this.prisma.servicePricing.findFirst({
        where: { category: 'data', provider: net, planCode: planCodeStr, disabled: true },
      });
      if (disabledRow) throw new BadRequestException('That bundle is taking a nap right now — pick another one!');
      const pricing = await this.getDataPlanSellPrice(provider, planCodeStr, cost);
      chargeAmount = pricing.sellPrice;
      costPrice = cost;
      marginPct = pricing.marginPct;
      providerAmount = cost;
      planResolved = { name: plan.plan || 'Data Plan', validity: plan.month_validate || '' };
    } else {
      // Server-side airtime bounds. The client validates too, but it can be
      // bypassed, and a zero/negative amount would reach Smartspeed otherwise.
      const amt = Number(amount);
      if (!Number.isFinite(amt) || amt <= 0 || amt < 50) {
        throw new BadRequestException('Minimum airtime amount is ₦50');
      }
      if (amt > 500000) {
        throw new BadRequestException('Maximum airtime amount is ₦500,000');
      }
      marginPct = await this.getAirtimeMargin(provider);
      chargeAmount = marginPct > 0 ? Math.round(amt * (1 + marginPct / 100)) : amt;
      providerAmount = amt;
    }

    // Bills are paid with REAL naira only. The funding guard above already
    // requires a completed deposit; here we enforce that the naira is real
    // (bank transfer / admin NGN credit) — never testnet swap funds.
    const rateInfo = await this.conversionsService.getRates('NGN');
    const rate = rateInfo.rate > 0 ? rateInfo.rate : 1500;

    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
      select: { id: true, localBalances: true, realLocalBalance: true, localBalance: true }
    });
    if (!wallet) throw new BadRequestException('Wallet not found');

    // Per-currency local balances (defensive against a missing column).
    let localBalances: Record<string, number> = {};
    try {
      const parsed = wallet.localBalances as any;
      if (parsed && typeof parsed === 'object') localBalances = { ...parsed };
    } catch { /* ignore */ }
    if ((wallet.localBalance || 0) > 0 && !localBalances['NGN']) localBalances['NGN'] = wallet.localBalance;

    const realNgn = wallet.realLocalBalance || 0;
    if (realNgn < chargeAmount) {
      throw new BadRequestException(
        `You need ₦${chargeAmount.toFixed(2)} of real naira for this bill — you have ₦${realNgn.toFixed(2)}. Crypto and testnet funds can't pay bills. Fund your NGN wallet via bank transfer on the Receive page.`
      );
    }

    // A provider-unknown request must be reconciled before another request for
    // the same service/recipient is allowed, even if the client supplies a new
    // idempotency key. This is a local duplicate barrier while Smartspeed's
    // request-id/status contract is still being verified.
    const unresolved = await this.prisma.billPayment.findFirst({
      where: { userId, type: category, provider, recipient, status: 'PENDING' },
      select: { reference: true },
    });
    if (unresolved) {
      throw new ServiceUnavailableException(
        `A previous ${category} request for this recipient is still awaiting provider reconciliation (${unresolved.reference}). Do not retry yet.`,
      );
    }

    const reference = `SS-${randomUUID()}`;
    await this.financialSafety?.reserveDailyLimit({
      userId,
      reference,
      amount: chargeAmount,
      currency: 'NGN',
      limit: this.configService.get<number>('app.transactionLimits.billsNgnDaily') || 500000,
    });
    const billMeta = {
      provider,
      recipient,
      category,
      networkId,
      rate,
      channel: 'real_ngn',
      costPrice,
      marginPct,
      ...(planCode ? { planCode, planName: planResolved?.name || null, planValidity: planResolved?.validity || null } : {}),
    };

    // Commit the debit and a durable PENDING provider operation BEFORE calling
    // Smartspeed. Never hold a database transaction open across an external
    // money-moving request: a process crash after the provider accepts the bill
    // must leave an auditable pending row, not roll the user's debit back and
    // make a retry capable of delivering the bill twice.
    const prepared = await this.prisma.$transaction(async (prisma) => {
      const lockedRows = await prisma.$queryRaw<Array<{ id: string; localBalances: any; localBalance: number; realLocalBalance: number }>>`
        SELECT "id", "localBalances", "localBalance", "realLocalBalance"
        FROM "Wallet"
        WHERE "id" = ${wallet.id}
        FOR UPDATE`;
      const lw = lockedRows[0];
      if (!lw) throw new BadRequestException('Wallet not found');

      const lockedLocals = this.parseLocalBalances(lw.localBalances, lw.localBalance || 0);
      const lockedReal = Number(lw.realLocalBalance || 0);
      if (lockedReal < chargeAmount) {
        throw new BadRequestException(
          `You need ₦${chargeAmount.toFixed(2)} of real naira for this bill — you have ₦${lockedReal.toFixed(2)}. Crypto and testnet funds can't pay bills. Fund your NGN wallet via bank transfer on the Receive page.`,
        );
      }

      const newLocalBalances = {
        ...lockedLocals,
        NGN: Math.max(0, Number(lockedLocals.NGN || 0) - chargeAmount),
      };
      // The production baseline includes localBalances. Do not fall back to a
      // second write after an ambiguous database error: that can double-debit
      // the wallet if the first statement committed but its response was lost.
      await prisma.wallet.update({
        where: { id: wallet.id },
        data: { localBalances: newLocalBalances, realLocalBalance: { decrement: chargeAmount } },
      });

      const billPayment = await prisma.billPayment.create({
        data: {
          userId,
          type: category,
          provider,
          recipient,
          amount: chargeAmount,
          usdtAmount: chargeAmount / rate,
          reference,
          status: 'PENDING',
          metadata: { ...billMeta, providerState: 'PENDING_EXTERNAL' },
        },
      });

      await this.ledger.record([
        { transferId: reference, account: this.ledger.userAccount(userId, 'NGN'), currency: 'NGN', amountMinor: -toMinor(chargeAmount, 'NGN'), reference, kind: 'BILL_PAYMENT' },
        { transferId: reference, account: this.ledger.treasuryAccount('NGN'), currency: 'NGN', amountMinor: toMinor(chargeAmount, 'NGN'), reference, kind: 'BILL_PAYMENT_SETTLEMENT' },
      ], prisma);

      const transaction = await this.transactionsService.createTransaction(prisma, {
        userId,
        type: 'BILL_PAYMENT',
        status: 'PENDING',
        amount: chargeAmount,
        fee: 0,
        currency: 'NGN',
        reference: billPayment.reference,
        metadata: {
          provider,
          recipient,
          rate,
          channel: 'real_ngn',
          providerState: 'PENDING_EXTERNAL',
          ...(planCode ? { planCode, planName: planResolved?.name || null, planValidity: planResolved?.validity || null } : {}),
        },
      });

      return { billPayment, transaction, walletId: wallet.id };
    });

    let providerBody: any;
    try {
      providerBody = await this.executeSmartspeedPurchase({
        category,
        networkId,
        providerAmount,
        recipient,
        planCode,
        portedNumber,
      });
    } catch (error: any) {
      const message = error?.message || 'Transaction failed';
      this.logger.error(`Smartspeed purchase failed (${reference}): ${message}`);

      // A timeout, connection reset, or process boundary means the provider's
      // final state is unknown. Do NOT refund and do NOT automatically retry:
      // Smartspeed may already have delivered the bill. Leave the debit and
      // PENDING row for provider reconciliation, and alert operations.
      const providerHttpStatus = Number(error?.response?.status || 0);
      const outcomeUnknown = !error?.providerOutcomeKnown && (
        error?.providerOutcomeUnknown ||
        !error?.response ||
        providerHttpStatus >= 500 ||
        [408, 409, 429].includes(providerHttpStatus)
      );
      if (outcomeUnknown) {
        await this.markBillForReconciliation(prepared, message);
        throw new ServiceUnavailableException(
          'The bill provider did not confirm the result. Your funds are held while support reconciles the payment; do not retry yet.',
        );
      }

      await this.refundPendingBill(prepared, message);
      throw new BadRequestException(`Purchase failed: ${message}`);
    }

    const completedMetadata = {
      ...((prepared.billPayment.metadata as Record<string, unknown>) || {}),
      providerState: 'COMPLETED',
      smartspeed: providerBody,
      settledAt: new Date().toISOString(),
    };
    const settled = await this.prisma.$transaction(async (prisma) => {
      const claimed = await prisma.billPayment.updateMany({
        where: { id: prepared.billPayment.id, status: 'PENDING' },
        data: { status: 'COMPLETED', metadata: completedMetadata },
      });
      if (claimed.count !== 1) return false;

      const transactionClaimed = await prisma.transaction.updateMany({
        where: { id: prepared.transaction.id, status: 'PENDING' },
        data: { status: 'COMPLETED', metadata: { ...((prepared.transaction.metadata as Record<string, unknown>) || {}), ...completedMetadata } },
      });
      if (transactionClaimed.count !== 1) {
        throw new Error(`Bill ${reference} was completed by the provider but its transaction row could not be settled.`);
      }
      return true;
    });
    if (!settled) {
      throw new ServiceUnavailableException('The bill provider completed the request but the local settlement was already claimed. Contact support before retrying.');
    }

    return { ...prepared.billPayment, status: 'COMPLETED', metadata: completedMetadata };
  }

  /**
   * Return bill reservations that require an operator/provider decision. This
   * endpoint intentionally does not infer a result from age, amount, or a
   * missing response.
   */
  async listPendingReconciliation(limit = 100) {
    const take = Math.min(200, Math.max(1, Number(limit) || 100));
    const rows = await this.prisma.billPayment.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take,
      select: { id: true, reference: true, userId: true, type: true, provider: true, recipient: true, amount: true, status: true, metadata: true, createdAt: true },
    });
    return rows.map((row) => ({
      ...row,
      ageSeconds: Math.max(0, Math.floor((Date.now() - new Date(row.createdAt).getTime()) / 1000)),
      reconciliationRequired: Boolean((row.metadata as any)?.reconciliationRequired),
    }));
  }

  /**
   * Resolve a pending bill only from explicit provider evidence supplied by an
   * authorized operator. A failed resolution refunds the already-committed
   * reservation exactly once; a completed resolution only releases the pending
   * state because the debit already represents the provider settlement.
   */
  async resolvePendingBill(reference: string, outcome: string, evidence: unknown) {
    const normalizedOutcome = String(outcome || '').toUpperCase();
    if (!['COMPLETED', 'FAILED'].includes(normalizedOutcome)) {
      throw new BadRequestException('Reconciliation outcome must be COMPLETED or FAILED.');
    }
    const resolutionEvidence = this.normalizeReconciliationEvidence(evidence);
    const billPayment = await this.prisma.billPayment.findUnique({ where: { reference } });
    if (!billPayment) throw new NotFoundException('Bill reservation not found.');
    const transaction = await this.prisma.transaction.findUnique({ where: { reference } });
    if (!transaction) throw new NotFoundException('Bill transaction record not found.');
    if (billPayment.status !== 'PENDING' || transaction.status !== 'PENDING') {
      throw new ConflictException('This bill is already in a terminal state; no reconciliation mutation was made.');
    }

    if (normalizedOutcome === 'COMPLETED') {
      const metadata = {
        ...((billPayment.metadata as Record<string, unknown>) || {}),
        providerState: 'COMPLETED_CONFIRMED_BY_OPERATOR',
        reconciliationRequired: false,
        reconciliationEvidence: resolutionEvidence,
        settledAt: new Date().toISOString(),
      };
      const claimed = await this.prisma.$transaction(async (prisma) => {
        const billClaim = await prisma.billPayment.updateMany({
          where: { id: billPayment.id, status: 'PENDING' },
          data: { status: 'COMPLETED', metadata },
        });
        if (billClaim.count !== 1) return false;
        const txClaim = await prisma.transaction.updateMany({
          where: { id: transaction.id, status: 'PENDING' },
          data: {
            status: 'COMPLETED',
            metadata: { ...((transaction.metadata as Record<string, unknown>) || {}), ...metadata },
          },
        });
        if (txClaim.count !== 1) throw new Error(`Bill ${reference} could not be settled atomically.`);
        return true;
      });
      if (!claimed) throw new ConflictException('Another reconciliation worker already claimed this bill.');
      return { reference, status: 'COMPLETED', resolutionEvidence };
    }

    const wallet = await this.prisma.wallet.findUnique({ where: { userId: billPayment.userId }, select: { id: true } });
    if (!wallet) throw new NotFoundException('Wallet for bill reservation not found.');
    await this.refundPendingBill(
      { billPayment, transaction, walletId: wallet.id },
      `Provider failure confirmed by operator: ${resolutionEvidence.providerStatus}`,
      { reconciliationRequired: false, reconciliationEvidence: resolutionEvidence, resolvedByOperator: true },
    );
    const finalTransaction = await this.prisma.transaction.findUnique({ where: { reference } });
    if (finalTransaction?.status !== 'FAILED') {
      throw new ConflictException('The bill could not be atomically refunded; it remains pending for reconciliation.');
    }
    return { reference, status: 'FAILED', resolutionEvidence };
  }

  private normalizeReconciliationEvidence(evidence: unknown) {
    const value = evidence && typeof evidence === 'object' ? evidence as Record<string, unknown> : {};
    const providerReference = String(value.providerReference || '').trim().slice(0, 200);
    const providerStatus = String(value.providerStatus || '').trim().toUpperCase().slice(0, 100);
    const note = String(value.note || '').trim().slice(0, 1000);
    if (!providerReference || !providerStatus) {
      throw new BadRequestException('Provider reference and provider status are required reconciliation evidence.');
    }
    return { providerReference, providerStatus, ...(note ? { note } : {}), checkedAt: new Date().toISOString() };
  }

  private parseLocalBalances(raw: unknown, fallbackNgn = 0): Record<string, number> {
    const parsed = typeof raw === 'string'
      ? (() => { try { return JSON.parse(raw); } catch { return {}; } })()
      : raw;
    const balances = parsed && typeof parsed === 'object'
      ? { ...(parsed as Record<string, number>) }
      : {};
    if (!balances.NGN && fallbackNgn > 0) balances.NGN = fallbackNgn;
    return balances;
  }

  private async executeSmartspeedPurchase(params: {
    category: string;
    networkId: number;
    providerAmount: number;
    recipient: string;
    planCode?: string;
    portedNumber?: boolean;
  }) {
    const payload: Record<string, unknown> = { Ported_number: Boolean(params.portedNumber) };
    let endpoint: string;
    if (params.category === 'airtime') {
      endpoint = '/topup/';
      payload.network = params.networkId;
      payload.amount = params.providerAmount;
      payload.mobile_number = params.recipient;
      payload.airtime_type = 'VTU';
    } else {
      endpoint = '/data/';
      payload.network = params.networkId;
      payload.mobile_number = params.recipient;
      payload.plan = Number(params.planCode) || params.planCode;
    }

    const headers = this.smartspeedHeaders();
    try {
      const response = await axios.post(`${this.smartspeedBaseUrl()}${endpoint}`, payload, {
        headers,
        timeout: 60000,
      });
      const body = response.data;
      this.assertPurchaseConfirmed(body);
      return body;
    } catch (error: any) {
      // A provider HTTP response or an explicit failure body is a known
      // outcome. Transport errors are deliberately unknown because the request
      // may have reached Smartspeed before the connection failed.
      if (!error?.response && !error?.providerOutcomeKnown) {
        if (error) error.providerOutcomeUnknown = true;
        else {
          const unknown: any = new Error('Smartspeed returned no result.');
          unknown.providerOutcomeUnknown = true;
          throw unknown;
        }
      }
      throw error;
    }
  }

  private async markBillForReconciliation(prepared: any, message: string) {
    const billMetadata = {
      ...((prepared.billPayment.metadata as Record<string, unknown>) || {}),
      providerState: 'UNKNOWN_REQUIRES_RECONCILIATION',
      reconciliationRequired: true,
      reconciliationMessage: String(message).slice(0, 500),
    };
    const txMetadata = {
      ...((prepared.transaction.metadata as Record<string, unknown>) || {}),
      providerState: 'UNKNOWN_REQUIRES_RECONCILIATION',
      reconciliationRequired: true,
      reconciliationMessage: String(message).slice(0, 500),
    };
    try {
      await this.prisma.$transaction(async (prisma) => {
        await prisma.billPayment.updateMany({
          where: { id: prepared.billPayment.id, status: 'PENDING' },
          data: { metadata: billMetadata },
        });
        await prisma.transaction.updateMany({
          where: { id: prepared.transaction.id, status: 'PENDING' },
          data: { metadata: txMetadata },
        });
      });
    } catch (error: any) {
      this.logger.error(`Could not mark bill ${prepared.billPayment.reference} for reconciliation: ${error?.message || error}`);
    }
  }

  private async refundPendingBill(prepared: any, message: string, metadataPatch: Record<string, unknown> = {}) {
    await this.prisma.$transaction(async (prisma) => {
      const claimed = await prisma.billPayment.updateMany({
        where: { id: prepared.billPayment.id, status: 'PENDING' },
        data: {
          status: 'FAILED',
          metadata: {
            ...((prepared.billPayment.metadata as Record<string, unknown>) || {}),
            providerState: metadataPatch.providerState || 'FAILED',
            error: String(message).slice(0, 500),
            ...metadataPatch,
          } as any,
        },
      });
      if (claimed.count !== 1) return;

      const rows = await prisma.$queryRaw<Array<{ id: string; localBalances: any; localBalance: number }>>`
        SELECT "id", "localBalances", "localBalance"
        FROM "Wallet"
        WHERE "id" = ${prepared.walletId}
        FOR UPDATE`;
      const walletRow = rows[0];
      if (!walletRow) throw new Error(`Wallet missing while refunding bill ${prepared.billPayment.reference}`);
      const balances = this.parseLocalBalances(walletRow.localBalances, walletRow.localBalance || 0);
      const refundAmount = Number(prepared.billPayment.amount);
      balances.NGN = Number(balances.NGN || 0) + refundAmount;
      // As with the reservation, one unambiguous wallet write is required.
      // Schema compatibility fallbacks would risk a double refund after a
      // database response timeout.
      await prisma.wallet.update({
        where: { id: walletRow.id },
        data: { localBalances: balances, realLocalBalance: { increment: refundAmount } },
      });

      await this.ledger.reverse(prepared.billPayment.reference, prisma);
      const transactionClaimed = await prisma.transaction.updateMany({
        where: { id: prepared.transaction.id, status: 'PENDING' },
        data: {
          status: 'FAILED',
          metadata: {
            ...((prepared.transaction.metadata as Record<string, unknown>) || {}),
            providerState: metadataPatch.providerState || 'FAILED',
            error: String(message).slice(0, 500),
            ...metadataPatch,
          } as any,
        },
      });
      if (transactionClaimed.count !== 1) {
        throw new Error(`Bill ${prepared.billPayment.reference} refund lost its transaction claim; rolled back for reconciliation.`);
      }
    });
  }

  @Interval(60000)
  async reportStaleBills() {
    try {
      const stale = await this.prisma.billPayment.findMany({
        where: { status: 'PENDING', createdAt: { lt: new Date(Date.now() - 5 * 60 * 1000) } },
        select: { reference: true, userId: true, amount: true, metadata: true, createdAt: true },
        take: 100,
      });
      for (const bill of stale) {
        this.logger.error(`STALE BILL REQUIRES PROVIDER RECONCILIATION reference=${bill.reference} user=${bill.userId} amount=${bill.amount} metadata=${JSON.stringify(bill.metadata)}`);
      }
      return stale.length;
    } catch (error: any) {
      this.logger.error(`stale bill scan failed: ${error?.message || error}`);
      return 0;
    }
  }
}
