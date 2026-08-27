#!/usr/bin/env node
/**
 * Diagnose a balance / transaction mismatch for a SureXend user.
 *
 * Usage:
 *   node scripts/diagnose-balance.js <email> <password>
 *
 * Optional env:
 *   BACKEND_URL   e.g. https://api.surexend.com   (default: http://localhost:3001)
 *
 * The script:
 *   1. Logs in and stores the access token.
 *   2. Fetches /wallets/balance and the full transaction history.
 *   3. Reconstructs the expected USD balance from signed transaction amounts.
 *   4. Prints a clear comparison so you can see WHERE the discrepancy is.
 *
 * If the discrepancy is in the difference between reported and reconstructed
 * balance, the bug is in the backend ledger (you must fix that on the
 * server). If the discrepancy is that some transactions don't appear in
 * the API at all, the bug is in the transactions endpoint (missing records).
 */

const [, , emailArg, passwordArg] = process.argv
if (!emailArg || !passwordArg) {
  console.error('Usage: node scripts/diagnose-balance.js <email> <password>')
  process.exit(1)
}

const BACKEND_URL = (process.env.BACKEND_URL || 'http://localhost:3001').replace(/\/$/, '')

const login = async () => {
  const r = await fetch(`${BACKEND_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: emailArg, password: passwordArg }),
  })
  if (!r.ok) throw new Error(`Login failed: ${r.status} ${await r.text()}`)
  const data = await r.json()
  return data.accessToken || data.access_token || data.token
}

const api = (token, path) =>
  fetch(`${BACKEND_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } }).then(async (r) => {
    if (!r.ok) throw new Error(`GET ${path} -> ${r.status}: ${await r.text()}`)
    return r.json()
  })

// Treat these types as money IN (+), the rest as money OUT (-), in USD.
const INFLOW = new Set(['RECEIVE', 'REFERRAL_EARNING', 'DEPOSIT', 'BILL_REFUND'])
const OUTFLOW = new Set(['SEND', 'BILL_PAYMENT', 'WITHDRAWAL'])
const SWAP = 'CONVERT'

const sign = (tx) => {
  const type = String(tx.type || '').toUpperCase()
  const amt = Number(tx.amount) || 0
  const currency = String(tx.currency || 'USD').toUpperCase()
  // We can't know live FX rates for past transactions here; if the currency
  // is not USD, the report flags it as "non-USD — skip" so you can see it.
  if (currency !== 'USD' && currency !== 'USDC' && currency !== 'USDT') return null
  if (INFLOW.has(type)) return +amt
  if (OUTFLOW.has(type)) return -amt
  if (type === SWAP) {
    // Could be either way. Use metadata if present.
    const from = String(tx.metadata?.from || '').toUpperCase()
    if (from === 'USD' || from === 'USDC' || from === 'USDT') return -amt
    return +amt
  }
  return null
}

const main = async () => {
  console.log(`Backend: ${BACKEND_URL}`)
  console.log(`User:    ${emailArg}`)
  const token = await login()
  console.log('✔ Logged in\n')

  const balance = await api(token, '/wallets/balance')
  const history = await api(token, '/transactions?limit=500')
  const txs = Array.isArray(history) ? history : (history?.transactions || [])

  console.log('--- BALANCE AS REPORTED BY API ---')
  console.log(JSON.stringify(balance, null, 2))

  console.log(`\n--- TRANSACTION HISTORY (${txs.length} items) ---`)
  let reconstructed = 0
  const flagged = []
  for (const tx of txs) {
    const s = sign(tx)
    if (s === null) flagged.push(tx)
    else reconstructed += s
  }
  console.log(`Reconstructed from transactions: $${reconstructed.toFixed(2)}`)
  console.log(`Reported USD balance:           $${Number(balance.usdBalance ?? 0).toFixed(2)}`)
  const diff = Number(balance.usdBalance ?? 0) - reconstructed
  console.log(`Difference:                     $${diff.toFixed(2)}`)

  if (flagged.length) {
    console.log(`\nFlagged ${flagged.length} transactions I could not categorise or that were in a non-USD currency. Top 20:`)
    for (const tx of flagged.slice(0, 20)) {
      console.log(`  ${tx.id}  ${tx.type}  ${tx.amount} ${tx.currency || ''}  ${tx.status || ''}  ${tx.createdAt || ''}`)
    }
  } else {
    console.log('\nNo uncategorised transactions — all amounts reconstructed cleanly.')
  }

  if (Math.abs(diff) > 0.01) {
    console.log('\n⚠  DISCREPANCY DETECTED.')
    if (diff > 0) {
      console.log(`   The API says you have $${diff.toFixed(2)} MORE than your transactions explain.`)
      console.log('   Likely causes: missing transactions in /transactions, referral/promo/admin credits not appearing as transactions, or the balance was set/overwritten without a matching transaction record.')
    } else {
      console.log(`   The API says you have $${Math.abs(diff).toFixed(2)} LESS than your transactions explain.`)
      console.log('   Likely causes: duplicate transactions counted twice, or a transaction recorded as + that should be -, or a withdrawal/debit never logged.')
    }
  } else {
    console.log('\n✔ Balance matches reconstructed total — no discrepancy.')
  }
}

main().catch((e) => {
  console.error('FAILED:', e.message)
  process.exit(1)
})
