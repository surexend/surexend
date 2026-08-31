import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BillsService } from '../bills/bills.service';
import { CampaignsService } from '../campaigns/campaigns.service';
import { WalletsService } from '../wallets/wallets.service';
import { getLocalRate } from '../common/currency.constants';
import { LedgerService } from '../common/ledger.service';
import { toMinor } from '../common/money';
import axios from 'axios';
import * as crypto from 'crypto';

// The customer offer is deliberately denominated in USDT. The wallet itself
// is a Circle wallet funded by operations with USDC; before payouts, ops swaps
// or provisions the matching USDT balance on the configured supported chain.
const REFERRAL_REWARD_CAMPAIGN = 'FIVE_REFERRALS_USDT';
const REFERRAL_REWARD_CURRENCY = 'USDT';
const REFERRAL_REWARD_AMOUNT = 5;
const REFERRAL_REWARD_REQUIRED = 5;
const REFERRAL_REWARD_WALLET_KEY = 'REFERRAL_REWARDS';

// Normalize any recorded transaction amount to its USD value. Transactions
// store `amount` in `currency` (e.g. CONVERT rows record the LOCAL amount, bill
// rows record USDT) so a raw sum across currencies is meaningless — the admin
// dashboard must sum in USD terms. Live rates (same source the app uses) are
// preferred so admin figures match what users see; the static table is the
// reliable fallback when the rate feed is unreachable.
function toUsd(amount: number, currency: string, liveRates?: Record<string, number>): number {
  const code = (currency || 'USDT').toUpperCase();
  if (code === 'USD' || code === 'USDT' || code === 'USDC') return amount;
  const rate = liveRates?.[code] || getLocalRate(code);
  return rate > 0 ? amount / rate : amount;
}

const RATE_TTL_MS = 30 * 60 * 1000;
let cachedRates: Record<string, number> | null = null;
let cachedAt = 0;

// Live USD rates from the same feed the user app uses (floatrates), cached
// 30 min. Never throws: returns {} so the static table is used as fallback.
async function getLiveRates(): Promise<Record<string, number>> {
  const now = Date.now();
  if (cachedRates && now - cachedAt < RATE_TTL_MS) return cachedRates;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch('https://www.floatrates.com/daily/usd.json', { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) {
      const json: Record<string, { rate?: number }> = await res.json();
      const map: Record<string, number> = {};
      for (const key of Object.keys(json)) {
        const r = Number(json[key]?.rate);
        if (r > 0) map[key.toUpperCase()] = r;
      }
      cachedRates = map;
      cachedAt = now;
      return map;
    }
  } catch {
    // rate feed unavailable — fall back to static table
  }
  return cachedRates || {};
}

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);
  private readonly circleBaseUrl = 'https://api.circle.com';

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly billsService: BillsService,
    private readonly campaignsService: CampaignsService,
    private readonly ledger: LedgerService,
    private readonly configService: ConfigService,
    private readonly walletsService: WalletsService,
  ) {}

  async getOverview() {
    const [totalUsers, activeUsers, kycPending, totalTransactions, completedTransactions, moneyIn, convertTxs, moneyOut, conversionFeeAgg, recentUsers, recentTransactions] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isActive: true, isBanned: false } }),
      this.prisma.user.count({ where: { kycStatus: 'PENDING' } }),
      this.prisma.transaction.count(),
      this.prisma.transaction.count({ where: { status: 'COMPLETED' } }),
      // Money in: deposits + referral earnings only.
      this.prisma.transaction.findMany({
        where: { status: 'COMPLETED', type: { in: ['RECEIVE', 'REFERRAL_EARNING'] } },
        select: { amount: true, currency: true },
      }),
      // All conversions, so direction is classified below (buy crypto =
      // fiat in, sell crypto = fiat out). Fetching them apart avoids treating
      // every CONVERT as money out.
      this.prisma.transaction.findMany({
        where: { status: 'COMPLETED', type: 'CONVERT' },
        select: { amount: true, currency: true, fee: true, metadata: true },
      }),
      // Money out: sends, withdrawals and bills (cash leaving the platform).
      // Each creates its own Transaction row, so this list is complete — bills
      // are NOT double-counted.
      this.prisma.transaction.findMany({
        where: { status: 'COMPLETED', type: { in: ['SEND', 'WITHDRAWAL', 'BILL_PAYMENT'] } },
        select: { amount: true, currency: true, fee: true },
      }),
      this.prisma.conversion.aggregate({
        where: { status: 'COMPLETED' },
        _sum: { fee: true },
      }),
      this.prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        take: 7,
        select: { id: true, firstName: true, lastName: true, email: true, kycStatus: true, createdAt: true },
      }),
      this.prisma.transaction.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { user: { select: { firstName: true, lastName: true, email: true } } },
      }),
    ]);

    // Sum every amount converted to USD (never a raw cross-currency sum).
    // A conversion is money OUT only when USD-family is sold for fiat; buying
    // crypto (fiat -> USD) is money IN (fiat received by the platform).
    const sellConverts = convertTxs.filter(
      (t) => ['USDT', 'USDC', 'USD'].includes(String((t.metadata as any)?.from || t.currency || '').toUpperCase()),
    );
    const buyConverts = convertTxs.filter((t) => !sellConverts.includes(t));
    const liveRates = await getLiveRates();
    const totalVolumeIn = [...moneyIn, ...buyConverts].reduce((acc, t) => acc + toUsd(t.amount, t.currency, liveRates), 0);
    const totalVolumeOut = [...moneyOut, ...sellConverts].reduce((acc, t) => acc + toUsd(t.amount, t.currency, liveRates), 0);
    // Fees are denominated in each transaction's own currency. Normalize them
    // before aggregation so a local-currency fee can never inflate USD revenue.
    const revenueFromTxs = moneyOut.reduce((acc, t) => acc + toUsd(t.fee || 0, t.currency, liveRates), 0);

    const since = new Date();
    since.setDate(since.getDate() - 6);
    since.setHours(0, 0, 0, 0);
    const last7Days = await this.prisma.user.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true },
    });
    const signups = Array.from({ length: 7 }, (_, i) => {
      const day = new Date(since);
      day.setDate(since.getDate() + i);
      const key = day.toISOString().slice(0, 10);
      return {
        date: key,
        label: day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        count: last7Days.filter((u) => new Date(u.createdAt).toISOString().slice(0, 10) === key).length,
      };
    });

    return {
      totalUsers,
      activeUsers,
      kycPending,
      totalTransactions,
      completedTransactions,
      totalVolumeIn,
      totalVolumeOut,
      revenue: (revenueFromTxs + (conversionFeeAgg._sum.fee ?? 0)),
      signups: signups.reverse(),
      recentUsers: recentUsers.reverse(),
      recentTransactions,
    };
  }

  async listUsers(query: { search?: string; kycStatus?: string; sort?: string; page?: string; limit?: string }) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const where: Record<string, unknown> = {};
    if (query.search) {
      const q = query.search;
      where.OR = [
        { email: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q } },
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
        { surexTag: { contains: q, mode: 'insensitive' } },
      ];
    }
    if (query.kycStatus && ['UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED'].includes(query.kycStatus.toUpperCase())) {
      where.kycStatus = query.kycStatus.toUpperCase();
    }

    // Stablecoin amounts are all USD-denominated. Ordering them in the database
    // gives the operations team a truthful ascending/descending balance view
    // without incorrectly mixing Naira, Cedi, and USDC into one raw number.
    const sort = ['balance_asc', 'balance_desc', 'recent'].includes(query.sort || '') ? query.sort! : 'recent';
    const orderBy: any = sort === 'balance_asc'
      ? [{ wallet: { usdcBalance: 'asc' } }, { createdAt: 'desc' }]
      : sort === 'balance_desc'
        ? [{ wallet: { usdcBalance: 'desc' } }, { createdAt: 'desc' }]
        : { createdAt: 'desc' };

    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          surexTag: true,
          kycStatus: true,
          kycTier: true,
          isActive: true,
          isBanned: true,
          role: true,
          createdAt: true,
          _count: { select: { referralsMade: true } },
          wallet: { select: { usdtBalance: true, usdcBalance: true, lockedBalance: true, localBalance: true, localBalances: true, realLocalBalance: true } },
        },
      }),
    ]);

    return { total, page, limit, sort, users };
  }

  async getUserDetail(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        surexTag: true,
        kycStatus: true,
        kycTier: true,
        isActive: true,
        isBanned: true,
        role: true,
        twoFactorEnabled: true,
        currencyDisplay: true,
        defaultWallet: true,
        referralCode: true,
        createdAt: true,
        updatedAt: true,
        wallet: { select: { usdtBalance: true, usdcBalance: true, lockedBalance: true, localBalance: true, localBalances: true, realLocalBalance: true, pendingBalance: true } },
        bankAccounts: true,
        kycDocuments: { orderBy: { createdAt: 'desc' } },
        referralsMade: { include: { referred: { select: { id: true, firstName: true, lastName: true, email: true, createdAt: true } } } },
        referredUsers: { include: { referrer: { select: { id: true, firstName: true, lastName: true, email: true, referralCode: true } } } },
      },
    });
    if (!user) return null;

    const [transactions, conversions, bills] = await Promise.all([
      this.prisma.transaction.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 20 }),
      this.prisma.conversion.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 20 }),
      this.prisma.billPayment.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 20 }),
    ]);

    return { ...user, activity: { transactions, conversions, bills } };
  }

  async updateUser(id: string, body: { isActive?: boolean; isBanned?: boolean; kycStatus?: string; kycTier?: number; role?: string; email?: string; phone?: string }) {
    const data: Record<string, unknown> = {};
    if (typeof body.isActive === 'boolean') data.isActive = body.isActive;
    if (typeof body.isBanned === 'boolean') data.isBanned = body.isBanned;
    if (typeof body.kycTier === 'number') data.kycTier = body.kycTier;
    if (body.kycStatus && ['UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED'].includes(body.kycStatus)) data.kycStatus = body.kycStatus;
    if (body.role && ['USER', 'ADMIN'].includes(body.role)) data.role = body.role;
    if (body.email) data.email = body.email.toLowerCase().trim();
    if (body.phone) data.phone = body.phone.trim();

    try {
      const updated = await this.prisma.user.update({ where: { id }, data });
      return { id: updated.id, role: updated.role, email: updated.email, phone: updated.phone, isActive: updated.isActive, isBanned: updated.isBanned, kycStatus: updated.kycStatus, kycTier: updated.kycTier };
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new Error('Email or phone is already in use');
      }
      throw error;
    }
  }

  // Hard-delete a user (cascades wallet, transactions, kyc docs, notifications).
  // Guardrails: can't delete yourself, and can't delete the last remaining admin.
  async deleteUser(id: string, adminId: string) {
    if (id === adminId) throw new BadRequestException('You cannot delete your own account');

    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    if (user.role === 'ADMIN') {
      const adminCount = await this.prisma.user.count({ where: { role: 'ADMIN' } });
      if (adminCount <= 1) throw new BadRequestException('Cannot delete the last admin account');
    }

    await this.prisma.user.delete({ where: { id } });
    return { message: 'User deleted', id };
  }

  // Manual deposits: admin credits a user's balance after confirming an
  // off-platform transfer. USDT/USDC credit the stablecoin (testnet) wallet;
  // NGN credits REAL naira (realLocalBalance) that can pay bills/withdrawals.
  async creditBalance(userId: string, adminId: string, body: { amount: number; currency?: string; note?: string }) {
    const amount = Number(body.amount);
    if (!amount || amount <= 0) throw new Error('Amount must be greater than zero');
    // USDC-only product: manual credits must never recreate the invisible USDT
    // bucket. NGN credits real naira; USDC credits the stablecoin wallet.
    const currency = (body.currency || 'USDC').toUpperCase();
    if (!['USDC', 'NGN'].includes(currency)) throw new Error('Currency must be USDC or NGN');

    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new Error('Wallet not found');

    const reference = `DEP-${Date.now()}${Math.floor(Math.random() * 1000)}`;

    const result = await this.prisma.$transaction(async (prisma) => {
      if (currency === 'NGN') {
        let localBalances: Record<string, number> = {};
        try {
          const parsed = wallet.localBalances as any;
          if (parsed && typeof parsed === 'object') localBalances = { ...parsed };
        } catch { /* ignore */ }
        localBalances['NGN'] = (localBalances['NGN'] || 0) + amount;
        try {
          await prisma.wallet.update({
            where: { userId },
            data: { localBalances, realLocalBalance: { increment: amount } },
          });
        } catch {
          await prisma.wallet.update({
            where: { userId },
            data: { localBalance: localBalances['NGN'] ?? 0, realLocalBalance: { increment: amount } },
          });
        }
      } else {
        await prisma.wallet.update({ where: { userId }, data: { usdcBalance: { increment: amount } } });
      }

      await this.ledger.record([
        { transferId: reference, account: this.ledger.externalAccount('manual', currency), currency, amountMinor: -toMinor(amount, currency), reference, kind: 'ADMIN_CREDIT_SOURCE' },
        { transferId: reference, account: this.ledger.userAccount(userId, currency), currency, amountMinor: toMinor(amount, currency), reference, kind: 'ADMIN_CREDIT' },
      ], prisma);

      const transaction = await prisma.transaction.create({
        data: {
          userId,
          type: 'RECEIVE',
          status: 'COMPLETED',
          amount,
          fee: 0,
          currency,
          reference,
          metadata: { channel: 'manual_deposit', creditedBy: adminId, note: body.note || 'Manual deposit' },
        },
      });
      return transaction;
    });

    try {
      await this.notificationsService.createNotification(userId, {
        title: 'Deposit Received',
        body: `${amount} ${currency} credited to your wallet${body.note ? ` (${body.note})` : ''}. Reference: ${reference}`,
        type: 'DEPOSIT',
        data: { reference, amount, currency },
      });
    } catch { /* notifications are best-effort */ }

    return { reference, amount, currency, transactionId: result.id };
  }

  async listTransactions(query: { type?: string; status?: string; search?: string; page?: string; limit?: string }) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const where: Record<string, unknown> = {};
    if (query.type && ['SEND', 'RECEIVE', 'CONVERT', 'BILL_PAYMENT', 'REFERRAL_EARNING', 'WITHDRAWAL'].includes(query.type.toUpperCase())) {
      where.type = query.type.toUpperCase();
    }
    if (query.status && ['PENDING', 'COMPLETED', 'FAILED'].includes(query.status.toUpperCase())) {
      where.status = query.status.toUpperCase();
    }
    if (query.search) {
      where.OR = [
        { reference: { contains: query.search, mode: 'insensitive' } },
        { user: { is: { email: { contains: query.search, mode: 'insensitive' } } } },
      ];
    }

    const [total, transactions] = await Promise.all([
      this.prisma.transaction.count({ where }),
      this.prisma.transaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { user: { select: { firstName: true, lastName: true, email: true } } },
      }),
    ]);

    return { total, page, limit, transactions };
  }

  private get circleApiKey() {
    return this.configService.get<string>('app.circle.apiKey') || '';
  }

  private get circleEntitySecret() {
    return this.configService.get<string>('app.circle.entitySecret') || '';
  }

  private get circleWalletSetId() {
    return this.configService.get<string>('app.circle.walletSetId') || '';
  }

  private get referralRewardUsdtTokenAddress() {
    return this.configService.get<string>('app.circle.referralRewardUsdtTokenAddress') || '';
  }

  private get referralRewardBlockchainOverride() {
    return this.configService.get<string>('app.circle.referralRewardBlockchain') || '';
  }

  private assertCircleConfigured() {
    if (!this.circleApiKey || !this.circleEntitySecret) {
      throw new BadRequestException('Circle wallet credentials are not configured. Add CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET before creating the campaign wallet.');
    }
  }

  private assertReferralRewardPayoutConfigured() {
    this.assertCircleConfigured();
    if (!this.referralRewardUsdtTokenAddress) {
      throw new BadRequestException('Set CIRCLE_REFERRAL_REWARD_USDT_TOKEN_ADDRESS for the selected Circle blockchain before paying USDT rewards.');
    }
  }

  private encryptCircleEntitySecret(secretHex: string, publicKeyPem: string): string {
    return crypto.publicEncrypt(
      {
        key: publicKeyPem,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      Buffer.from(secretHex, 'hex'),
    ).toString('base64');
  }

  private referralRewardBlockchain(): string {
    // Must be a Circle-supported chain where the configured USDT contract is
    // deployed. ARC remains the existing default for USDC treasury operations.
    return this.referralRewardBlockchainOverride || (this.circleApiKey.startsWith('TEST_') ? 'ARC-TESTNET' : 'ARC');
  }

  private referralRewardNetwork(): string {
    const chain = this.referralRewardBlockchain().toUpperCase();
    if (chain.includes('MATIC') || chain === 'POLYGON') return 'POLYGON';
    if (chain.includes('ETH')) return 'ETHEREUM';
    if (chain.includes('ARB')) return 'ARBITRUM';
    if (chain.includes('BASE')) return 'BASE';
    if (chain.includes('OP')) return 'OPTIMISM';
    return 'ARC';
  }

  private async getCircleWalletBalances(circleWalletId: string) {
    const response = await axios.get(`${this.circleBaseUrl}/v1/w3s/wallets/${circleWalletId}/balances`, {
      headers: { Authorization: `Bearer ${this.circleApiKey}`, accept: 'application/json' },
      timeout: 15_000,
    });
    const tokenBalances = response.data?.data?.tokenBalances || [];
    const balances = tokenBalances.map((balance: any) => ({
      tokenId: balance.token?.id || null,
      symbol: (balance.token?.symbol || '').toUpperCase(),
      amount: Number(balance.amount || 0),
      tokenAddress: balance.token?.tokenAddress || balance.token?.address || null,
    }));
    return {
      balances,
      usdcBalance: balances.find((balance: any) => balance.symbol === 'USDC')?.amount || 0,
      usdtBalance: balances.find((balance: any) => balance.symbol === 'USDT')?.amount || 0,
    };
  }

  // The referral campaign wallet is a real Circle W3S wallet. It deliberately
  // has no user-owner relationship, so funding and outbound reward activity is
  // clearly isolated from customer funds in the Circle console and our database.
  async getReferralRewardWallet() {
    const wallet = await this.prisma.platformWallet.findUnique({ where: { key: REFERRAL_REWARD_WALLET_KEY } });
    // A wallet set ID is optional: when absent, SureXend creates a dedicated
    // campaign wallet set and stores it in the platform-wallet record.
    const circleConfigured = !!(this.circleApiKey && this.circleEntitySecret);
    const payoutConfigured = circleConfigured && !!this.referralRewardUsdtTokenAddress;
    if (!wallet) {
      return {
        configured: circleConfigured,
        payoutConfigured,
        created: false,
        wallet: null,
        campaign: { requiredReferrals: REFERRAL_REWARD_REQUIRED, reward: REFERRAL_REWARD_AMOUNT, currency: REFERRAL_REWARD_CURRENCY },
      };
    }

    let balances: { balances: Array<{ tokenId: string | null; symbol: string; amount: number; tokenAddress: string | null }>; usdcBalance: number; usdtBalance: number } | null = null;
    let balanceError: string | null = null;
    if (circleConfigured && wallet.circleWalletId) {
      try {
        balances = await this.getCircleWalletBalances(wallet.circleWalletId);
      } catch (error: any) {
        balanceError = error.response?.data?.message || error.message || 'Circle balance is temporarily unavailable.';
        this.logger.warn(`Could not retrieve referral wallet balance: ${balanceError}`);
      }
    }

    return {
      configured: circleConfigured,
      payoutConfigured,
      created: !!wallet.circleWalletId,
      wallet: {
        id: wallet.id,
        label: wallet.label,
        circleWalletId: wallet.circleWalletId,
        walletSetId: wallet.walletSetId,
        blockchain: wallet.blockchain,
        address: wallet.address,
        currency: wallet.currency,
        status: wallet.status,
        // USDC is the treasury funding balance; USDT is the amount that can
        // actually satisfy the customer campaign promise.
        usdcBalance: balances?.usdcBalance ?? null,
        usdtBalance: balances?.usdtBalance ?? null,
        balance: balances?.usdtBalance ?? null,
        balances: balances?.balances ?? [],
        balanceError,
      },
      campaign: { requiredReferrals: REFERRAL_REWARD_REQUIRED, reward: REFERRAL_REWARD_AMOUNT, currency: REFERRAL_REWARD_CURRENCY },
    };
  }

  async createReferralRewardWallet(adminId: string) {
    const existing = await this.prisma.platformWallet.findUnique({ where: { key: REFERRAL_REWARD_WALLET_KEY } });
    if (existing?.circleWalletId) return this.getReferralRewardWallet();
    this.assertCircleConfigured();

    // Persist a deterministic platform record first. This makes a failed Circle
    // attempt visible to operations instead of silently creating a second wallet
    // on the next click.
    const record = existing || await this.prisma.platformWallet.create({
      data: {
        key: REFERRAL_REWARD_WALLET_KEY,
        label: 'Referral rewards wallet',
        // Existing Circle wallet sets remain supported, but a new project can
        // leave this blank and let the secure flow create one automatically.
        walletSetId: this.circleWalletSetId || null,
        blockchain: this.referralRewardBlockchain(),
        currency: 'USDC',
        status: 'CREATING',
      },
    });

    try {
      const publicKeyResponse = await axios.get(`${this.circleBaseUrl}/v1/w3s/config/entity/publicKey`, {
        headers: { Authorization: `Bearer ${this.circleApiKey}`, accept: 'application/json' },
        timeout: 15_000,
      });
      const publicKey = publicKeyResponse.data?.data?.publicKey;
      if (!publicKey) throw new Error('Circle did not return the entity public key.');

      // Circle requires every developer-controlled wallet to belong to a wallet
      // set. A configured ID is reused, otherwise we create a dedicated one and
      // persist it—operators never need to create or paste a campaign wallet.
      let walletSetId = record.walletSetId || this.circleWalletSetId;
      if (!walletSetId) {
        const createSetResponse = await axios.post(
          `${this.circleBaseUrl}/v1/w3s/developer/walletSets`,
          {
            idempotencyKey: crypto.randomUUID(),
            entitySecretCiphertext: this.encryptCircleEntitySecret(this.circleEntitySecret, publicKey),
            name: 'SureXend Referral Rewards',
          },
          {
            headers: { Authorization: `Bearer ${this.circleApiKey}`, 'Content-Type': 'application/json', accept: 'application/json' },
            timeout: 30_000,
          },
        );
        walletSetId = createSetResponse.data?.data?.walletSet?.id;
        if (!walletSetId) throw new Error('Circle did not return a wallet set id.');
        await this.prisma.platformWallet.update({ where: { id: record.id }, data: { walletSetId } });
        this.logger.log(`Created Circle referral reward wallet set ${walletSetId}`);
      }

      const entitySecretCiphertext = this.encryptCircleEntitySecret(this.circleEntitySecret, publicKey);
      const createResponse = await axios.post(
        `${this.circleBaseUrl}/v1/w3s/developer/wallets`,
        {
          idempotencyKey: crypto.randomUUID(),
          blockchains: [this.referralRewardBlockchain()],
          entitySecretCiphertext,
          walletSetId,
          metadata: [{ name: 'SureXend Referral Rewards Treasury', refId: REFERRAL_REWARD_WALLET_KEY }],
        },
        {
          headers: { Authorization: `Bearer ${this.circleApiKey}`, 'Content-Type': 'application/json', accept: 'application/json' },
          timeout: 30_000,
        },
      );
      const circleWallet = createResponse.data?.data?.wallets?.[0];
      if (!circleWallet?.id || !circleWallet?.address) throw new Error('Circle did not return a wallet id and address.');

      await this.prisma.platformWallet.update({
        where: { id: record.id },
        data: {
          circleWalletId: circleWallet.id,
          address: circleWallet.address,
          blockchain: (circleWallet.blockchains || [this.referralRewardBlockchain()])[0],
          status: 'ACTIVE',
        },
      });
      await this.prisma.auditLog.create({
        data: {
          userId: adminId,
          action: 'REFERRAL_REWARD_WALLET_CREATED',
          metadata: { platformWalletId: record.id, circleWalletId: circleWallet.id, address: circleWallet.address },
        },
      });
      return this.getReferralRewardWallet();
    } catch (error: any) {
      const message = error.response?.data?.message || error.message || 'Circle wallet creation failed.';
      await this.prisma.platformWallet.update({ where: { id: record.id }, data: { status: 'ERROR' } });
      this.logger.error(`Could not create referral reward wallet: ${message}`);
      throw new BadRequestException(message);
    }
  }

  // Materialize eligibility idempotently. Reaching the fifth active, attributed
  // referral creates a single entitlement; it does not credit any wallet until
  // an operator authorizes a real Circle payout from the campaign wallet.
  private async materializeReferralRewardEligibility() {
    const grouped = await this.prisma.referral.groupBy({
      by: ['referrerId'],
      where: { isActive: true },
      _count: { _all: true },
    });
    await Promise.all(grouped
      .filter((entry) => entry._count._all >= REFERRAL_REWARD_REQUIRED)
      .map((entry) => this.prisma.referralReward.upsert({
        where: { userId_campaign: { userId: entry.referrerId, campaign: REFERRAL_REWARD_CAMPAIGN } },
        update: { referralCount: entry._count._all },
        create: {
          userId: entry.referrerId,
          campaign: REFERRAL_REWARD_CAMPAIGN,
          requiredReferrals: REFERRAL_REWARD_REQUIRED,
          referralCount: entry._count._all,
          amount: REFERRAL_REWARD_AMOUNT,
          currency: REFERRAL_REWARD_CURRENCY,
          reference: `RWD-${crypto.randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase()}`,
        },
      })));
  }

  async listReferralRewards(query: { status?: string; page?: string; limit?: string }) {
    await this.materializeReferralRewardEligibility();
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const status = (query.status || '').toUpperCase();
    const where: any = {};
    if (['ELIGIBLE', 'PROCESSING', 'PENDING', 'PAID', 'FAILED'].includes(status)) where.status = status;
    const [total, rewards] = await Promise.all([
      this.prisma.referralReward.count({ where }),
      this.prisma.referralReward.findMany({
        where,
        orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true, surexTag: true } },
          platformWallet: { select: { label: true, address: true, circleWalletId: true } },
        },
      }),
    ]);
    return {
      total,
      page,
      limit,
      campaign: { requiredReferrals: REFERRAL_REWARD_REQUIRED, reward: REFERRAL_REWARD_AMOUNT, currency: REFERRAL_REWARD_CURRENCY },
      rewards,
    };
  }

  async payReferralReward(rewardId: string, adminId: string) {
    // Claim first so a double click or two operators can never submit two Circle
    // transfers for one reward. A failed chain request deliberately becomes
    // FAILED, which can be explicitly retried by an authorized operator.
    const claimed = await this.prisma.referralReward.updateMany({
      where: { id: rewardId, status: { in: ['ELIGIBLE', 'FAILED'] } },
      data: { status: 'PROCESSING', failureReason: null, approvedById: adminId },
    });
    if (!claimed.count) throw new BadRequestException('This reward is already being processed or has already been paid.');

    const reward = await this.prisma.referralReward.findUnique({ where: { id: rewardId } });
    if (!reward) throw new NotFoundException('Referral reward not found.');
    try {
      const source = await this.prisma.platformWallet.findUnique({ where: { key: REFERRAL_REWARD_WALLET_KEY } });
      if (!source?.circleWalletId || !source.address || source.status !== 'ACTIVE') {
        throw new BadRequestException('Create and fund the Referral rewards wallet before paying a reward.');
      }
      this.assertReferralRewardPayoutConfigured();
      if (reward.currency !== REFERRAL_REWARD_CURRENCY) {
        throw new BadRequestException(`This campaign pays ${REFERRAL_REWARD_CURRENCY}; legacy ${reward.currency} entitlements must be migrated or cancelled before payout.`);
      }
      const balance = await this.getCircleWalletBalances(source.circleWalletId);
      if (balance.usdtBalance < reward.amount) {
        throw new BadRequestException(`Referral rewards wallet has ${balance.usdtBalance.toFixed(2)} USDT available; ${reward.amount.toFixed(2)} USDT is required. Fund the Circle treasury with USDC, then provision USDT on ${source.blockchain} before submitting payouts.`);
      }

      let recipientAddress = await this.prisma.walletAddress.findFirst({
        where: { wallet: { userId: reward.userId }, network: this.referralRewardNetwork() },
        select: { address: true },
      });
      if (!recipientAddress) {
        const created = await this.walletsService.getDepositAddress(
          reward.userId,
          this.referralRewardNetwork(),
          source.walletSetId || undefined,
        );
        recipientAddress = { address: created.address };
      }

      const publicKeyResponse = await axios.get(`${this.circleBaseUrl}/v1/w3s/config/entity/publicKey`, {
        headers: { Authorization: `Bearer ${this.circleApiKey}`, accept: 'application/json' },
        timeout: 15_000,
      });
      const entitySecretCiphertext = this.encryptCircleEntitySecret(this.circleEntitySecret, publicKeyResponse.data?.data?.publicKey);
      const transferResponse = await axios.post(
        `${this.circleBaseUrl}/v1/w3s/developer/transactions/transfer`,
        {
          idempotencyKey: crypto.randomUUID(),
          entitySecretCiphertext,
          walletAddress: source.address,
          blockchain: source.blockchain,
          tokenAddress: this.referralRewardUsdtTokenAddress,
          destinationAddress: recipientAddress.address,
          amounts: [Number(reward.amount).toFixed(6).replace(/\.?0+$/, '')],
          feeLevel: 'MEDIUM',
        },
        {
          headers: { Authorization: `Bearer ${this.circleApiKey}`, 'Content-Type': 'application/json', accept: 'application/json' },
          timeout: 45_000,
        },
      );
      const circleTransaction = transferResponse.data?.data;
      if (!circleTransaction?.id) throw new Error('Circle did not return a transaction id.');

      const updated = await this.prisma.referralReward.update({
        where: { id: reward.id },
        data: {
          status: 'PENDING',
          platformWalletId: source.id,
          circleTransactionId: circleTransaction.id,
        },
      });
      await this.prisma.auditLog.create({
        data: {
          userId: adminId,
          action: 'REFERRAL_REWARD_PAYOUT_SUBMITTED',
          metadata: { rewardId: reward.id, reference: reward.reference, circleTransactionId: circleTransaction.id, recipientAddress: recipientAddress.address, amount: reward.amount, currency: reward.currency },
        },
      });
      return { reward: updated, circleTransaction: { id: circleTransaction.id, state: circleTransaction.state || 'INITIATED' } };
    } catch (error: any) {
      const message = error.response?.data?.message || error.message || 'Could not submit the referral reward payout.';
      await this.prisma.referralReward.update({ where: { id: reward.id }, data: { status: 'FAILED', failureReason: message } });
      this.logger.error(`Referral reward payout ${reward.id} failed: ${message}`);
      throw error instanceof BadRequestException ? error : new BadRequestException(message);
    }
  }

  async refreshReferralReward(rewardId: string) {
    const reward = await this.prisma.referralReward.findUnique({ where: { id: rewardId }, include: { platformWallet: true, user: { select: { firstName: true, lastName: true } } } });
    if (!reward) throw new NotFoundException('Referral reward not found.');
    if (!reward.circleTransactionId || !reward.platformWallet?.circleWalletId) return reward;
    this.assertCircleConfigured();

    try {
      const response = await axios.get(`${this.circleBaseUrl}/v1/w3s/transactions`, {
        params: { walletId: reward.platformWallet.circleWalletId, pageSize: 50 },
        headers: { Authorization: `Bearer ${this.circleApiKey}`, accept: 'application/json' },
        timeout: 15_000,
      });
      const circleTransaction = (response.data?.data?.transactions || []).find((transaction: any) => transaction.id === reward.circleTransactionId);
      if (!circleTransaction) return reward;
      const state = String(circleTransaction.state || '').toUpperCase();
      if (['COMPLETE', 'COMPLETED', 'CONFIRMED'].includes(state) && reward.status !== 'PAID') {
        const paid = await this.prisma.referralReward.update({ where: { id: reward.id }, data: { status: 'PAID', paidAt: new Date(), failureReason: null } });
        await this.notificationsService.createNotification(reward.userId, {
          title: 'Referral reward sent',
          body: `Your ${reward.amount.toFixed(2)} ${reward.currency} reward for inviting ${reward.requiredReferrals} friends has been sent to your wallet.`,
          type: 'REFERRAL',
          data: { reference: reward.reference, circleTransactionId: reward.circleTransactionId },
        });
        return paid;
      }
      if (['FAILED', 'DENIED'].includes(state)) {
        return this.prisma.referralReward.update({ where: { id: reward.id }, data: { status: 'FAILED', failureReason: circleTransaction.errorMessage || circleTransaction.errorCode || 'Circle payout failed.' } });
      }
      return reward;
    } catch (error: any) {
      this.logger.warn(`Could not refresh referral reward ${reward.id}: ${error.response?.data?.message || error.message}`);
      return reward;
    }
  }

  async listKyc(query: { status?: string; page?: string; limit?: string }) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const status: 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED' =
      query.status && ['UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED'].includes(query.status.toUpperCase())
        ? (query.status.toUpperCase() as 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED')
        : 'PENDING';

    const [total, documents] = await Promise.all([
      this.prisma.kycDocument.count({ where: { status } }),
      this.prisma.kycDocument.findMany({
        where: { status },
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, kycTier: true, surexTag: true } } },
      }),
    ]);

    return { total, page, limit, status, documents };
  }

  async decideKyc(documentId: string, body: { approve: boolean; reason?: string }) {
    const document = await this.prisma.kycDocument.findUnique({ where: { id: documentId } });
    if (!document) return null;

    const newStatus: 'VERIFIED' | 'REJECTED' = body.approve ? 'VERIFIED' : 'REJECTED';
    await this.prisma.kycDocument.update({
      where: { id: documentId },
      data: { status: newStatus, rejectionReason: body.approve ? null : (body.reason || null) },
    });

    // If approved, raise the user to the document's tier and mark them verified
    // (only forward: never downgrade).
    const user = await this.prisma.user.findUnique({ where: { id: document.userId }, select: { kycTier: true } });
    const nextTier = body.approve ? Math.max(user?.kycTier ?? 0, document.tier) : user?.kycTier;
    await this.prisma.user.update({
      where: { id: document.userId },
      data: {
        kycTier: nextTier ?? 0,
        kycStatus: body.approve ? 'VERIFIED' : 'REJECTED',
      },
    });

    return { id: document.id, status: newStatus, userId: document.userId };
  }

  // ── Service pricing (sell prices / margins) ─────────────────────────────

  async getPricing() {
    return this.billsService.getPricingView();
  }

  async setAirtimePricing(provider: string, marginPct: number) {
    return this.billsService.setAirtimeMargin(provider, marginPct);
  }

  async setDataMargin(provider: string, marginPct: number) {
    return this.billsService.setDataNetworkMargin(provider, marginPct);
  }

  async setDataPlanPrice(provider: string, planCode: string, sellPrice: number | null) {
    return this.billsService.setDataPlanPrice(provider, planCode, sellPrice);
  }

  async setDataPlanEnabled(provider: string, planCode: string, enabled: boolean) {
    return this.billsService.setDataPlanEnabled(provider, planCode, enabled);
  }

  // Full transaction record for the admin (any user), with the linked bill
  // payment when it is a BILL_PAYMENT (invoice details for support/debugging).
  async getTransactionDetail(id: string) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, surexTag: true } } },
    });
    if (!transaction) throw new NotFoundException('Transaction not found');

    let bill = null;
    if ((transaction.type || '').toUpperCase() === 'BILL_PAYMENT') {
      bill = await this.prisma.billPayment.findFirst({ where: { reference: transaction.reference } });
    }

    return { ...transaction, invoiceNumber: transaction.reference, bill };
  }

  // ── Broadcast / announcement ────────────────────────────────────────────────────

  async broadcastMessage(body: { title: string; body: string; type?: string; data?: any }, adminId: string) {
    const users = await this.prisma.user.findMany({
      select: { id: true, email: true },
      where: { isActive: true, isBanned: false },
    })
    if (users.length === 0) return { success: true, message: 'No users to notify', userCount: 0 }

    const title = body.title
    const msgBody = body.body
    const type = body.type || 'BROADCAST'
    const data = body.data || {}

    for (const user of users) {
      await this.prisma.notification.create({
        data: {
          userId: user.id,
          title,
          body: msgBody,
          type,
          data,
        },
      })

      this.notificationsService.sendPushNotification(user.id, {
        title,
        body: msgBody,
        data: { ...data, type, source: 'admin' },
      }).catch(() => null)
    }

    await this.notificationsService.markAllRead('admin')
      .catch(() => null)

    return { success: true, message: 'Broadcast sent to all users', userCount: users.length }
  }

  async getBroadcastHistory(query: { page?: string; limit?: string }) {
    const page = Math.max(1, Number(query.page) || 1)
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20))

    const where: Record<string, unknown> = { type: 'BROADCAST' }

    const [total, broadcasts] = await Promise.all([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
      }),
    ])

    return { total, page, limit, broadcasts }
  }

  async getCampaignOverview() {
    const [cryptoAll, billsAll, crypto7d, bills7d] = await Promise.all([
      this.campaignsService.getLeaderboard('crypto', 'all'),
      this.campaignsService.getLeaderboard('bills', 'all'),
      this.campaignsService.getLeaderboard('crypto', '7d'),
      this.campaignsService.getLeaderboard('bills', '7d'),
    ]);

    const totalParticipants = new Set([
      ...cryptoAll.entries.map(e => e.userId),
      ...billsAll.entries.map(e => e.userId),
    ]).size;

    const goldenUsers = new Set([
      ...cryptoAll.goldenUserIds,
      ...billsAll.goldenUserIds,
    ]).size;

    return {
      crypto: {
        allTime: {
          grandTotal: cryptoAll.grandTotal,
          participants: cryptoAll.count,
          top10: cryptoAll.entries.slice(0, 10),
        },
        last7Days: {
          grandTotal: crypto7d.grandTotal,
          participants: crypto7d.count,
          top10: crypto7d.entries.slice(0, 10),
        },
      },
      bills: {
        allTime: {
          grandTotal: billsAll.grandTotal,
          participants: billsAll.count,
          top10: billsAll.entries.slice(0, 10),
        },
        last7Days: {
          grandTotal: bills7d.grandTotal,
          participants: bills7d.count,
          top10: bills7d.entries.slice(0, 10),
        },
      },
      summary: {
        totalUniqueParticipants: totalParticipants,
        goldenUsers,
      },
    };
  }
}
