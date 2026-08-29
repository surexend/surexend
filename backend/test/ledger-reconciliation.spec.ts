import { LedgerReconciliationService } from '../src/common/ledger-reconciliation.service';

describe('LedgerReconciliationService', () => {
  const findMany = jest.fn();
  const findUnique = jest.fn();
  const auditFindFirst = jest.fn();
  const auditCreate = jest.fn();
  const balanceOf = jest.fn();

  const prisma: any = {
    ledgerEntry: { findMany },
    wallet: { findUnique },
    auditLog: { findFirst: auditFindFirst, create: auditCreate },
  };
  const ledger: any = { balanceOf };
  let service: LedgerReconciliationService;

  const accounts = (rows: Array<{ account: string; currency: string }>) => rows;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new LedgerReconciliationService(prisma, ledger);
    findMany.mockResolvedValue(accounts([{ account: 'user:u1:USDC', currency: 'USDC' }]));
    findUnique.mockResolvedValue({ userId: 'u1', usdcBalance: 5, usdtBalance: 0, localBalances: {}, localBalance: 0 });
  });

  it('reports clean when ledger matches the legacy float', async () => {
    balanceOf.mockResolvedValue(5_000_000n);
    await service.reconcile();
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it('persists USDC drift as a LEDGER_DRIFT audit row', async () => {
    balanceOf.mockResolvedValue(5_000_000n);
    findUnique.mockResolvedValue({ userId: 'u1', usdcBalance: 5.5, usdtBalance: 0, localBalances: {}, localBalance: 0 });
    auditFindFirst.mockResolvedValue(null);
    await service.reconcile();
    expect(auditCreate).toHaveBeenCalledWith({
      data: {
        action: 'LEDGER_DRIFT',
        metadata: { account: 'user:u1:USDC', currency: 'USDC', ledgerMinor: '5000000', legacy: 5.5 },
      },
    });
  });

  it('compares at display precision (does not flag float noise)', async () => {
    // 0.1 + 0.2 in float is 0.30000000000000004 — the ledger stores exact
    // minor units (300000), so this must NOT be reported as drift.
    balanceOf.mockResolvedValue(300_000n);
    findUnique.mockResolvedValue({ userId: 'u1', usdcBalance: 0.1 + 0.2, usdtBalance: 0, localBalances: {}, localBalance: 0 });
    await service.reconcile();
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it('does not write a duplicate row for an unchanged drift within the hour', async () => {
    balanceOf.mockResolvedValue(5_000_000n);
    findUnique.mockResolvedValue({ userId: 'u1', usdcBalance: 5.5, usdtBalance: 0, localBalances: {}, localBalance: 0 });
    auditFindFirst.mockResolvedValue({ id: 'existing' });
    await service.reconcile();
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it('reconciles local currencies through localBalances', async () => {
    findMany.mockResolvedValue(accounts([{ account: 'user:u1:NGN', currency: 'NGN' }]));
    findUnique.mockResolvedValue({ userId: 'u1', usdcBalance: 0, usdtBalance: 0, localBalances: { NGN: 100 }, localBalance: 0 });
    balanceOf.mockResolvedValue(9_900n); // 99.00 vs 100.00 -> drift
    auditFindFirst.mockResolvedValue(null);
    await service.reconcile();
    expect(auditCreate).toHaveBeenCalledWith({
      data: {
        action: 'LEDGER_DRIFT',
        metadata: { account: 'user:u1:NGN', currency: 'NGN', ledgerMinor: '9900', legacy: 100 },
      },
    });
  });

  it('parses localBalances when the column is a JSON string', async () => {
    findMany.mockResolvedValue(accounts([{ account: 'user:u1:GHS', currency: 'GHS' }]));
    findUnique.mockResolvedValue({ userId: 'u1', usdcBalance: 0, usdtBalance: 0, localBalances: '{"GHS":42}', localBalance: 0 });
    balanceOf.mockResolvedValue(4_200n);
    await service.reconcile();
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it('falls back to legacy localBalance for NGN when localBalances is empty', async () => {
    findMany.mockResolvedValue(accounts([{ account: 'user:u1:NGN', currency: 'NGN' }]));
    findUnique.mockResolvedValue({ userId: 'u1', usdcBalance: 0, usdtBalance: 0, localBalances: {}, localBalance: 12 });
    balanceOf.mockResolvedValue(1_200n);
    await service.reconcile();
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it('skips accounts with no matching wallet without persisting drift', async () => {
    findUnique.mockResolvedValue(null);
    balanceOf.mockResolvedValue(5_000_000n);
    await service.reconcile();
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it('ignores non-user (platform) accounts', async () => {
    findMany.mockResolvedValue(accounts([{ account: 'platform:treasury:USDC', currency: 'USDC' }]));
    await service.reconcile();
    expect(findUnique).not.toHaveBeenCalled();
    expect(balanceOf).toHaveBeenCalledWith('platform:treasury:USDC', 'USDC');
    expect(auditCreate).not.toHaveBeenCalled();
  });
});
