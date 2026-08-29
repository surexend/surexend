import { BadRequestException } from '@nestjs/common';
import { LedgerService } from '../src/common/ledger.service';

describe('LedgerService', () => {
  const create = jest.fn();
  const prisma: any = { ledgerEntry: { create, aggregate: jest.fn(), groupBy: jest.fn(), findMany: jest.fn() } };
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
  it('writes balanced entries', async () => { create.mockResolvedValue({}); await service.record(lines()); expect(create).toHaveBeenCalledTimes(2); });
  it('treats duplicate writes as replay', async () => { create.mockRejectedValue({ code: 'P2002' }); await expect(service.record(lines())).resolves.toEqual([]); });
  it('rejects an unbalanced currency independently', async () => await expect(service.record([...lines(), { transferId: 't1', account: 'user:u:NGN', currency: 'NGN', amountMinor: 1n }])).rejects.toThrow(/NGN/));
  it('derives a balance', async () => { prisma.ledgerEntry.aggregate.mockResolvedValue({ _sum: { amountMinor: 42n } }); await expect(service.balanceOf('a', 'USDC')).resolves.toBe(42n); });
  it('returns zero for an empty balance', async () => { prisma.ledgerEntry.aggregate.mockResolvedValue({ _sum: { amountMinor: null } }); await expect(service.balanceOf('a', 'USDC')).resolves.toBe(0n); });
  it('derives multiple currency balances', async () => { prisma.ledgerEntry.groupBy.mockResolvedValue([{ currency: 'USDC', _sum: { amountMinor: 3n } }, { currency: 'NGN', _sum: { amountMinor: 4n } }]); await expect(service.balancesOf('a')).resolves.toEqual({ USDC: 3n, NGN: 4n }); });
  it('builds canonical account names', () => { expect(service.userAccount('u', 'USDC')).toBe('user:u:USDC'); expect(service.externalAccount('arc', 'USDC')).toBe('external:arc:USDC'); });
});
