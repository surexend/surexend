const axios = require('axios');
const crypto = require('crypto');
const BASE_URL = 'https://api.circle.com';
const apiKey = process.env.CIRCLE_API_KEY;
const userId = 'caf36b4a-1a17-44c9-a59e-72aeb705126e';

async function derive(sourceBlockchain, walletAddress, targetBlockchain) {
  const res = await axios.put(
    `${BASE_URL}/v1/w3s/developer/wallets/derive`,
    {
      sourceBlockchain,
      walletAddress,
      targetBlockchain,
      metadata: { name: `User ${userId.substring(0, 8)} - ${targetBlockchain}`, refId: userId },
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
  const w = res.data.data.wallet || res.data.data;
  console.log(`DERIVED ${sourceBlockchain} -> ${targetBlockchain} @ ${walletAddress}: id=${w.id} address=${w.address} blockchain=${w.blockchain}`);
}

async function main() {
  await derive('BASE-SEPOLIA', '0xce6413b391d2693606ad6d9a74907eb734284d49', 'ARC-TESTNET');
}

main().catch((e) => console.log('ERROR:', e.response ? JSON.stringify(e.response.data) : e.message));