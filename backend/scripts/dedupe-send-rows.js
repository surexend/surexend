/**
 * Reconcile legacy duplicate SEND rows created before the sync merge fix:
 * an OUTBOUND Circle send used to be recorded twice — once locally (PENDING,
 * no txHash) at initiation and once from the Circle feed (COMPLETED, with
 * txHash). For each PENDING SEND with no txHash that has a matching COMPLETED
 * SEND (same user, amount, recipient) within a short window, copy the circle
 * metadata (txHash, network, circleTransactionId, fee) onto the PENDING row,
 * mark it COMPLETED, and delete the duplicate COMPLETED row.
 *
 * Run: `npx railway run node scripts/dedupe-send-rows.js`
 */
const { createPrismaClient } = require('./prisma-client');

const prisma = createPrismaClient();
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

async function main() {
  const pending = await prisma.transaction.findMany({
    where: { type: 'SEND', status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });

  let merged = 0;
  let deleted = 0;

  for (const p of pending) {
    const meta = (p.metadata || {}) || {};
    if (meta.txHash) continue; // already reconciled

    const recipients = [meta.toAddress, meta.recipient, meta.destinationAddress]
      .filter(Boolean)
      .map((s) => String(s).toLowerCase());

    const dup = await prisma.transaction.findFirst({
      where: {
        userId: p.userId,
        type: 'SEND',
        status: 'COMPLETED',
        amount: p.amount,
        createdAt: {
          gte: new Date(new Date(p.createdAt).getTime() - WINDOW_MS),
          lte: new Date(new Date(p.createdAt).getTime() + WINDOW_MS),
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!dup) continue;
    const dupMeta = (dup.metadata || {}) || {};

    // Only merge when the completed row actually carries the txHash this
    // pending row was waiting for, and (when known) the recipient matches.
    if (!dupMeta.txHash) continue;
    if (recipients.length > 0 && dupMeta.destinationAddress) {
      const d = String(dupMeta.destinationAddress).toLowerCase();
      if (!recipients.includes(d)) continue;
    }

    await prisma.transaction.update({
      where: { id: p.id },
      data: {
        status: 'COMPLETED',
        fee: dup.fee,
        metadata: { ...meta, ...dupMeta },
      },
    });
    await prisma.transaction.delete({ where: { id: dup.id } });
    merged++;
    deleted++;
    console.log(`Merged ${p.reference} <- ${dup.reference} (${p.amount} USDC)`);
  }

  console.log(`Done: ${merged} pending rows merged/updated, ${deleted} duplicate rows deleted`);
}

main().catch((e) => {
  console.error('ERROR:', (e && e.message) || e);
  process.exit(1);
});