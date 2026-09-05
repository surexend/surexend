import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  port: parseInt(process.env.PORT, 10) || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL,
  testing: {
    enabled: process.env.TESTING_ENABLED === 'true' || (process.env.NODE_ENV || 'development') !== 'production',
    defaultPin: process.env.DEFAULT_PIN || '0000',
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
  },
  webauthn: {
    rpId: process.env.WEBAUTHN_RP_ID || 'localhost',
    rpName: process.env.WEBAUTHN_RP_NAME || 'SureXend',
    origin: process.env.WEBAUTHN_ORIGIN || 'http://localhost:3000',
  },
  flutterwave: {
    publicKey: process.env.FLUTTERWAVE_PUBLIC_KEY,
    secretKey: process.env.FLUTTERWAVE_SECRET_KEY,
    webhookHash: process.env.FLUTTERWAVE_WEBHOOK_HASH,
  },
  paymentpoint: {
    secretKey: process.env.PAYMENTPOINT_SECRET_KEY,
    apiKey: process.env.PAYMENTPOINT_API_KEY,
    webhookSecret: process.env.PAYMENTPOINT_WEBHOOK_SECRET,
  },
  vtpass: {
    apiKey: process.env.VTPASS_API_KEY,
    publicKey: process.env.VTPASS_PUBLIC_KEY,
    secretKey: process.env.VTPASS_SECRET_KEY,
    baseUrl: process.env.VTPASS_BASE_URL,
    webhookSecret: process.env.VTPASS_WEBHOOK_SECRET,
  },
  webhooks: {
    // Fail closed. Every inbound webhook is cryptographically verified before
    // it is allowed to move money. Set to 'false' ONLY to replay a captured
    // payload against a local dev database.
    requireSignature: process.env.WEBHOOK_REQUIRE_SIGNATURE !== 'false',
  },
  smartspeed: {
    apiKey: process.env.SMARTSPEED_API_TOKEN,
    baseUrl: process.env.SMARTSPEED_BASE_URL || 'https://www.smartspeedtelecom.com/api',
  },
  bills: {
    // Safety guard: users can only buy bills once they have a real deposit, so
    // testnet/empty balances can never spend real naira at Smartspeed. Disable
    // with BILLS_REQUIRE_FUNDING=false.
    requireFunding: process.env.BILLS_REQUIRE_FUNDING !== 'false',
  },
  yellowCard: {
    apiKey: process.env.YELLOW_CARD_API_KEY,
    secret: process.env.YELLOW_CARD_SECRET,
  },
  tatum: {
    apiKey: process.env.TATUM_API_KEY,
    webhookSecret: process.env.TATUM_WEBHOOK_HMAC_SECRET,
  },
  smileIdentity: {
    partnerId: process.env.SMILE_PARTNER_ID,
    apiKey: process.env.SMILE_API_KEY,
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
  },
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  },
  resend: {
    apiKey: process.env.RESEND_API_KEY,
    fromEmail: process.env.RESEND_FROM_EMAIL,
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  },
  circle: {
    apiKey: process.env.CIRCLE_API_KEY,
    entitySecret: process.env.CIRCLE_ENTITY_SECRET,
    walletSetId: process.env.CIRCLE_WALLET_SET_ID,
    webhookSecret: process.env.CIRCLE_WEBHOOK_SECRET,
    // Referral rewards are paid as USDT from the Circle-created USDC treasury.
    // Configure a Circle-supported chain and its verified USDT contract address;
    // payouts stay disabled until the address is present (fail closed).
    referralRewardBlockchain: process.env.CIRCLE_REFERRAL_REWARD_BLOCKCHAIN,
    referralRewardUsdtTokenAddress: process.env.CIRCLE_REFERRAL_REWARD_USDT_TOKEN_ADDRESS,
  },
  network: {
    environment: process.env.CHAIN_ENV || 'testnet',
    mainnetEnabled: process.env.MAINNET_ENABLED === 'true',
  },
  ledger: {
    // Gradual cutover switch for balance READS. OFF = legacy float columns
    // (current behavior, additive & testnet-safe). ON = read the double-entry
    // ledger (LedgerEntry) as the source of truth, falling back to the float
    // for a currency that has no ledger rows yet, so enabling this is safe
    // even before scripts/backfill-ledger-baseline.js has been run. Writes
    // keep updating floats in BOTH modes until each path is verified and the
    // columns are removed.
    reads: process.env.LEDGER_READS_ENABLED === 'true',
    alerts: {
      // LEDGER_DRIFT rows are persisted to AuditLog by the hourly
      // reconciliation (deduped per account/currency). This watcher alerts on
      // NEW rows only. OFF unless an alert destination is configured — a
      // plain error log is always emitted even when no channel is set up, so
      // drift is never silent on a box that ships logs.
      enabled: process.env.LEDGER_DRIFT_ALERTS_ENABLED !== 'false',
      webhookUrl: process.env.LEDGER_DRIFT_WEBHOOK_URL,
      email: process.env.LEDGER_DRIFT_ALERT_EMAIL,
    },
  },
  arc: {
    rpcUrl: process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.network',
    chainId: parseInt(process.env.ARC_CHAIN_ID || '5042002', 10),
    usdcContractAddress: process.env.ARC_USDC_CONTRACT_ADDRESS || '0x3600000000000000000000000000000000000000'
  }
}));
