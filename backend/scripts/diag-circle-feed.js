/**
 * Diagnostic: query Circle's W3S transaction feed for the user's wallets to
 * inspect the "pending 4 USDC Arc send" + the duplicate "contract execution
 * outbound" rows.
 *
 * Run: `npx railway run node scripts/diag-circle-feed.js`
 */
const axios = require('axios');

const apiKey = process.env.CIRCLE_API_KEY || process.env.API_KEY;
const baseUrl = 'https://api.circle.com';

// Only needed for deriving the entity's wallet ids. If a stored wallet id is
// available from the DB later, this can be trimmed.
const ADDRESSES = [
  { network: 'ARC', blockchain: 'ARC-TESTNET', address: '0x967440e22b409b7d5a485a776f88dda89027efc8' },
  { network: 'ETHEREUM', blockchain: 'ETH-SEPOLIA', address: '0x967440e22b409b7d5a485a776f88dda89027efc8' },
];

async function main() {
  if (!apiKey) { console.error('No CIRCLE_API_KEY in env'); process.exit(1); }

  for (const rec of ADDRESSES) {
    try {
      const wres = await axios.get(
        `${baseUrl}/v1/w3s/wallets?address=${rec.address}`,
        { headers: { Authorization: `Bearer ${apiKey}`, accept: 'application/json' } }
      );
      const walletsArr = wres.data.data?.wallets || [];
      const cw = walletsArr.find((w) => w.address && w.address.toLowerCase() === rec.address.toLowerCase() && w.blockchain === rec.blockchain);
      if (!cw) {
        const all = walletsArr.map((w) => `${w.blockchain}:${w.address}`);
        console.log(`No ${rec.blockchain} Circle wallet for ${rec.address}; found: ${all.join(', ')}`);
        continue;
      }
      const txsRes = await axios.get(
        `${baseUrl}/v1/w3s/transactions?walletId=${cw.id}&pageSize=50`,
        { headers: { Authorization: `Bearer ${apiKey}`, accept: 'application/json' } }
      );
      console.log(`\n=== Circle ${rec.blockchain} wallet ${cw.id} feed ===`);
      for (const tx of (txsRes.data.data.transactions || [])) {
        console.log(
          tx.transactionType.padEnd(9), '|',
          String((tx.amounts || [])[0]).padEnd(8), '|',
          (tx.tokenSymbol || 'USDC').padEnd(6), '|',
          tx.state.padEnd(9), '|',
          tx.blockchain.padEnd(14), '|',
          tx.txHash,
          '| dst=', (tx.destinationAddress || '').slice(0, 12),
          '| src=', (tx.sourceAddress || '').slice(0, 12),
          '| id=', tx.id
        );
      }
    } catch (e) {
      console.error(`Circle ${rec.blockchain} failed: ${e.message}`);
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error('FATAL:', e.message); process.exit(1); });