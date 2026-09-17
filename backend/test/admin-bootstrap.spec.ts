import * as bcrypt from 'bcryptjs';
import { assertProductionAdminGate, bootstrapFirstAdminIfEmpty, provisionConfiguredAdmins, AdminBootstrapPrisma } from '../src/common/admin-bootstrap';

/**
 * Minimal in-memory Prisma stand-in covering exactly the User delegate calls
 * admin-bootstrap.ts makes, including unique-constraint enforcement so a
 * regression that collides on email/phone/referralCode/surexTag fails loudly.
 */
function makeFakePrisma(seed: Array<Record<string, unknown>> = []): AdminBootstrapPrisma & { users: Array<Record<string, any>> } {
  const users: Array<Record<string, any>> = seed.map((u) => ({ isActive: true, isBanned: false, role: 'USER', ...u }));
  const uniqueKeys = ['id', 'email', 'phone', 'referralCode', 'surexTag'];
  const findByWhere = (where: Record<string, unknown>) => {
    const key = uniqueKeys.find((k) => k in where);
    return key ? users.find((u) => u[key] === where[key]) || null : null;
  };
  let seq = 1;
  return {
    users,
    user: {
      count: async ({ where }: { where: Record<string, unknown> }) =>
        users.filter((u) => Object.entries(where).every(([k, v]) => u[k] === v)).length,
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const [field, value] = Object.entries(where)[0] || [];
        return users.find((u) => u[field] === value) || null;
      },
      findUnique: async ({ where }: { where: Record<string, unknown> }) => findByWhere(where),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        for (const key of uniqueKeys) {
          if (data[key] && users.some((u) => u[key] === data[key])) {
            throw new Error(`Unique constraint violation on ${key}`);
          }
        }
        const created = { id: `u${seq++}`, isActive: true, isBanned: false, role: 'USER', ...data };
        users.push(created);
        return created;
      },
      update: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const user = findByWhere(where);
        if (!user) throw new Error('Record to update not found');
        Object.assign(user, data);
        return user;
      },
    },
  };
}

const quietLogger = { log: () => undefined, warn: () => undefined };

describe('provisionConfiguredAdmins', () => {
  it('promotes an existing user to ADMIN without touching the password by default', async () => {
    const db = makeFakePrisma([{ id: 'u1', email: 'op@example.com', passwordHash: 'old' }]);
    const result = await provisionConfiguredAdmins(db, { emails: ['op@example.com'], password: 'pw', resetPassword: false, logger: quietLogger });
    expect(result.promoted).toEqual(['op@example.com']);
    expect(result.blocked).toEqual([]);
    expect(db.users[0].role).toBe('ADMIN');
    expect(db.users[0].passwordHash).toBe('old');
  });

  it('resets the password only when resetPassword=true', async () => {
    const db = makeFakePrisma([{ id: 'u1', email: 'op@example.com', passwordHash: 'old' }]);
    await provisionConfiguredAdmins(db, { emails: ['OP@example.com'], password: 's3cret', resetPassword: true, logger: quietLogger });
    expect(await bcrypt.compare('s3cret', db.users[0].passwordHash)).toBe(true);
    expect(db.users[0].email).toBe('op@example.com'); // normalised
  });

  it('throws an actionable error when the configured admin does not exist', async () => {
    const db = makeFakePrisma();
    await expect(
      provisionConfiguredAdmins(db, { emails: ['ghost@example.com'], password: 'pw', resetPassword: false, logger: quietLogger }),
    ).rejects.toThrow(/ghost@example\.com does not exist.*ADMIN_BOOTSTRAP_INITIAL/s);
  });

  it('flags banned or deactivated configured admins as blocked instead of failing silently later', async () => {
    const db = makeFakePrisma([
      { id: 'u1', email: 'banned@example.com', isBanned: true },
      { id: 'u2', email: 'inactive@example.com', isActive: false },
    ]);
    const result = await provisionConfiguredAdmins(db, {
      emails: ['banned@example.com', 'inactive@example.com'],
      password: 'pw',
      resetPassword: false,
      logger: quietLogger,
    });
    expect(result.promoted).toEqual([]);
    expect(result.blocked).toEqual([
      { email: 'banned@example.com', isActive: true, isBanned: true },
      { email: 'inactive@example.com', isActive: false, isBanned: false },
    ]);
    expect(db.users[0].role).toBe('ADMIN');
  });
});

describe('bootstrapFirstAdminIfEmpty', () => {
  const opts = { emails: ['owner@example.com'], password: 'Operator!234', logger: quietLogger };

  it('does nothing when not enabled', async () => {
    const db = makeFakePrisma();
    expect(await bootstrapFirstAdminIfEmpty(db, { ...opts, enabled: false })).toBe(false);
    expect(db.users).toHaveLength(0);
  });

  it('does nothing when ADMIN_EMAIL/ADMIN_PASSWORD are missing', async () => {
    const db = makeFakePrisma();
    expect(await bootstrapFirstAdminIfEmpty(db, { enabled: true, emails: [], password: 'x', logger: quietLogger })).toBe(false);
    expect(await bootstrapFirstAdminIfEmpty(db, { enabled: true, emails: ['a@b.co'], password: '', logger: quietLogger })).toBe(false);
    expect(db.users).toHaveLength(0);
  });

  it('creates the first active, unbanned ADMIN on an empty database', async () => {
    const db = makeFakePrisma();
    expect(await bootstrapFirstAdminIfEmpty(db, { ...opts, enabled: true })).toBe(true);
    const admin = db.users[0];
    expect(admin.email).toBe('owner@example.com');
    expect(admin.role).toBe('ADMIN');
    expect(admin.isActive).toBe(true);
    expect(admin.isBanned).toBe(false);
    expect(await bcrypt.compare('Operator!234', admin.passwordHash)).toBe(true);
    expect(String(admin.phone)).toMatch(/^admin-\d{8}$/);
    expect(admin.referralCode).toBeTruthy();
    expect(admin.surexTag).toBeTruthy();
    expect(admin.wallet).toEqual({ create: {} });
  });

  it('never creates an admin when the database already has users', async () => {
    const db = makeFakePrisma([{ id: 'u1', email: 'someone@example.com' }]);
    const warnings: string[] = [];
    expect(
      await bootstrapFirstAdminIfEmpty(db, { ...opts, enabled: true, logger: { log: () => undefined, warn: (m) => warnings.push(m) } }),
    ).toBe(false);
    expect(db.users).toHaveLength(1);
    expect(db.users[0].role).toBe('USER');
    expect(warnings.join('\n')).toMatch(/already has 1 user/i);
  });
});

describe('assertProductionAdminGate', () => {
  it('passes when at least one active, unbanned ADMIN exists', async () => {
    const db = makeFakePrisma([{ id: 'u1', email: 'a@b.co', role: 'ADMIN' }]);
    await expect(assertProductionAdminGate(db)).resolves.toBeUndefined();
  });

  it('names the banned/inactive state and refuses', async () => {
    const db = makeFakePrisma([{ id: 'u1', email: 'a@b.co', role: 'ADMIN', isBanned: true }]);
    await expect(assertProductionAdminGate(db)).rejects.toThrow(/no active, unbanned administrator.*deactivated or banned/s);
  });

  it('points at admin:provision when users exist but none is an ADMIN', async () => {
    const db = makeFakePrisma([{ id: 'u1', email: 'a@b.co' }]);
    await expect(assertProductionAdminGate(db)).rejects.toThrow(/admin:provision/s);
  });

  it('prescribes the one-deploy bootstrap triple on an empty database', async () => {
    const db = makeFakePrisma();
    await expect(assertProductionAdminGate(db)).rejects.toThrow(/fresh cutover/);
    await expect(assertProductionAdminGate(db)).rejects.toThrow(/ADMIN_BOOTSTRAP_INITIAL=true/);
    await expect(assertProductionAdminGate(db)).rejects.toThrow(/Refusing to start: no active, unbanned administrator is provisioned\./);
  });
});
