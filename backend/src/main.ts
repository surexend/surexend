import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { FinancialSafetyService } from './common/financial-safety.service';

import helmet from 'helmet';
import * as compression from 'compression';
import { readFileSync } from 'node:fs';
import { ConfigService } from '@nestjs/config';
import { parseReviewedNetworkMatrix, validateEnabledMainnetNetworks } from './config/network-matrix';
import { classifyCircleApiKey, isValidCircleEntitySecret, isValidCircleWalletSetId } from './config/circle-credential';
import { assertProductionAdminGate, bootstrapFirstAdminIfEmpty, provisionConfiguredAdmins } from './common/admin-bootstrap';

/**
 * Evidence IDs are deployment claims, not proof by themselves; the launch gate
 * separately validates the referenced packets. Requiring the same identifiers
 * at boot prevents a manually-enabled database control row from bypassing the
 * release process.
 */
function enabledProviderPreflights(): string[] {
  const providers = new Set(
    (process.env.ENABLED_PROVIDERS || 'circle,paymentpoint,smartspeed')
      .split(',')
      .map((provider) => provider.trim().toLowerCase())
      .filter(Boolean),
  );
  providers.add('circle');
  if (process.env.FLUTTERWAVE_ENABLED === 'true') providers.add('flutterwave');
  else providers.delete('flutterwave');
  return [...providers];
}

function assertProviderPreflightEvidence() {
  const file = String(process.env.PROVIDER_PREFLIGHT_EVIDENCE_FILE || '').trim();
  try {
    const packet = JSON.parse(readFileSync(file, 'utf8'));
    const results = Array.isArray(packet?.results) ? packet.results : [];
    const passed = new Set(results.filter((row: any) => row?.status === 'PASS').map((row: any) => row.provider));
    const missing = enabledProviderPreflights().filter((provider) => !passed.has(provider));
    if (missing.length) throw new Error(`missing PASS result(s): ${missing.join(', ')}`);
  } catch (error: any) {
    throw new Error(`Refusing to start: provider preflight evidence is unreadable or incomplete (${error?.message || error}).`);
  }
}

function assertRealMoneyEvidence(context: string) {
  const requiredEvidence = [
    ['FINANCIAL_RELEASE_APPROVED', process.env.FINANCIAL_RELEASE_APPROVED],
    ['FINANCIAL_RELEASE_APPROVED_BY', process.env.FINANCIAL_RELEASE_APPROVED_BY],
    ['FINANCIAL_RELEASE_TICKET', process.env.FINANCIAL_RELEASE_TICKET],
    ['FINANCIAL_RELEASE_EVIDENCE_ID', process.env.FINANCIAL_RELEASE_EVIDENCE_ID],
    ['KYC_AML_EVIDENCE_ID', process.env.KYC_AML_EVIDENCE_ID],
    ['SANCTIONS_PROVIDER_EVIDENCE_ID', process.env.SANCTIONS_PROVIDER_EVIDENCE_ID],
    ['CUSTODY_DUAL_CONTROL_EVIDENCE_ID', process.env.CUSTODY_DUAL_CONTROL_EVIDENCE_ID],
    ['INDEPENDENT_SECURITY_REVIEW_EVIDENCE_ID', process.env.INDEPENDENT_SECURITY_REVIEW_EVIDENCE_ID],
    ['POSTGRES_REHEARSAL_EVIDENCE_ID', process.env.POSTGRES_REHEARSAL_EVIDENCE_ID],
    ['DISASTER_RECOVERY_EVIDENCE_ID', process.env.DISASTER_RECOVERY_EVIDENCE_ID],
    ['CIRCLE_CCTP_CONTRACT_EVIDENCE_ID', process.env.CIRCLE_CCTP_CONTRACT_EVIDENCE_ID],
    ['TESTNET_E2E_EVIDENCE_ID', process.env.TESTNET_E2E_EVIDENCE_ID],
    ['ALERT_RESTART_EVIDENCE_ID', process.env.ALERT_RESTART_EVIDENCE_ID],
    ['PROVIDER_PREFLIGHT_EVIDENCE_FILE', process.env.PROVIDER_PREFLIGHT_EVIDENCE_FILE],
  ];
  if (enabledProviderPreflights().includes('smartspeed')) {
    requiredEvidence.push(['SMARTSPEED_CONTRACT_EVIDENCE_ID', process.env.SMARTSPEED_CONTRACT_EVIDENCE_ID]);
  }
  if (process.env.PAYMENTPOINT_WEBHOOK_ENABLED === 'true') {
    requiredEvidence.push(['PAYMENTPOINT_WEBHOOK_CONTRACT_EVIDENCE_ID', process.env.PAYMENTPOINT_WEBHOOK_CONTRACT_EVIDENCE_ID]);
  }
  const missingEvidence = requiredEvidence.filter(([, value]) => !String(value || '').trim()).map(([name]) => name);
  if (missingEvidence.length) {
    throw new Error(`Refusing to start: ${context} money movement is missing release evidence: ${missingEvidence.join(', ')}.`);
  }
  assertProviderPreflightEvidence();
}

/**
 * Refuse to boot without the secrets that protect customer accounts. A missing
 * JWT secret used to fall back to a value committed in this repo, which would
 * have let anyone forge an access token for any user.
 */
function assertRequiredEnv() {
  const required = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'DATABASE_URL'];
  const missing = required.filter((key) => !process.env[key] || !String(process.env[key]).trim());
  if (missing.length) {
    throw new Error(
      `Refusing to start: missing required environment variable(s): ${missing.join(', ')}. ` +
        'Copy backend/.env.example and set real values.',
    );
  }
  if (process.env.NODE_ENV === 'production') {
    const frontendUrl = String(process.env.FRONTEND_URL || '').trim();
    const redisUrl = String(process.env.REDIS_URL || '').trim();
    if (!frontendUrl.startsWith('https://')) {
      throw new Error('Refusing to start: production FRONTEND_URL must use https://.');
    }
    if (!redisUrl || /localhost|127\.0\.0\.1|redis:\/\/redis(?::|\/|$)/i.test(redisUrl)) {
      throw new Error('Refusing to start: production REDIS_URL must point to a managed, non-local Redis service.');
    }
    if (!process.env.WEBAUTHN_RP_ID || !process.env.WEBAUTHN_ORIGIN?.startsWith('https://')) {
      throw new Error('Refusing to start: production WebAuthn RP_ID and HTTPS WEBAUTHN_ORIGIN are required.');
    }
    try {
      const originHost = new URL(process.env.WEBAUTHN_ORIGIN).hostname.toLowerCase();
      const rpId = process.env.WEBAUTHN_RP_ID.toLowerCase();
      if (originHost !== rpId && !originHost.endsWith(`.${rpId}`)) {
        throw new Error('WebAuthn RP_ID is not a valid registrable parent of WEBAUTHN_ORIGIN.');
      }
    } catch (error: any) {
      throw new Error(`Refusing to start: invalid production WebAuthn configuration (${error?.message || error}).`);
    }
    if (process.env.TESTING_ENABLED === 'true') {
      throw new Error('Refusing to start: TESTING_ENABLED must not be true in production.');
    }
    if (process.env.WEBHOOK_REQUIRE_SIGNATURE === 'false') {
      throw new Error('Refusing to start: WEBHOOK_REQUIRE_SIGNATURE=false is never allowed in production.');
    }
    const paymentPointSignatureModes = new Set(['static-secret-legacy', 'hmac-sha256-raw-base64', 'hmac-sha256-raw-hex']);
    const paymentPointSignatureHeaders = new Set(['paymentpoint-signature', 'x-paymentpoint-signature', 'verif-hash']);
    if (process.env.PAYMENTPOINT_WEBHOOK_ENABLED === 'true') {
      if (!paymentPointSignatureModes.has(String(process.env.PAYMENTPOINT_WEBHOOK_SIGNATURE_MODE || ''))
        || !paymentPointSignatureHeaders.has(String(process.env.PAYMENTPOINT_WEBHOOK_SIGNATURE_HEADER || ''))
        || !process.env.PAYMENTPOINT_WEBHOOK_SECRET) {
        throw new Error('Refusing to start: enabled PaymentPoint webhooks require an evidenced signature mode, header, and separate webhook secret.');
      }
    }
    if (process.env.BILLS_REQUIRE_FUNDING === 'false') {
      throw new Error('Refusing to start: BILLS_REQUIRE_FUNDING=false is never allowed in production.');
    }
    if (process.env.REQUIRE_KYC_FOR_MONEY_MOVEMENT === 'false') {
      throw new Error('Refusing to start: REQUIRE_KYC_FOR_MONEY_MOVEMENT=false is never allowed in production.');
    }
    const limits = [process.env.MAX_DAILY_CRYPTO_SEND_USD || '1000', process.env.MAX_DAILY_CONVERSION_USD || '1000', process.env.MAX_DAILY_BILL_NGN || '500000'].map(Number);
    if (limits.some((limit) => !Number.isFinite(limit) || limit <= 0)) {
      throw new Error('Refusing to start: daily financial limits must be finite positive numbers.');
    }
    if (process.env.MONEY_MOVEMENT_ENABLED === 'true' && process.env.LEDGER_READS_ENABLED !== 'true') {
      throw new Error('Refusing to start: production money movement requires LEDGER_READS_ENABLED=true after the ledger baseline has been reconciled.');
    }
    if (
      process.env.MONEY_MOVEMENT_ENABLED === 'true' &&
      process.env.LEDGER_DRIFT_ALERTS_ENABLED !== 'false' &&
      !process.env.LEDGER_DRIFT_WEBHOOK_URL &&
      !(process.env.LEDGER_DRIFT_ALERT_EMAIL && process.env.RESEND_API_KEY)
    ) {
      throw new Error('Refusing to start: production money movement requires a durable ledger-drift alert destination.');
    }
    if (process.env.MONEY_MOVEMENT_ENABLED === 'true') {
      assertRealMoneyEvidence('production');
    }
  }
}

/**
 * Refuse to boot on a network configuration we have never validated. The chain
 * mappings are split across two places in the code: `NETWORK_TO_CHAIN` in
 * cctp.service.ts (BridgeKit chains) and `getBlockchainName()` in
 * wallets.service.ts (Circle blockchain strings, chosen by the CIRCLE_API_KEY
 * prefix). A mainnet Circle key silently flips the SECOND mapping only —
 * testnet BridgeChains + mainnet Circle blockchain names — which is exactly
 * the mixed configuration that would let testnet assets masquerade as
 * mainnet. Fail closed instead.
 */
function assertNetworkConfig() {
  const circleKey = process.env.CIRCLE_API_KEY || '';
  // https://developers.circle.com/api-reference/keys — keys are PREFIX:ID:SECRET,
  // TEST_API_KEY for testnet and LIVE_API_KEY for mainnet, one key per environment.
  const circleKeyEnv = classifyCircleApiKey(circleKey);
  const circleIsMainnet = circleKeyEnv === 'mainnet';
  const chainEnv = (process.env.CHAIN_ENV || 'testnet').toLowerCase();
  const mainnetEnabled = process.env.MAINNET_ENABLED === 'true';

  if (chainEnv !== 'testnet' && chainEnv !== 'mainnet') {
    throw new Error(`Refusing to start: CHAIN_ENV must be 'testnet' or 'mainnet', got '${chainEnv}'.`);
  }

  if (mainnetEnabled || chainEnv === 'mainnet') {
    if (process.env.NODE_ENV !== 'production') {
      throw new Error('Refusing to start: mainnet requires NODE_ENV=production; use CHAIN_ENV=testnet for development and rehearsals.');
    }
    if (chainEnv !== 'mainnet' || !mainnetEnabled) {
      throw new Error('Refusing to start: mainnet requires both CHAIN_ENV=mainnet and MAINNET_ENABLED=true.');
    }
    if (!circleIsMainnet) {
      throw new Error(
        `Refusing to start: mainnet requires a Circle LIVE_API_KEY:<id>:<secret> credential (got ${circleKeyEnv}). ` +
          'See https://developers.circle.com/api-reference/keys.',
      );
    }
    if (!isValidCircleEntitySecret(process.env.CIRCLE_ENTITY_SECRET)) {
      throw new Error('Refusing to start: CIRCLE_ENTITY_SECRET must be the 32-byte hex entity secret (64 hex characters) registered in the Circle Console.');
    }
    if (process.env.CIRCLE_WALLET_SET_ID && !isValidCircleWalletSetId(process.env.CIRCLE_WALLET_SET_ID)) {
      throw new Error('Refusing to start: CIRCLE_WALLET_SET_ID must be the wallet-set UUID returned by Circle.');
    }
    if (process.env.CIRCLE_REFERRAL_REWARD_WALLET_SET_ID && process.env.CIRCLE_REFERRAL_REWARD_WALLET_SET_ID === process.env.CIRCLE_WALLET_SET_ID) {
      throw new Error('Refusing to start: the referral reward wallet set must be different from the application wallet set on mainnet.');
    }
    if (process.env.MAINNET_DB_ISOLATION_CONFIRMED !== 'true') {
      throw new Error(
        'Refusing to start: MAINNET_DB_ISOLATION_CONFIRMED=true is required. Production must use its own clean database — ' +
          'never the Staging/testnet or rehearsal database — because Wallet/LedgerEntry/WalletAddress rows are not environment-scoped ' +
          'and testnet balances would be read as mainnet balances. See docs/mainnet-config.md.',
      );
    }
    if (process.env.MAINNET_CONFIG_APPROVED !== 'true') {
      throw new Error('Refusing to start: MAINNET_CONFIG_APPROVED=true is required only after the reviewed chain/provider matrix is signed off.');
    }
    // Mainnet data is deployment evidence, not a guessed fallback. Validate the
    // exact set of chain identifiers, RPCs, Circle names, token addresses and
    // explorers that this deployment is allowed to touch before booting.
    const matrix = parseReviewedNetworkMatrix(process.env.MAINNET_CHAIN_MATRIX_JSON);
    validateEnabledMainnetNetworks(matrix, process.env.MAINNET_ENABLED_NETWORKS);
    if (!process.env.CIRCLE_API_KEY || !process.env.CIRCLE_ENTITY_SECRET) {
      throw new Error('Refusing to start: mainnet Circle API credentials are required.');
    }
    if (process.env.MONEY_MOVEMENT_ENABLED === 'true' && !process.env.CIRCLE_WALLET_SET_ID) {
      throw new Error('Refusing to start: mainnet requires a pre-created, custody-reviewed CIRCLE_WALLET_SET_ID.');
    }
    if (process.env.MONEY_MOVEMENT_ENABLED === 'true' && process.env.FINANCIAL_RELEASE_APPROVED !== 'true') {
      throw new Error('Refusing to start: real-money movement requires a separately recorded financial release approval.');
    }
    if (process.env.MONEY_MOVEMENT_ENABLED === 'true') {
      assertRealMoneyEvidence('mainnet');
    }
    if (process.env.MONEY_MOVEMENT_ENABLED === 'true') {
      const canaryUsers = (process.env.CANARY_USER_IDS || '').split(',').map((value) => value.trim()).filter(Boolean);
      if (process.env.CANARY_MODE === 'true' && !canaryUsers.length) {
        throw new Error('Refusing to start: CANARY_MODE=true requires a non-empty CANARY_USER_IDS allowlist.');
      }
      if (process.env.CANARY_MODE !== 'true' && !process.env.STAGED_CANARY_EVIDENCE_ID) {
        throw new Error('Refusing to start unrestricted mainnet movement without STAGED_CANARY_EVIDENCE_ID.');
      }
    }
  } else if (circleIsMainnet) {
    throw new Error(
      'Refusing to start: CIRCLE_API_KEY is a LIVE_API_KEY but MAINNET_ENABLED is not true. ' +
        'This mixed config was never validated (testnet BridgeChains + mainnet Circle blockchain names). ' +
        'Either use a TEST_API_KEY or enable mainnet with the full reviewed config — see docs/mainnet-config.md.',
    );
  } else if (circleKeyEnv === 'invalid') {
    throw new Error(
      'Refusing to start: CIRCLE_API_KEY is not a valid Circle key. Expected TEST_API_KEY:<id>:<secret> (testnet) ' +
        'or LIVE_API_KEY:<id>:<secret> (mainnet) — see https://developers.circle.com/api-reference/keys.',
    );
  } else {
    const rpcUrl = process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.network';
    const chainId = Number(process.env.ARC_CHAIN_ID || 5042002);
    if (!/testnet/i.test(rpcUrl) || chainId !== 5042002) {
      throw new Error('Refusing to start: testnet mode requires the reviewed Arc testnet RPC and chain ID 5042002.');
    }
  }
}

async function bootstrap() {
  assertRequiredEnv();
  assertNetworkConfig();

  // rawBody keeps the exact bytes a provider signed so webhook signatures can
  // be verified; re-serialising parsed JSON invalidates them.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  const configService = app.get(ConfigService);

  // Admins must be provisioned explicitly by an operator or a controlled
  // migration. Never create demo accounts, reactivate banned users, or fall
  // back to a password embedded in application code at server startup.
  const prisma = app.get(PrismaService);
  // The control-plane migration is mandatory even for a read-only process. A
  // missing/partial control table must fail startup rather than be discovered
  // only after a customer request reaches a financial path.
  const financialSafety = app.get(FinancialSafetyService);
  await financialSafety.assertStorageReady();
  await financialSafety.assertDeploymentEnvironment({
    chainEnvironment: (process.env.CHAIN_ENV || 'testnet').toLowerCase() as 'testnet' | 'mainnet',
    circleKeyPrefix: String(process.env.CIRCLE_API_KEY || '').split(':')[0] || 'UNSET',
  });
  await financialSafety.assertLedgerBaselineReady();
  await financialSafety.getControl();
  // Admins must be provisioned explicitly by an operator or a controlled
  // one-time procedure. Never create demo accounts, reactivate banned users,
  // or fall back to a password embedded in application code at server startup.
  // The single controlled exception lives in admin-bootstrap.ts: an EMPTY
  // database (fresh cutover) cannot register an operator because the gate
  // below refuses to serve, so ADMIN_EMAIL + ADMIN_PASSWORD plus the explicit
  // ADMIN_BOOTSTRAP_INITIAL=true confirmation may create the FIRST admin — and
  // only while the User table has zero rows.
  const envAdminEmails = [process.env.ADMIN_EMAIL, ...(process.env.ADMIN_EMAILS || '').split(',')]
    .map((s) => (s || '').trim().toLowerCase())
    .filter(Boolean);
  const adminPassword = process.env.ADMIN_PASSWORD?.trim();
  if (envAdminEmails.length && !adminPassword) {
    throw new Error('Refusing to start: ADMIN_EMAIL/ADMIN_EMAILS were supplied without ADMIN_PASSWORD. Provision admins through a controlled one-time procedure.');
  }
  // Bootstrap before promoting: on an empty database the promotion loop would
  // otherwise throw "does not exist" for the very account bootstrap must create.
  await bootstrapFirstAdminIfEmpty(prisma, {
    enabled: process.env.ADMIN_BOOTSTRAP_INITIAL === 'true',
    emails: envAdminEmails,
    password: adminPassword,
  });
  if (envAdminEmails.length && adminPassword) {
    const { promoted, blocked } = await provisionConfiguredAdmins(prisma, {
      emails: envAdminEmails,
      password: adminPassword,
      resetPassword: process.env.ADMIN_RESET_PASSWORD === 'true',
    });
    for (const entry of promoted) {
      console.log(`[admin-bootstrap] Configured admin promoted/confirmed: ${entry}`);
    }
    for (const entry of blocked) {
      console.warn(
        `[admin-bootstrap] WARNING: configured admin ${entry.email} is ` +
          `${entry.isActive ? '' : 'INACTIVE '}${entry.isBanned ? 'BANNED' : ''}`.trim() +
          ' — it will NOT satisfy the production admin gate. The app never reactivates accounts; restore it deliberately in the database or provision another admin.',
      );
    }
  }
  if (process.env.NODE_ENV === 'production') {
    await assertProductionAdminGate(prisma);
  }

  app.use(helmet());
  app.disable('x-powered-by');
  app.use(compression());

  // We sit behind the Next.js rewrite proxy (Vercel) and Railway's edge, so the
  // socket address is not the client. Trust X-Forwarded-For for rate limiting
  // and audit logs.
  app.set('trust proxy', true);

  const configuredFrontend = configService.get<string>('app.frontendUrl') || '';
  const allowedOrigins = new Set([
    'https://surexend.com',
    configuredFrontend,
  ].filter(Boolean));
  if (process.env.NODE_ENV !== 'production') {
    ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002', 'http://localhost:3003']
      .forEach((origin) => allowedOrigins.add(origin));
  }

  app.enableCors({
    origin: (origin, callback) => {
      // Requests without an Origin header include provider webhooks and
      // server-to-server calls; CORS does not apply to them.
      if (!origin || allowedOrigins.has(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
  });

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const port = configService.get<number>('app.port') || 3001;
  await app.listen(port);
  console.log(`SureXend backend running on port ${port}`);
}
bootstrap();
