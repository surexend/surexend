/**
 * One-off backfill: for EVERY distinct EVM address this app displays (any
 * network, any user), make sure Circle holds an ARC-TESTNET wallet at that
 * exact address using the "derive by address" endpoint. Circle only indexes
 * deposits on chains where it holds a wallet at that address, so without this
 * a Base/Polygon deposit that lands on Arc stays invisible to the console.
 *
 * Mirrors WalletsService.ensureAllAddressesHaveArcWallets(). Run from the
 * backend dir with deployed env: `npx railway run node
 * scripts/derive-all-arc-wallets.js`.
 */
const crypto = require('crypto');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
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
  return env;
}

async function findArcWallet(apiKey, address) {
  const url = `${BASE_URL}/v1/w3s/wallets?address=${encodeURIComponent(address)}&blockchains=ARC-TESTNET`;
  const res = await axios.get(url, {
    headers: { Authorization: `Bearer ${apiKey}`, accept: 'application/json' },
    timeout: 15000,
  });
  return (res.data.data.wallets || [])[0] || null;
}

async function findAnyWallet(apiKey, address) {
  const url = `${BASE_URL}/v1/w3s/wallets?address=${encodeURIComponent(address)}`;
  const res = await axios.get(url, {
    headers: { Authorization: `Bearer ${apiKey}`, accept: 'application/json' },
    timeout: 15000,
  });
  return (res.data.data.wallets || [])[0] || null;
}

async function deriveArc(apiKey, sourceBlockchain, address, userId) {
  const res = await axios.put(
    `${BASE_URL}/v1/w3s/developer/wallets/derive`,
    {
      sourceBlockchain,
      walletAddress: address,
      targetBlockchain: 'ARC-TESTNET',
      metadata: { name: `User ${String(userId || 'unknown').substring(0, 8)} - ARC`, refId: userId },
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        accept: 'application/json',
        'Idempotency-Key': crypto.randomUUID(),
      },
      timeout: 30000,
    }
  );
  return res.data.data.wallet || res.data.data;
}

async function run() {
  const env = loadEnv();
  if (!env.CIRCLE_API_KEY || !env.DATABASE_URL) {
    console.error('Missing required env: DATABASE_URL, CIRCLE_API_KEY');
    process.exit(1);
  }

  const records = await prisma.walletAddress.findMany({
    include: { wallet: { select: { userId: true } } },
  });
  const seen = new Set();
  const candidates = [];
  for (const r of records) {
    if (!/^0x[a-fA-F0-9]{40}$/.test(r.address)) continue;
    const key = r.address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({ address: r.address, userId: r.wallet?.userId });
  }
  console.log(`Found ${candidates.length} distinct EVM address(es) across ${records.length} records.\n`);

  let registered = 0;
  let skipped = 0;
  const failed = [];

  for (const c of candidates) {
    try {
      const arc = await findArcWallet(env.CIRCLE_API_KEY, c.address);
      if (arc) {
        console.log(`SKIP  ${c.address} → already ARC wallet ${arc.id}`);
        skipped++;
        continue;
      }
      const source = await findAnyWallet(env.CIRCLE_API_KEY, c.address);
      if (!source) {
        throw new Error('no Circle wallet exists at this address on any chain');
      }
      const sourceBlockchain = (source.blockchains || [source.blockchain] || [])[0];
      const w = await deriveArc(env.CIRCLE_API_KEY, sourceBlockchain, c.address, c.userId);
      console.log(`DERIV ${c.address} → ARC ${w.id} blockchain=${w.blockchain}`);
      registered++;
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.errors || err.message;
      console.log(`FAIL  ${c.address} → ${JSON.stringify(msg)}`);
      failed.push(c.address);
    }
  }

  console.log('\n==============================================');
  console.log(`Registered: ${registered}, already present: ${skipped}, failed: ${failed.length}`);
  await prisma.$disconnect();
}

run().catch((e) => {
  console.error(e.response ? JSON.stringify(e.response.data) : e.message);
  process.exit(1);
});