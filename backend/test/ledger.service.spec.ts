import { BadRequestException } from '@nestjs/common';
import { LedgerService } from '../src/common/ledger.service';

describe('LedgerService', () => {
  const createMany = jest.fn();
  const findMany = jest.fn();
  const prisma: any = { ledgerEntry: { createMany, aggregate: jest.fn(), groupBy: jest.fn(), findMany } };
  let service: LedgerService;
  beforeEach(() => { jest.clearAllMocks(); service = new LedgerService(prisma); });
  const lines = (amount = 100n) => [
    { transferId: 't1', account: 'user:u:USDC', currency: 'USDC', amountMinor: -amount },
    { transferId: 't1', account: 'platform:treasury:USDC', currency: 'USDC', amountMinor: amount },
  ];
  it('rejects fewer than two entries', async () => await expect(service.record(lines().slice(0, 1))).rejects.toThrow(BadRequestException));
  it('rejects unbalanced entries', async () => await expect(service.record([{ ...lines()[0], amountMinor: -99n }, lines()[1]])).rejects.toThrow(/Unaccounted/));
  it('rejects zero entries', async () => await expect(service.record([{ ...lines()[0], amountMinor: 0n }, lines()[1]])).rejects.toThrow());
  it('rejects fractional amounts', async () => await expect(service.record([{ ...lines()[0], amountMinor: 1.2 as any }, lines()[1]])).rejects.toThrow());
  it('writes balanced entries atomically', async () => {
    createMany.mockResolvedValue({ count: 2 });
    await service.record(lines());
    expect(createMany).toHaveBeenCalledTimes(1);
    expect(createMany.mock.calls[0][0].skipDuplicates).toBe(true);
    expect(createMany.mock.calls[0][0].data).toHaveLength(2);
  });
  it('returns [] on full replay (0 rows written)', async () => {
    createMany.mockResolvedValue({ count: 0 });
    await expect(service.record(lines())).resolves.toEqual([]);
    expect(createMany).toHaveBeenCalledTimes(1);
  });
  it('returns [] on partial write but still inserts missing rows', async () => {
    createMany.mockResolvedValue({ count: 1 });
    await expect(service.record(lines())).resolves.toEqual([]);
    expect(createMany.mock.calls[0][0].data).toHaveLength(2);
  });
  it('rejects an unbalanced currency independently', async () => await expect(service.record([...lines(), { transferId: 't1', account: 'user:u:NGN', currency: 'NGN', amountMinor: 1n }])).rejects.toThrow(/NGN/));
  it('derives a balance', async () => { prisma.ledgerEntry.aggregate.mockResolvedValue({ _sum: { amountMinor: 42n } }); await expect(service.balanceOf('a', 'USDC')).resolves.toBe(42n); });
  it('reads a balance through a supplied transaction client', async () => {
    const txAggregate = jest.fn().mockResolvedValue({ _sum: { amountMinor: 7n } });
    const tx: any = { ledgerEntry: { aggregate: txAggregate } };
    await expect(service.balanceOf('a', 'USDC', tx)).resolves.toBe(7n);
    expect(txAggregate).toHaveBeenCalledWith({ where: { account: 'a', currency: 'USDC' }, _sum: { amountMinor: true } });
  });
  it('derives multiple balances through a supplied transaction client', async () => {
    const txGroupBy = jest.fn().mockResolvedValue([{ currency: 'USDC', _sum: { amountMinor: 3n } }]);
    const tx: any = { ledgerEntry: { groupBy: txGroupBy } };
    await expect(service.balancesOf('a', tx)).resolves.toEqual({ USDC: 3n });
  });
  it('derives all user currency balances via the user account prefix', async () => {
    const txGroupBy = jest.fn().mockResolvedValue([{ currency: 'USDC', _sum: { amountMinor: 3n } }, { currency: 'NGN', _sum: { amountMinor: 400n } }]);
    const tx: any = { ledgerEntry: { groupBy: txGroupBy } };
    await expect(service.balancesOfUser('u', tx)).resolves.toEqual({ USDC: 3n, NGN: 400n });
    expect(txGroupBy).toHaveBeenCalledWith({ by: ['currency'], where: { account: { startsWith: 'user:u:' } }, _sum: { amountMinor: true } });
  });
  it('returns zero for an empty balance', async () => { prisma.ledgerEntry.aggregate.mockResolvedValue({ _sum: { amountMinor: null } }); await expect(service.balanceOf('a', 'USDC')).resolves.toBe(0n); });
  it('derives multiple currency balances', async () => { prisma.ledgerEntry.groupBy.mockResolvedValue([{ currency: 'USDC', _sum: { amountMinor: 3n } }, { currency: 'NGN', _sum: { amountMinor: 4n } }]); await expect(service.balancesOf('a')).resolves.toEqual({ USDC: 3n, NGN: 4n }); });
  it('builds canonical account names', () => { expect(service.userAccount('u', 'USDC')).toBe('user:u:USDC'); expect(service.externalAccount('arc', 'USDC')).toBe('external:arc:USDC'); });

  describe('reverse', () => {
    const original = [
      { transferId: 't1', account: 'user:u:USDC', currency: 'USDC', amountMinor: -250n, reference: 't1', kind: 'SEND', createdAt: new Date() },
      { transferId: 't1', account: 'external:arc:USDC', currency: 'USDC', amountMinor: 200n, reference: 't1', kind: 'EXTERNAL_SEND', createdAt: new Date() },
      { transferId: 't1', account: 'platform:fees:USDC', currency: 'USDC', amountMinor: 50n, reference: 't1', kind: 'FEE', createdAt: new Date() },
    ];
    it('mirrors every entry under -REFUND with negated amounts', async () => {
      findMany.mockResolvedValue(original);
      createMany.mockResolvedValue({ count: 3 });
      await service.reverse('t1');
      const data = createMany.mock.calls[0][0].data;
      expect(data).toHaveLength(3);
      expect(data[0]).toMatchObject({ transferId: 't1-REFUND', account: 'user:u:USDC', currency: 'USDC', amountMinor: 250n, kind: 'SEND_REFUND' });
      expect(data[1]).toMatchObject({ amountMinor: -200n, kind: 'EXTERNAL_SEND_REFUND' });
      expect(data[2]).toMatchObject({ amountMinor: -50n, kind: 'FEE_REFUND' });
    });
    it('writes nothing when no entries exist', async () => {
      findMany.mockResolvedValue([]);
      await expect(service.reverse('t1')).resolves.toEqual([]);
      expect(createMany).not.toHaveBeenCalled();
    });
    it('is replay-safe: a second call writes nothing', async () => {
      findMany.mockResolvedValue(original);
      createMany.mockResolvedValue({ count: 0 });
      await expect(service.reverse('t1')).resolves.toEqual([]);
      expect(createMany).toHaveBeenCalledTimes(1);
    });
  });
});
