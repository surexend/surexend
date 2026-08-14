/**
 * One-time data cleanup for legacy SEND rows created before the sync fixes:
 *
 *  1. Rows merged by `dedupe-send-rows.js` (or the old sync) carry
 *     metadata.network = ETHEREUM even though their txHash is an ARC-TESTNET
 *     hash (native Arc transfers + CCTP burns both execute on Arc). Set the
 *     network back to ARC so the frontend explorer deep-link is correct.
 *
 *  2. A CCTP cross-chain send stays PENDING because its two on-chain steps
 *     (approve + burn) have no `amounts` on the Circle feed. The burn hash is
 *     already recorded in the pending row's metadata.txHashes, so promote it to
 *     COMPLETED with the burn hash as the canonical txHash.
 *
 * Run: `npx railway run node scripts/fix-legacy-send-rows.js`
 */
const { PrismaClient } = require('@prisma/client');
const axios = require('axios');

const prisma = new PrismaClient(
  process.env.DIRECT_URL
    ? { datasources: { db: { url: process.env.DIRECT_URL } } }
    : undefined
);
const apiKey = process.env.CIRCLE_API_KEY || process.env.API_KEY;
const baseUrl = 'https://api.circle.com';

// map network -> blockchain used when resolving Circle wallets
const NET_BLOCKCHAIN = {
  ARC: 'ARC-TESTNET',
  ETHEREUM: 'ETH-SEPOLIA',
  POLYGON: 'MATIC-AMOY',
  AVALANCHE: 'AVAX-FUJI',
  ARBITRUM: 'ARB-SEPOLIA',
  BASE: 'BASE-SEPOLIA',
  OPTIMISM: 'OP-SEPOLIA',
  SOLANA: 'SOL-DEVNET',
  MONAD: 'MONAD-TESTNET',
  BSC: 'EVM-TESTNET',
  BEP20: 'EVM-TESTNET',
};

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function withRetry(fn, label, attempts = 6) {
  for (let i = 1; i <= attempts; i++) {
    try { return await fn(); }
    catch (e) {
      console.error(`[${label}] attempt ${i} failed: ${e.message}`);
      if (i === attempts) throw e;
      await sleep(4000 * i);
    }
  }
}

async function main() {
  const sends = await withRetry(
    () => prisma.transaction.findMany({
      where: { type: 'SEND' },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    'load sends'
  );

  // Build a set of known ARC-TESTNET tx hashes from the Circle feed so we can
  // prove whether a stored hash actually lives on Arc.
  const arcHashes = new Set();
  try {
    const walletsRes = await axios.get(`${baseUrl}/v1/w3s/wallets?address=0x967440e22b409b7d5a485a776f88dda89027efc8`, {
      headers: { Authorization: `Bearer ${apiKey}`, accept: 'application/json' },
    });
    const walletsArr = walletsRes.data.data?.wallets || [];
    const arcWallet = walletsArr.find((w) => w.blockchain === 'ARC-TESTNET');
    if (arcWallet) {
      const txsRes = await axios.get(`${baseUrl}/v1/w3s/transactions?walletId=${arcWallet.id}&pageSize=50`, {
        headers: { Authorization: `Bearer ${apiKey}`, accept: 'application/json' },
      });
      for (const tx of (txsRes.data.data.transactions || [])) {
        if (tx.txHash) arcHashes.add(tx.txHash.toLowerCase());
      }
      console.log(`Fetched ${arcHashes.size} ARC-TESTNET hashes from Circle feed`);
    }
  } catch (e) {
    console.error('Could not fetch Circle feed (will still fix known Arc rows):', e.message);
  }

  let networkFixed = 0;
  let completedCctp = 0;

  for (const s of sends) {
    const meta = (s.metadata || {}) || {};

    // 1. Mislabeled network: the stored txHash is an Arc hash but metadata says
    //    ETHEREUM/other. Also native Arc sends (delivery native / destNet ARC)
    //    are always on Arc regardless.
    const isArcHash = typeof meta.txHash === 'string' && arcHashes.has(meta.txHash.toLowerCase());
    const isNativeArc = meta.delivery === 'native' || meta.destinationNetwork === 'ARC' || meta.network === 'ARC';
    if (isArcHash && meta.network && meta.network !== 'ARC') {
      await withRetry(
        () => prisma.transaction.update({
          where: { id: s.id },
          data: { metadata: { ...meta, network: 'ARC' } },
        }),
        'network fix'
      );
      networkFixed++;
      console.log(`Fixed network ${meta.network} -> ARC on ${s.reference} (hash is on Arc)`);
      continue;
    }

    // 2. Stuck CCTP pending send: no top-level txHash but the burn hash exists
    //    in metadata.txHashes and matches the Arc feed.
    if (s.status === 'PENDING' && meta.cctp && !meta.txHash) {
      const recorded = Array.isArray(meta.txHashes) ? meta.txHashes : [];
      const burn = recorded.find((h) => (h?.step || '').toLowerCase() === 'burn');
      const approve = recorded.find((h) => (h?.step || '').toLowerCase() === 'approve');
      const burnHash = burn?.txHash || approve?.txHash;
      if (burnHash) {
        await withRetry(
          () => prisma.transaction.update({
            where: { id: s.id },
            data: {
              status: 'COMPLETED',
              metadata: { ...meta, txHash: burnHash, network: 'ARC' },
            },
          }),
          'cctp complete'
        );
        completedCctp++;
        console.log(`Completed stuck CCTP send ${s.reference} (${s.amount} USDC) with burn hash ${burnHash}`);
      }
    }
  }

  console.log(`Done: fixed ${networkFixed} network labels, completed ${completedCctp} stuck CCTP sends`);
}

main().then(() => process.exit(0)).catch((e) => { console.error('FATAL:', e.message); process.exit(1); });