import { registerAs } from '@nestjs/config';
import { parseReviewedNetworkMatrix, validateEnabledMainnetNetworks } from './network-matrix';

export default registerAs('app', () => {
  const chainEnvironment = (process.env.CHAIN_ENV || 'testnet').toLowerCase();
  const mainnetEnabled = process.env.MAINNET_ENABLED === 'true';
  const reviewedMatrix = chainEnvironment === 'mainnet' || mainnetEnabled
    ? parseReviewedNetworkMatrix(process.env.MAINNET_CHAIN_MATRIX_JSON)
    : {};
  const enabledMainnetNetworks = chainEnvironment === 'mainnet' || mainnetEnabled
    ? validateEnabledMainnetNetworks(reviewedMatrix, process.env.MAINNET_ENABLED_NETWORKS)
    : [];

  const reviewedArc = reviewedMatrix.ARC;
  // Provider selection is explicit. The current launch scope is Circle plus
  // PaymentPoint and Smartspeed; Flutterwave is opt-in through its dedicated
  // flag and is removed from this set unless explicitly enabled.
  const enabledProviders = new Set(
    (process.env.ENABLED_PROVIDERS || 'circle,paymentpoint,smartspeed')
      .split(',')
      .map((provider) => provider.trim().toLowerCase())
      .filter(Boolean),
  );
  enabledProviders.add('circle');
  if (process.env.FLUTTERWAVE_ENABLED === 'true') enabledProviders.add('flutterwave');
  else enabledProviders.delete('flutterwave');

  return {
  port: parseInt(process.env.PORT, 10) || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL,
  testing: {
    // Test PIN behavior is opt-in too; a non-production NODE_ENV must not
    // silently expose a default credential on a public demo.
    enabled: process.env.TESTING_ENABLED === 'true',
    defaultPin: process.env.DEFAULT_PIN || '0000',
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
  },
  providers: {
    enabled: [...enabledProviders],
  },
  webauthn: {
    rpId: process.env.WEBAUTHN_RP_ID || 'localhost',
    rpName: process.env.WEBAUTHN_RP_NAME || 'SureXend',
    origin: process.env.WEBAUTHN_ORIGIN || 'http://localhost:3000',
  },
  flutterwave: {
    // Flutterwave is an optional legacy funding path. It is disabled by
    // default when PaymentPoint is the selected local-funding provider.
    enabled: process.env.FLUTTERWAVE_ENABLED === 'true',
    publicKey: process.env.FLUTTERWAVE_PUBLIC_KEY,
    secretKey: process.env.FLUTTERWAVE_SECRET_KEY,
    webhookHash: process.env.FLUTTERWAVE_WEBHOOK_HASH,
  },
  paymentpoint: {
    apiKey: process.env.PAYMENTPOINT_API_KEY || process.env.PAYMENT_POINT_API_KEY,
    secretKey: process.env.PAYMENTPOINT_SECRET_KEY || process.env.PAYMENT_POINT_SECRET_KEY,
    businessId: process.env.PAYMENTPOINT_BUSINESS_ID || process.env.PAYMENT_POINT_BUSINESS_ID,
    // Do not reuse the API secret as a guessed webhook credential. PaymentPoint's
    // callback signature scheme must be confirmed with the provider and supplied
    // separately before this money-crediting endpoint is enabled.
    webhookSecret: process.env.PAYMENTPOINT_WEBHOOK_SECRET || process.env.PAYMENT_POINT_WEBHOOK_SECRET,
    // Disabled until PaymentPoint's documented callback authentication contract
    // is verified with a captured production webhook. No mode is inferred from
    // API credentials or from a header name.
    webhookEnabled: process.env.PAYMENTPOINT_WEBHOOK_ENABLED === 'true',
    webhookSignatureMode: process.env.PAYMENTPOINT_WEBHOOK_SIGNATURE_MODE || 'disabled',
    webhookSignatureHeader: process.env.PAYMENTPOINT_WEBHOOK_SIGNATURE_HEADER || 'disabled',
    baseUrl: process.env.PAYMENTPOINT_BASE_URL || process.env.PAYMENT_POINT_BASE_URL || 'https://api.paymentpoint.co/api/v1',
  },
  vtpass: {
    apiKey: process.env.VTPASS_API_KEY,
    publicKey: process.env.VTPASS_PUBLIC_KEY,
    secretKey: process.env.VTPASS_SECRET_KEY,
    baseUrl: process.env.VTPASS_BASE_URL,
    webhookSecret: process.env.VTPASS_WEBHOOK_SECRET,
    webhookEnabled: process.env.VTPASS_WEBHOOK_ENABLED === 'true',
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
    // testnet/empty balances can never spend real naira at Smartspeed. This is
    // deliberately not configurable off in production (main.ts rejects it).
    requireFunding: process.env.BILLS_REQUIRE_FUNDING !== 'false',
  },
  moneyMovement: {
    // Every environment is disabled unless the operator explicitly opts in.
    // A demo/testnet process must never reach a live provider just because
    // NODE_ENV is not production.
    enabled: process.env.MONEY_MOVEMENT_ENABLED === 'true',
  },
  compliance: {
    // Production and mainnet require verified KYC before customer movement.
    // Testnet demos can opt in only for controlled rehearsals.
    requireKyc: process.env.REQUIRE_KYC_FOR_MONEY_MOVEMENT === 'true' || process.env.NODE_ENV === 'production' || chainEnvironment === 'mainnet',
    blockedAddresses: process.env.SANCTIONS_BLOCKED_ADDRESSES || '',
  },
  transactionLimits: {
    cryptoUsdDaily: Number(process.env.MAX_DAILY_CRYPTO_SEND_USD || '1000'),
    conversionUsdDaily: Number(process.env.MAX_DAILY_CONVERSION_USD || '1000'),
    billsNgnDaily: Number(process.env.MAX_DAILY_BILL_NGN || '500000'),
  },
  canary: {
    enabled: process.env.CANARY_MODE === 'true',
    userIds: (process.env.CANARY_USER_IDS || '').split(',').map((value) => value.trim()).filter(Boolean),
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
    // Mainnet referral rewards must use an explicitly separate Circle wallet
    // set; the app wallet set is never reused for campaign custody.
    referralRewardWalletSetId: process.env.CIRCLE_REFERRAL_REWARD_WALLET_SET_ID,
    webhookSecret: process.env.CIRCLE_WEBHOOK_SECRET,
    // Referral rewards are paid as USDT from the Circle-created USDC treasury.
    // Configure a Circle-supported chain and its verified USDT contract address;
    // payouts stay disabled until the address is present (fail closed).
    referralRewardBlockchain: process.env.CIRCLE_REFERRAL_REWARD_BLOCKCHAIN,
    referralRewardUsdtTokenAddress: process.env.CIRCLE_REFERRAL_REWARD_USDT_TOKEN_ADDRESS,
  },
  network: {
    environment: chainEnvironment,
    mainnetEnabled,
    matrix: reviewedMatrix,
    enabledMainnetNetworks,
  },
  ledger: {
    // Production money movement requires this switch. ON = read the
    // double-entry ledger (LedgerEntry) as the source of truth; an absent
    // ledger row is zero. The startup baseline gate must pass before this can
    // safely be enabled. Legacy float columns remain compatibility mirrors
    // until a later schema cleanup.
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
    rpcUrl: reviewedArc?.rpcUrls?.[0] || process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.network',
    chainId: reviewedArc?.chainId || parseInt(process.env.ARC_CHAIN_ID || '5042002', 10),
    usdcContractAddress: reviewedArc?.usdcContract || process.env.ARC_USDC_CONTRACT_ADDRESS || '0x3600000000000000000000000000000000000000',
  }
  };
});
