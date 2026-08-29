import { IdempotencyService } from '../src/common/idempotency/idempotency.service';

type Row = {
  id: string;
  userId: string;
  scope: string;
  key: string;
  response: unknown;
  createdAt: Date;
};

/**
 * Minimal in-memory stand-in for the IdempotencyRecord table. It reproduces the
 * behaviour the service depends on: lookup by (userId, scope, key) and a
 * P2002 error when the unique constraint is violated by a concurrent insert.
 */
function fakePrisma() {
  const rows = new Map<string, Row>();
  const id = (userId: string, scope: string, key: string) => `${userId}|${scope}|${key}`;

  return {
    rows,
    // Flip to simulate a competing request that commits first.
    raceOnCreate: false,
    idempotencyRecord: {
      findUnique: jest.fn(async ({ where }: any) => {
        const { userId, scope, key } = where.userId_scope_key;
        return rows.get(id(userId, scope, key)) || null;
      }),
      create: jest.fn(async ({ data }: any) => {
        const pk = id(data.userId, data.scope, data.key);
        if (rows.has(pk) || (fake as any).raceOnCreate) {
          const err: any = new Error('Unique constraint failed');
          err.code = 'P2002';
          throw err;
        }
        const row: Row = { id: `row-${rows.size + 1}`, createdAt: new Date(), ...data };
        rows.set(pk, row);
        return row;
      }),
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
  };
}

const fake: any = fakePrisma();

describe('IdempotencyService', () => {
  let service: IdempotencyService;

  beforeEach(() => {
    fake.rows.clear();
    fake.raceOnCreate = false;
    fake.idempotencyRecord.findUnique.mockClear();
    fake.idempotencyRecord.create.mockClear();
    service = new IdempotencyService(fake as any);
  });

  it('executes once and stores the response', async () => {
    const fn = jest.fn(async () => ({ reference: 'TX-1' }));

    const first = await service.run({ userId: 'u1', scope: 'wallets.send', key: 'k1' }, fn);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(first).toEqual({ result: { reference: 'TX-1' }, replayed: false });
    expect(fake.idempotencyRecord.create).toHaveBeenCalledTimes(1);
  });

  it('replays the stored response instead of executing twice', async () => {
    const fn = jest.fn(async () => ({ reference: 'TX-1' }));

    await service.run({ userId: 'u1', scope: 'wallets.send', key: 'k1' }, fn);
    const retry = await service.run({ userId: 'u1', scope: 'wallets.send', key: 'k1' }, fn);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(retry).toEqual({ result: { reference: 'TX-1' }, replayed: true });
  });

  it('scopes keys per operation, so the same key is independent across scopes', async () => {
    const fn = jest.fn(async () => ({ ok: true }));

    await service.run({ userId: 'u1', scope: 'wallets.send', key: 'k1' }, fn);
    await service.run({ userId: 'u1', scope: 'bills.purchase', key: 'k1' }, fn);

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('scopes keys per user, so one user cannot replay another', async () => {
    const fn = jest.fn(async () => ({ ok: true }));

    await service.run({ userId: 'u1', scope: 'wallets.send', key: 'shared' }, fn);
    const other = await service.run({ userId: 'u2', scope: 'wallets.send', key: 'shared' }, fn);

    expect(fn).toHaveBeenCalledTimes(2);
    expect(other.replayed).toBe(false);
  });

  it('returns the winning response when a concurrent request commits first', async () => {
    const fn = jest.fn(async () => ({ reference: 'from-this-call' }));

    // First pass stores the record and returns it.
    await service.run({ userId: 'u1', scope: 'wallets.send', key: 'k1' }, async () => ({
      reference: 'winner',
    }));

    // Now make finds miss and creates collide, as they would mid-race.
    fake.idempotencyRecord.findUnique
      .mockImplementationOnce(async () => null)
      .mockImplementationOnce(async () => ({ response: { reference: 'winner' } }));
    fake.raceOnCreate = true;

    const result = await service.run({ userId: 'u1', scope: 'wallets.send', key: 'k1' }, fn);

    expect(result).toEqual({ result: { reference: 'winner' }, replayed: true });
  });

  it('still executes when the client sends no key', async () => {
    const fn = jest.fn(async () => ({ ok: true }));

    const result = await service.run({ userId: 'u1', scope: 'wallets.send' }, fn);

    expect(result).toEqual({ result: { ok: true }, replayed: false });
    expect(fake.idempotencyRecord.create).not.toHaveBeenCalled();
  });

  it('ignores oversized keys rather than failing the request', async () => {
    const fn = jest.fn(async () => ({ ok: true }));

    const result = await service.run(
      { userId: 'u1', scope: 'wallets.send', key: 'x'.repeat(500) },
      fn,
    );

    expect(result.replayed).toBe(false);
    expect(fake.idempotencyRecord.create).not.toHaveBeenCalled();
  });
});
