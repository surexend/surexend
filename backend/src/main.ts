import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

import helmet from 'helmet';
import * as compression from 'compression';
import * as bcrypt from 'bcryptjs';
import { ConfigService } from '@nestjs/config';

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
    if (process.env.BILLS_REQUIRE_FUNDING === 'false') {
      throw new Error('Refusing to start: BILLS_REQUIRE_FUNDING=false is never allowed in production.');
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
  const circleIsMainnet = circleKey.startsWith('TEST_') === false && circleKey !== '';
  const chainEnv = (process.env.CHAIN_ENV || 'testnet').toLowerCase();
  const mainnetEnabled = process.env.MAINNET_ENABLED === 'true';

  if (chainEnv !== 'testnet' && chainEnv !== 'mainnet') {
    throw new Error(`Refusing to start: CHAIN_ENV must be 'testnet' or 'mainnet', got '${chainEnv}'.`);
  }

  if (mainnetEnabled || chainEnv === 'mainnet') {
    // The current implementation still hard-codes ARC-TESTNET in wallet
    // creation, native transfers, and provider reconciliation. Do not let a
    // live Circle key or a plausible RPC silently turn those paths into a
    // mixed testnet/mainnet deployment. Mainnet requires a separately reviewed
    // chain mapping and release, so it is an explicit startup failure here.
    throw new Error('Refusing to start: mainnet financial movement is not implemented and has not been approved for this release. Keep CHAIN_ENV=testnet and MAINNET_ENABLED=false.');
  } else if (circleIsMainnet) {
    throw new Error(
      'Refusing to start: CIRCLE_API_KEY does not have the TEST_ prefix but MAINNET_ENABLED is not true. ' +
        'This mixed config was never validated (testnet BridgeChains + mainnet Circle blockchain names). ' +
        'Either use a TEST_ key or enable mainnet with the full reviewed config — see docs/mainnet-config.md.',
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
  const envAdminEmails = [process.env.ADMIN_EMAIL, ...(process.env.ADMIN_EMAILS || '').split(',')]
    .map((s) => (s || '').trim().toLowerCase())
    .filter(Boolean);
  const adminPassword = process.env.ADMIN_PASSWORD?.trim();
  if (envAdminEmails.length && !adminPassword) {
    throw new Error('Refusing to start: ADMIN_EMAIL/ADMIN_EMAILS were supplied without ADMIN_PASSWORD. Provision admins through a controlled one-time procedure.');
  }
  if (envAdminEmails.length && adminPassword) {
    const adminHash = await bcrypt.hash(adminPassword, 12);
    for (const email of Array.from(new Set(envAdminEmails))) {
      const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (!existing) {
        throw new Error(`Refusing to start: configured admin ${email} does not exist. Create it through the controlled admin provisioning procedure; the app will not bootstrap accounts.`);
      }
      if (process.env.ADMIN_RESET_PASSWORD === 'true') {
        await prisma.user.update({ where: { id: existing.id }, data: { role: 'ADMIN', passwordHash: adminHash } });
      } else {
        await prisma.user.update({ where: { id: existing.id }, data: { role: 'ADMIN' } });
      }
    }
  }
  if (process.env.NODE_ENV === 'production') {
    const adminCount = await prisma.user.count({ where: { role: 'ADMIN', isActive: true, isBanned: false } });
    if (adminCount < 1) {
      throw new Error('Refusing to start: no active, unbanned administrator is provisioned.');
    }
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
