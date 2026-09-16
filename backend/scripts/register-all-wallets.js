/**
 * One-off backfill: ensure every walletAddress record has a REAL Circle W3S
 * wallet registered on its mapped blockchain (including ARC-TESTNET).
 *
 * Historical ARC addresses were created before ARC was a first-class Circle
 * chain, so they exist only as DB records pointing at a reused EVM address and
 * Circle has no wallet object for them → Circle never tracked the deposits.
 * Creating the wallet on the correct blockchain (unified EVM addressing returns
 * the same EVM address) makes Circle index and report those existing balances
 * and transactions.
 *
 * Run from the backend dir with the deployed env (e.g. `railway run node
 * scripts/register-all-wallets.js` or `node scripts/register-all-wallets.js`
 * with DATABASE_URL/CIRCLE_* set).
 */
const crypto = require('crypto');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { createPrismaClient } = require('./prisma-client');

const prisma = createPrismaClient();
const BASE_URL = 'https://api.circle.com';

function loadEnv() {
  const envPath = path.join(__dirname, '../.env');
  const env = {};
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] = m[2].trim();
    }
  }
  env.DATABASE_URL = process.env.DATABASE_URL || env.DATABASE_URL;
  env.CIRCLE_API_KEY = process.env.CIRCLE_API_KEY || env.CIRCLE_API_KEY || env.API_KEY;
  env.CIRCLE_ENTITY_SECRET = process.env.CIRCLE_ENTITY_SECRET || env.CIRCLE_ENTITY_SECRET || env.ENTITY_SECRET;
  env.CIRCLE_WALLET_SET_ID = process.env.CIRCLE_WALLET_SET_ID || env.CIRCLE_WALLET_SET_ID || env.WALLET_SET_ID;
  return env;
}

function encryptEntitySecret(publicKeyPem, secretHex) {
  const encrypted = crypto.publicEncrypt(
    {
      key: publicKeyPem,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    Buffer.from(secretHex, 'hex')
  );
  return encrypted.toString('base64');
}

function blockchainFor(network) {
  const keyIsTest = (process.env.CIRCLE_API_KEY || '').startsWith('TEST_');
  const net = String(network || '').toUpperCase();
  const map = keyIsTest
    ? { POLYGON: 'MATIC-AMOY', AVALANCHE: 'AVAX-FUJI', ARBITRUM: 'ARB-SEPOLIA', ETHEREUM: 'ETH-SEPOLIA', BASE: 'BASE-SEPOLIA', OPTIMISM: 'OP-SEPOLIA', SOLANA: 'SOL-DEVNET', BSC: 'EVM-TESTNET', BEP20: 'EVM-TESTNET', ARC: 'ARC-TESTNET' }
    : { POLYGON: 'POLYGON', AVALANCHE: 'AVAX', ARBITRUM: 'ARB', ETHEREUM: 'ETH', BASE: 'BASE', OPTIMISM: 'OP', SOLANA: 'SOL', BSC: 'EVM', BEP20: 'EVM', ARC: 'ARC' };
  return map[net] || net;
}

async function findCircleWallet(apiKey, address, blockchain) {
  let url = `${BASE_URL}/v1/w3s/wallets?address=${encodeURIComponent(address)}`;
  if (blockchain) url += `&blockchains=${encodeURIComponent(blockchain)}`;
  const res = await axios.get(url, {
    headers: { Authorization: `Bearer ${apiKey}`, accept: 'application/json' },
    timeout: 15000,
  });
  const wallets = res.data.data.wallets || [];
  const requested = String(blockchain || '').toUpperCase();
  return wallets.find((w) => (w.blockchains || []).map((b) => String(b).toUpperCase()).includes(requested)) || wallets[0] || null;
}

async function createCircleWallet(env, blockchain, userId) {
  const pubKeyResponse = await axios.get(`${BASE_URL}/v1/w3s/config/entity/publicKey`, {
    headers: { Authorization: `Bearer ${env.CIRCLE_API_KEY}`, accept: 'application/json' },
    timeout: 15000,
  });
  const publicKeyPem = pubKeyResponse.data.data.publicKey;
  const ciphertext = encryptEntitySecret(publicKeyPem, env.CIRCLE_ENTITY_SECRET);

  const res = await axios.post(
    `${BASE_URL}/v1/w3s/developer/wallets`,
    {
      idempotencyKey: crypto.randomUUID(),
      blockchains: [blockchain],
      entitySecretCiphertext: ciphertext,
      walletSetId: env.CIRCLE_WALLET_SET_ID,
      metadata: [{ name: `User ${String(userId).substring(0, 8)}`, refId: userId }],
    },
    {
      headers: {
        Authorization: `Bearer ${env.CIRCLE_API_KEY}`,
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      timeout: 15000,
    }
  );
  return res.data.data.wallets[0];
}

async function run() {
  const env = loadEnv();
  if (!env.CIRCLE_API_KEY || !env.CIRCLE_ENTITY_SECRET || !env.CIRCLE_WALLET_SET_ID || !env.DATABASE_URL) {
    console.error('Missing required env: DATABASE_URL, CIRCLE_API_KEY, CIRCLE_ENTITY_SECRET, CIRCLE_WALLET_SET_ID');
    process.exit(1);
  }

  const existing = await prisma.walletAddress.findMany({
    include: { wallet: { select: { userId: true } } },
  });
  console.log(`Found ${existing.length} wallet address record(s).`);

  const created = [];
  const errors = [];

  for (const record of existing) {
    const network = record.network ? record.network.toUpperCase() : '';
    const blockchain = blockchainFor(network);
    if (!blockchain) {
      errors.push(`${record.address}: unknown network ${network}`);
      continue;
    }
    try {
      const wallet = await findCircleWallet(env.CIRCLE_API_KEY, record.address, blockchain);
      if (wallet) {
        console.log(`OK    ${network} ${record.address} → already registered (${wallet.id})`);
        continue;
      }
      const createdWallet = await createCircleWallet(env, blockchain, record.wallet?.userId);
      console.log(`CREAT ${network} ${record.address} → ${createdWallet.address} (${createdWallet.id})`);
      created.push({ network, address: record.address, id: createdWallet.id });
    } catch (err) {
      errors.push(`${network} ${record.address}: ${err.response?.data?.message || err.response?.data || err.message}`);
    }
  }

  console.log('\n==============================================');
  console.log(`Newly created: ${created.length}`);
  if (created.length) {
    console.log('Registered wallets:');
    for (const c of created) console.log(`  - ${c.network} ${c.address}`);
  }
  if (errors.length) {
    console.log(`\nErrors (${errors.length}):`);
    for (const e of errors) console.log(`  - ${e}`);
  }
  await prisma.$disconnect();
}

run();