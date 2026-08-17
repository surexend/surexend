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
  flutterwave: {
    publicKey: process.env.FLUTTERWAVE_PUBLIC_KEY,
    secretKey: process.env.FLUTTERWAVE_SECRET_KEY,
    webhookHash: process.env.FLUTTERWAVE_WEBHOOK_HASH,
  },
  vtpass: {
    apiKey: process.env.VTPASS_API_KEY,
    publicKey: process.env.VTPASS_PUBLIC_KEY,
    secretKey: process.env.VTPASS_SECRET_KEY,
    baseUrl: process.env.VTPASS_BASE_URL,
  },
  smartspeed: {
    apiKey: process.env.SMARTSPEED_API_TOKEN,
    baseUrl: process.env.SMARTSPEED_BASE_URL || 'https://www.smartspeedtelecom.com/api',
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
  },
  arc: {
    rpcUrl: process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.network',
    chainId: parseInt(process.env.ARC_CHAIN_ID || '5042002', 10),
    usdcContractAddress: process.env.ARC_USDC_CONTRACT_ADDRESS || '0x3600000000000000000000000000000000000000'
  }
}));
