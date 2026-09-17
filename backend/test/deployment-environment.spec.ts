import { ServiceUnavailableException } from '@nestjs/common';
import { FinancialSafetyService } from '../src/common/financial-safety.service';

/**
 * Database chain-environment stamp. The point of these tests is the rule the
 * handoff called out: a database that carried testnet balances must never be
 * booted as mainnet, because Wallet/LedgerEntry/WalletAddress rows are not
 * network-scoped.
 */
function makeService(opts: {
  stamp?: { chainEnvironment: string; circleKeyPrefix: string; stampedAt: Date } | null;
  usage?: { wallets: number; addresses: number; ledger: number; funded: number };
}) {
  const state = { stamp: opts.stamp ?? null };
  const usage = opts.usage ?? { wallets: 0, addresses: 0, ledger: 0, funded: 0 };
  const executeRaw = jest.fn(async (strings: TemplateStringsArray, ...values: any[]) => {
    if (!state.stamp) {
      state.stamp = { chainEnvironment: values[0], circleKeyPrefix: values[1], stampedAt: new Date() };
    }
    return 1;
  });
  const queryRaw = jest.fn(async (strings: TemplateStringsArray) => {
    const sql = strings.join('?');
    if (sql.includes('FROM "DeploymentEnvironment"')) return state.stamp ? [state.stamp] : [];
    if (sql.includes('COUNT(*)::int FROM "WalletAddress"')) return [usage];
    throw new Error(`unexpected query: ${sql}`);
  });
  const prisma: any = { $queryRaw: queryRaw, $executeRaw: executeRaw };
  const config: any = { get: jest.fn() };
  return { service: new FinancialSafetyService(prisma, config), executeRaw, state };
}

describe('deployment environment stamp', () => {
  it('stamps a fresh database on first boot and accepts the same environment afterwards', async () => {
    const { service, executeRaw, state } = makeService({});
    await expect(service.assertDeploymentEnvironment({ chainEnvironment: 'testnet', circleKeyPrefix: 'TEST_API_KEY' }))
      .resolves.toMatchObject({ stamped: true, chainEnvironment: 'testnet' });
    expect(executeRaw).toHaveBeenCalledTimes(1);
    expect(state.stamp).toMatchObject({ chainEnvironment: 'testnet', circleKeyPrefix: 'TEST_API_KEY' });

    await expect(service.assertDeploymentEnvironment({ chainEnvironment: 'testnet', circleKeyPrefix: 'TEST_API_KEY' }))
      .resolves.toMatchObject({ stamped: false });
    expect(executeRaw).toHaveBeenCalledTimes(1);
  });

  it('refuses to boot a testnet-stamped database as mainnet', async () => {
    const { service, executeRaw } = makeService({
      stamp: { chainEnvironment: 'testnet', circleKeyPrefix: 'TEST_API_KEY', stampedAt: new Date('2026-09-01T00:00:00Z') },
    });
    await expect(service.assertDeploymentEnvironment({ chainEnvironment: 'mainnet', circleKeyPrefix: 'LIVE_API_KEY' }))
      .rejects.toThrow(/stamped testnet .* CHAIN_ENV=mainnet/);
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it('refuses to boot a mainnet-stamped database as testnet', async () => {
    const { service } = makeService({
      stamp: { chainEnvironment: 'mainnet', circleKeyPrefix: 'LIVE_API_KEY', stampedAt: new Date() },
    });
    await expect(service.assertDeploymentEnvironment({ chainEnvironment: 'testnet', circleKeyPrefix: 'TEST_API_KEY' }))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('refuses a Circle key environment that differs from the stamp', async () => {
    const { service } = makeService({
      stamp: { chainEnvironment: 'mainnet', circleKeyPrefix: 'LIVE_API_KEY', stampedAt: new Date() },
    });
    await expect(service.assertDeploymentEnvironment({ chainEnvironment: 'mainnet', circleKeyPrefix: 'TEST_API_KEY' }))
      .rejects.toThrow(/stamped for Circle LIVE_API_KEY/);
  });

  it('refuses to stamp a used (unstamped) database as mainnet', async () => {
    for (const usage of [
      { wallets: 3, addresses: 0, ledger: 0, funded: 1 },
      { wallets: 3, addresses: 2, ledger: 0, funded: 0 },
      { wallets: 3, addresses: 0, ledger: 10, funded: 0 },
    ]) {
      const { service, executeRaw } = makeService({ usage });
      await expect(service.assertDeploymentEnvironment({ chainEnvironment: 'mainnet', circleKeyPrefix: 'LIVE_API_KEY' }))
        .rejects.toThrow(/refusing to stamp a used database as mainnet/);
      expect(executeRaw).not.toHaveBeenCalled();
    }
  });

  it('stamps a clean database as mainnet (zero-balance wallets without addresses or ledger rows are allowed)', async () => {
    const { service, state } = makeService({ usage: { wallets: 2, addresses: 0, ledger: 0, funded: 0 } });
    await expect(service.assertDeploymentEnvironment({ chainEnvironment: 'mainnet', circleKeyPrefix: 'LIVE_API_KEY' }))
      .resolves.toMatchObject({ stamped: true, chainEnvironment: 'mainnet' });
    expect(state.stamp).toMatchObject({ chainEnvironment: 'mainnet', circleKeyPrefix: 'LIVE_API_KEY' });
  });

  it('fails closed when the stamp table cannot be read', async () => {
    const prisma: any = { $queryRaw: jest.fn().mockRejectedValue(new Error('relation does not exist')), $executeRaw: jest.fn() };
    const service = new FinancialSafetyService(prisma, { get: jest.fn() } as any);
    await expect(service.assertDeploymentEnvironment({ chainEnvironment: 'testnet', circleKeyPrefix: 'TEST_API_KEY' }))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
