/**
 * Diagnostic: dump SEND/RECEIVE transactions and the Circle feed for the
 * relevant wallets, to understand the pending-4USDC + duplicate + explorer issues.
 * Run: `npx railway run node scripts/diag-transactions.js`
 */
const { PrismaClient } = require('@prisma/client');
const axios = require('axios');

const prisma = new PrismaClient(
  process.env.DIRECT_URL
    ? { datasources: { db: { url: process.env.DIRECT_URL } } }
    : undefined
);

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function withRetry(fn, label, attempts = 4) {
  for (let i = 1; i <= attempts; i++) {
    try { return await fn(); }
    catch (e) {
      console.error(`[${label}] attempt ${i} failed: ${e.message}`);
      if (i === attempts) throw e;
      await sleep(3000 * i);
    }
  }
}

async function main() {
  const txs = await withRetry(() => prisma.transaction.findMany({
    where: { type: 'SEND' },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { reference: true, status: true, amount: true, network: true, createdAt: true, metadata: true },
  }), 'load txns');
  console.log('=== SEND transactions ===');
  for (const x of txs) {
    console.log('---', x.status, x.amount, x.network, x.reference, new Date(x.createdAt).toISOString());
    console.log(JSON.stringify(x.metadata).slice(0, 500));
  }

  const wallets = await withRetry(() => prisma.walletAddress.findMany({ take: 20 }), 'load wallets');
  console.log('\n=== WalletAddress records ===');
  for (const w of wallets) console.log(w.network, w.address, 'walletId=', w.walletId);

  const apiKey = process.env.CIRCLE_API_KEY || process.env.API_KEY;
  const baseUrl = 'https://api.circle.com';
  if (!apiKey) { console.log('\nNo API key available, skipping Circle feed.'); return; }

  // Find the ARC + ETHEREUM wallets to inspect their Circle transaction feeds.
  const arc = wallets.find((w) => w.network === 'ARC');
  const eth = wallets.find((w) => w.network === 'ETHEREUM');
  const inspect = [arc, eth].filter(Boolean);
  for (const rec of inspect) {
    try {
      const res = await axios.get(
        `${baseUrl}/v1/w3s/wallets?address=${rec.address}&blockchain=${rec.network === 'ARC' ? 'ARC-TESTNET' : rec.network === 'ETHEREUM' ? 'ETH-SEPOLIA' : 'ETH-SEPOLIA'}`,
        { headers: { Authorization: `Bearer ${apiKey}`, accept: 'application/json' } }
      );
      const cw = (res.data.data || []).find((w) => w.address && w.address.toLowerCase() === rec.address.toLowerCase());
      if (!cw) { console.log(`\nNo Circle wallet for ${rec.network} ${rec.address}`); continue; }
      const txsRes = await axios.get(
        `${baseUrl}/v1/w3s/transactions?walletId=${cw.id}&pageSize=50`,
        { headers: { Authorization: `Bearer ${apiKey}`, accept: 'application/json' } }
      );
      console.log(`\n=== Circle feed for ${rec.network} wallet ${cw.id} ===`);
      for (const tx of (txsRes.data.data.transactions || [])) {
        console.log(
          tx.transactionType, '|', (tx.amounts || [])[0], '|', tx.tokenSymbol || 'USDC',
          '|', tx.state, '|', tx.blockchain, '|', tx.txHash,
          '| src=', (tx.sourceAddress || '').slice(0, 10),
          '| dst=', (tx.destinationAddress || '').slice(0, 10),
          '|', tx.id
        );
      }
    } catch (e) {
      console.error(`Circle feed for ${rec.network} failed: ${e.message}`);
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error('FATAL:', e.message); process.exit(1); });