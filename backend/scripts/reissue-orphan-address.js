/**
 * Reissue walletAddress records for the legacy orphan address that has no
 * Circle wallet on any chain (0x872357... / user 9c298a56). Creates a fresh
 * Circle ETH-SEPOLIA wallet, derives ARC-TESTNET at the same fresh address,
 * then swaps the DB ETHEREUM + ARC records to the new address.
 *
 * Run: `npx railway run node scripts/reissue-orphan-address.js`
 */
const crypto = require('crypto');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const BASE_URL = 'https://api.circle.com';

const USER_ID = '9c298a56-5025-4332-9515-50f7a11a4304';

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

async function createWallet(env, blockchain) {
  const pubKeyResponse = await axios.get(`${BASE_URL}/v1/w3s/config/entity/publicKey`, {
    headers: { Authorization: `Bearer ${env.CIRCLE_API_KEY}`, accept: 'application/json' },
    timeout: 15000,
  });
  const ciphertext = encryptEntitySecret(pubKeyResponse.data.data.publicKey, env.CIRCLE_ENTITY_SECRET);
  const res = await axios.post(
    `${BASE_URL}/v1/w3s/developer/wallets`,
    {
      idempotencyKey: crypto.randomUUID(),
      blockchains: [blockchain],
      entitySecretCiphertext: ciphertext,
      walletSetId: env.CIRCLE_WALLET_SET_ID,
      metadata: [{ name: `User ${USER_ID.substring(0, 8)}`, refId: USER_ID }],
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

async function deriveWallet(env, sourceBlockchain, address) {
  const res = await axios.put(
    `${BASE_URL}/v1/w3s/developer/wallets/derive`,
    {
      sourceBlockchain,
      walletAddress: address,
      targetBlockchain: 'ARC-TESTNET',
      metadata: { name: `User ${USER_ID.substring(0, 8)} - ARC`, refId: USER_ID },
    },
    {
      headers: {
        Authorization: `Bearer ${env.CIRCLE_API_KEY}`,
        'Content-Type': 'application/json',
        accept: 'application/json',
        'Idempotency-Key': crypto.randomUUID(),
      },
      timeout: 30000,
    }
  );
  return res.data.data.wallet || res.data.data;
}

async function findWallet(env, address) {
  const res = await axios.get(`${BASE_URL}/v1/w3s/wallets?address=${encodeURIComponent(address)}`, {
    headers: { Authorization: `Bearer ${env.CIRCLE_API_KEY}`, accept: 'application/json' },
    timeout: 15000,
  });
  return (res.data.data.wallets || [])[0] || null;
}

async function run() {
  const env = loadEnv();
  if (!env.CIRCLE_API_KEY || !env.CIRCLE_ENTITY_SECRET || !env.CIRCLE_WALLET_SET_ID || !env.DATABASE_URL) {
    console.error('Missing required env.');
    process.exit(1);
  }

  const before = await prisma.walletAddress.findMany({
    where: { wallet: { userId: USER_ID } },
    orderBy: { network: 'asc' },
  });
  console.log('Before:', before.map((r) => `${r.network}=${r.address.slice(0, 10)}`).join(' | '));

  const ethWallet = await createWallet(env, 'ETH-SEPOLIA');
  console.log(`Created ETH-SEPOLIA wallet ${ethWallet.id} @ ${ethWallet.address}`);

  const arcWallet = await deriveWallet(env, 'ETH-SEPOLIA', ethWallet.address);
  console.log(`Derived ARC-TESTNET wallet ${arcWallet.id} @ ${arcWallet.address}`);

  if (arcWallet.address.toLowerCase() !== ethWallet.address.toLowerCase()) {
    throw new Error('Derived ARC address does not match source; aborting before any DB change.');
  }
  const check = await findWallet(env, ethWallet.address);
  console.log('Circle holds a wallet at new address:', !!check);

  // Swap the DB records. The wallet's existing ETHEREUM/ARC rows point at the
  // orphan; replace their addresses with the fresh Circle-backed one.
  const updated = await prisma.walletAddress.updateMany({
    where: { wallet: { userId: USER_ID } },
    data: { address: ethWallet.address },
  });
  console.log('Updated walletAddress records:', updated.count);

  const after = await prisma.walletAddress.findMany({
    where: { wallet: { userId: USER_ID } },
    orderBy: { network: 'asc' },
  });
  console.log('After:', after.map((r) => `${r.network}=${r.address.slice(0, 10)}`).join(' | '));
  await prisma.$disconnect();
}

run().catch((e) => {
  console.error('ERROR:', e.response ? JSON.stringify(e.response.data) : e.message);
  process.exit(1);
});