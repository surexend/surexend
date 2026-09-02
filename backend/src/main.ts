import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as dns from 'dns';
import { PrismaService } from './prisma/prisma.service';

// Set DNS servers to prevent local network resolution timeouts
// Trigger deployment with auto-deploy active
dns.setServers(['8.8.8.8', '1.1.1.1']);
import helmet from 'helmet';
import * as compression from 'compression';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
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
  if (process.env.NODE_ENV === 'production' && process.env.TESTING_ENABLED === 'true') {
    throw new Error('Refusing to start: TESTING_ENABLED must not be true in production (it accepts a default PIN).');
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
    if (!circleKey) {
      throw new Error('Refusing to start: mainnet is enabled but CIRCLE_API_KEY is missing; a test key with mainnet enabled would mix testnet into the live mapping.');
    }
    if (!circleIsMainnet) {
      throw new Error('Refusing to start: mainnet is enabled but CIRCLE_API_KEY has the TEST_ prefix. Mainnet is NOT yet reviewed/approved for this deployment.');
    }
    const rpc = process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.network';
    if (rpc.includes('testnet')) {
      throw new Error('Refusing to start: mainnet is enabled but ARC_RPC_URL still points at testnet. Set the reviewed mainnet RPC.');
    }
    if (!process.env.ARC_USDC_CONTRACT_ADDRESS) {
      throw new Error('Refusing to start: mainnet is enabled but ARC_USDC_CONTRACT_ADDRESS is not set. The default is the Arc TESTNET precompile address and must never be used for mainnet.');
    }
  } else if (circleIsMainnet) {
    throw new Error(
      'Refusing to start: CIRCLE_API_KEY does not have the TEST_ prefix but MAINNET_ENABLED is not true. ' +
        'This mixed config was never validated (testnet BridgeChains + mainnet Circle blockchain names). ' +
        'Either use a TEST_ key or enable mainnet with the full reviewed config — see docs/mainnet-config.md.',
    );
  }
}

async function bootstrap() {
  assertRequiredEnv();
  assertNetworkConfig();

  // rawBody keeps the exact bytes a provider signed so webhook signatures can
  // be verified; re-serialising parsed JSON invalidates them.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  const configService = app.get(ConfigService);

  // Admin bootstrap — guarantee essential admin accounts (demo@surexend.com,
  // surexendofficial@gmail.com, and any ADMIN_EMAILS/ADMIN_EMAIL) exist, are active,
  // and have role: 'ADMIN'. If the account is missing or inactive, auto-provision
  // or reactivate it so admins never get locked out.
  const prisma = app.get(PrismaService);
  const defaultAdminEmails = ['demo@surexend.com', 'surexendofficial@gmail.com'];
  const envAdminEmails = [process.env.ADMIN_EMAIL, ...(process.env.ADMIN_EMAILS || '').split(',')]
    .map((s) => (s || '').trim().toLowerCase())
    .filter(Boolean);
  const targetAdminEmails = Array.from(new Set([...defaultAdminEmails, ...envAdminEmails]));

  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin123!';
  const defaultHash = await bcrypt.hash(adminPassword, 10);

  for (const email of targetAdminEmails) {
    try {
      const existing = await prisma.user.findUnique({
        where: { email },
        select: { id: true, role: true, isActive: true, isBanned: true }
      });
      if (existing) {
        await prisma.user.update({
          where: { id: existing.id },
          data: {
            role: 'ADMIN',
            isActive: true,
            isBanned: false,
            // If ADMIN_PASSWORD or ADMIN_RESET_PASSWORD is set, update passwordHash
            ...(process.env.ADMIN_PASSWORD || process.env.ADMIN_RESET_PASSWORD === 'true'
              ? { passwordHash: defaultHash }
              : {}),
          },
        });
        console.log(`[admin] Verified and activated admin account for ${email} (role: ADMIN)`);
      } else {
        const surexTag = email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'admin';
        const tagExists = await prisma.user.findUnique({ where: { surexTag } });
        const finalTag = tagExists ? `${surexTag}.${Math.floor(100 + Math.random() * 900)}` : surexTag;

        const created = await prisma.user.create({
          data: {
            email,
            phone: `+12345678${Math.floor(1000 + Math.random() * 9000)}`,
            firstName: 'Admin',
            lastName: 'User',
            surexTag: finalTag,
            role: 'ADMIN',
            isActive: true,
            isBanned: false,
            kycStatus: 'VERIFIED',
            kycTier: 3,
            passwordHash: defaultHash,
            referralCode: crypto.randomBytes(4).toString('hex').toUpperCase(),
            wallet: {
              create: {}
            }
          }
        });
        console.log(`[admin] Auto-provisioned missing ADMIN account: ${email} (ID: ${created.id})`);
      }
    } catch (error) {
      console.warn(`[admin] Admin bootstrap notice for ${email}: ${(error as Error).message}`);
    }
  }

  app.use(helmet());
  app.use(compression());

  // We sit behind the Next.js rewrite proxy (Vercel) and Railway's edge, so the
  // socket address is not the client. Trust X-Forwarded-For for rate limiting
  // and audit logs.
  app.set('trust proxy', true);

  const allowedOrigins = [
    'https://surexend.com',
    'https://surexend.vercel.app',
    'https://surexend.netlify.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
    'http://localhost:3003',
  ];

  app.enableCors({
    origin: (origin, callback) => {
      const isAllowed =
        !origin ||
        allowedOrigins.includes(origin) ||
        origin.endsWith('.vercel.app') ||
        origin.endsWith('.netlify.app') ||
        origin.endsWith('.monkeycode-ai.live') ||
        origin.endsWith('.e2b.app') ||
        origin.startsWith('http://localhost:');
      if (isAllowed) {
        callback(null, true);
      } else {
        callback(null, false);
      }
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
