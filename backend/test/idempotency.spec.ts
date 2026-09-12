import { IdempotencyService } from '../src/common/idempotency/idempotency.service';

type Row = {
  id: string;
  userId: string;
  scope: string;
  key: string;
  requestHash?: string | null;
  status: string;
  response?: unknown;
  error?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function fakePrisma() {
  const rows = new Map<string, Row>();
  const keyOf = (userId: string, scope: string, key: string) => `${userId}|${scope}|${key}`;
  const fake: any = {
    rows,
    idempotencyRecord: {
      findUnique: jest.fn(async ({ where }: any) => {
        const { userId, scope, key } = where.userId_scope_key;
        return rows.get(keyOf(userId, scope, key)) || null;
      }),
      create: jest.fn(async ({ data }: any) => {
        const pk = keyOf(data.userId, data.scope, data.key);
        if (rows.has(pk)) {
          const err: any = new Error('Unique constraint failed');
          err.code = 'P2002';
          throw err;
        }
        const now = new Date();
        const row: Row = { id: `row-${rows.size + 1}`, createdAt: now, updatedAt: now, ...data };
        rows.set(pk, row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const { userId, scope, key } = where.userId_scope_key;
        const row = rows.get(keyOf(userId, scope, key));
        if (!row) throw new Error('Not found');
        Object.assign(row, data, { updatedAt: new Date() });
        return row;
      }),
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
  };
  return fake;
}

describe('IdempotencyService', () => {
  let fake: any;
  let service: IdempotencyService;

  beforeEach(() => {
    fake = fakePrisma();
    service = new IdempotencyService(fake as any);
  });

  it('claims before executing and replays the completed response', async () => {
    const fn = jest.fn(async () => ({ reference: 'TX-1' }));

    const first = await service.run({ userId: 'u1', scope: 'wallets.send', key: 'k1', fingerprint: 'same' }, fn);
    const retry = await service.run({ userId: 'u1', scope: 'wallets.send', key: 'k1', fingerprint: 'same' }, fn);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(first).toEqual({ result: { reference: 'TX-1' }, replayed: false });
    expect(retry).toEqual({ result: { reference: 'TX-1' }, replayed: true });
    expect(fake.rows.get('u1|wallets.send|k1')?.status).toBe('COMPLETED');
  });

  it('rejects reusing a key for different parameters', async () => {
    await service.run({ userId: 'u1', scope: 'wallets.send', key: 'k1', fingerprint: 'first' }, async () => ({ ok: true }));

    await expect(
      service.run({ userId: 'u1', scope: 'wallets.send', key: 'k1', fingerprint: 'different' }, async () => ({ ok: false })),
    ).rejects.toThrow(/different operation parameters/);
  });

  it('does not execute a concurrent loser while the winner is processing', async () => {
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    let calls = 0;
    const first = service.run({ userId: 'u1', scope: 'wallets.send', key: 'race', fingerprint: 'same' }, async () => {
      calls += 1;
      await blocked;
      return { reference: 'winner' };
    });

    // Let the first request claim the row before starting the race.
    await new Promise((resolve) => setImmediate(resolve));
    const second = service.run({ userId: 'u1', scope: 'wallets.send', key: 'race', fingerprint: 'same' }, async () => {
      calls += 1;
      return { reference: 'loser' };
    });

    release();
    await expect(first).resolves.toEqual({ result: { reference: 'winner' }, replayed: false });
    await expect(second).resolves.toEqual({ result: { reference: 'winner' }, replayed: true });
    expect(calls).toBe(1);
  });

  it('requires a usable key', async () => {
    await expect(service.run({ userId: 'u1', scope: 'wallets.send' }, async () => ({ ok: true }))).rejects.toThrow(/Idempotency-Key is required/);
    await expect(service.run({ userId: 'u1', scope: 'wallets.send', key: 'x'.repeat(129) }, async () => ({ ok: true }))).rejects.toThrow(/Idempotency-Key is required/);
  });

  it('scopes keys by user and operation', async () => {
    const fn = jest.fn(async () => ({ ok: true }));
    await service.run({ userId: 'u1', scope: 'wallets.send', key: 'shared', fingerprint: 'a' }, fn);
    await service.run({ userId: 'u1', scope: 'bills.purchase', key: 'shared', fingerprint: 'a' }, fn);
    await service.run({ userId: 'u2', scope: 'wallets.send', key: 'shared', fingerprint: 'a' }, fn);
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
