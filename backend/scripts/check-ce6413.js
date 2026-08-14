const axios = require('axios');
const BASE_URL = 'https://api.circle.com';
const apiKey = process.env.CIRCLE_API_KEY;

const WID = 'c20711ea-2382-56b5-8f99-e165c4b98ef1';

async function main() {
  const bal = await axios.get(`${BASE_URL}/v1/w3s/wallets/${WID}/balances`, {
    headers: { Authorization: `Bearer ${apiKey}`, accept: 'application/json' }, timeout: 20000,
  });
  const tbs = bal.data.data.tokenBalances || [];
  const usdc = tbs.filter((t) => t.token.symbol === 'USDC').map((t) => `${t.token.blockchain} native=${t.token.isNative} amount=${t.amount}`);
  console.log('ce6413 ARC balances:', usdc.join(' | '));

  const txs = await axios.get(`${BASE_URL}/v1/w3s/transactions?walletId=${WID}&pageSize=15`, {
    headers: { Authorization: `Bearer ${apiKey}`, accept: 'application/json' }, timeout: 20000,
  });
  const items = txs.data.data.transactions || [];
  console.log(`ce6413 ARC txs(${items.length}):`);
  for (const t of items) {
    console.log(`  ${t.blockchain} ${t.state} ${t.operation} amount=${t.amount} txHash=${(t.txHash || '').slice(0, 18)}`);
  }
}

main().catch((e) => console.log('ERROR:', e.response ? JSON.stringify(e.response.data) : e.message));