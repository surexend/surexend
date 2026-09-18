import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

/**
 * Controlled administrator provisioning for production boot.
 *
 * The production gate in main.ts refuses to boot unless at least one active,
 * unbanned ADMIN exists. That is fail-closed on purpose, but it creates an
 * ordering problem on a freshly cutover database: operators cannot register an
 * admin account through the app because the app never starts listening, and
 * every promotion path (ADMIN_EMAIL here, scripts/provision-admin.js in the
 * shell) requires an account that already exists. PR #21's cutover checklist
 * ("register both accounts in Production, then admin:provision") was therefore
 * unexecutable and production crash-looped.
 *
 * Resolution, preserving the fail-closed posture:
 *  1. provisionConfiguredAdmins — unchanged behaviour: promote EXISTING
 *     accounts named by ADMIN_EMAIL/ADMIN_EMAILS (never create), optionally
 *     resetting the password with ADMIN_RESET_PASSWORD=true.
 *  2. bootstrapFirstAdminIfEmpty — the one controlled exception: when the
 *     database has ZERO users, ADMIN_EMAIL + ADMIN_PASSWORD plus the explicit
 *     ADMIN_BOOTSTRAP_INITIAL=true confirmation creates the first operator
 *     account. It can never fire on a database that already has users, so it
 *     cannot be used to inject an admin into a running deployment.
 *  3. assertProductionAdminGate — the existing count gate, now with a failure
 *     message that tells the operator exactly which state they are in and how
 *     to leave it (a bare "no active, unbanned administrator" crash message
 *     stranded the on-call during the outage).
 */

export interface AdminBootstrapUserDelegate {
  count(args: { where: Record<string, unknown> }): Promise<number>;
  findFirst(args: { where: Record<string, unknown> }): Promise<Record<string, unknown> | null>;
  findUnique(args: { where: Record<string, unknown> }): Promise<Record<string, unknown> | null>;
  create(args: { data: Record<string, unknown>; include?: Record<string, unknown> }): Promise<Record<string, unknown>>;
  update(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<Record<string, unknown>>;
}

export interface AdminBootstrapPrisma {
  user: AdminBootstrapUserDelegate;
}

export interface ProvisionLogger {
  log(message: string): void;
  warn(message: string): void;
}

export interface ProvisionConfiguredAdminsResult {
  promoted: string[];
  /** Configured admins that exist but cannot satisfy the gate as-is. */
  blocked: Array<{ email: string; isActive: boolean; isBanned: boolean }>;
}

/**
 * Promote already-registered accounts to ADMIN. Never creates users and never
 * reactivates banned/deactivated ones — those are surfaced as `blocked` so the
 * caller can warn loudly instead of silently boot-failing afterwards.
 */
export async function provisionConfiguredAdmins(
  prisma: AdminBootstrapPrisma,
  options: { emails: string[]; password: string; resetPassword: boolean; logger?: ProvisionLogger },
): Promise<ProvisionConfiguredAdminsResult> {
  const logger = options.logger || console;
  const adminHash = await bcrypt.hash(options.password, 12);
  const promoted: string[] = [];
  const blocked: ProvisionConfiguredAdminsResult['blocked'] = [];

  for (const email of Array.from(new Set(options.emails.map((e) => e.trim().toLowerCase()).filter(Boolean)))) {
    const existing = await prisma.user.findUnique({
      where: { email },
    });
    if (!existing) {
      throw new Error(
        `Refusing to start: configured admin ${email} does not exist. ` +
          'Register the account in the app first, or — on an empty production database — ' +
          'set ADMIN_EMAIL + ADMIN_PASSWORD + ADMIN_BOOTSTRAP_INITIAL=true for exactly one deploy to create the first operator account. ' +
          'The app will not bootstrap accounts without that explicit confirmation.',
      );
    }
    const data: Record<string, unknown> = { role: 'ADMIN' };
    if (options.resetPassword) data.passwordHash = adminHash;
    await prisma.user.update({ where: { id: existing.id as string }, data });

    const isActive = existing.isActive !== false;
    const isBanned = existing.isBanned === true;
    if (!isActive || isBanned) {
      blocked.push({ email, isActive, isBanned });
    } else {
      promoted.push(email);
    }
  }
  return { promoted, blocked };
}

/**
 * First-boot bootstrap for a freshly wiped/cutover production database. Fires
 * ONLY when the User table has zero rows AND the operator set all three of
 * ADMIN_EMAIL, ADMIN_PASSWORD and ADMIN_BOOTSTRAP_INITIAL=true. Returns true
 * when it created the account (the caller logs it as a one-time event).
 */
export async function bootstrapFirstAdminIfEmpty(
  prisma: AdminBootstrapPrisma,
  options: { enabled: boolean; emails: string[]; password?: string; logger?: ProvisionLogger },
): Promise<boolean> {
  const logger = options.logger || console;
  if (!options.enabled) return false;
  const email = (options.emails[0] || '').trim().toLowerCase();
  const password = (options.password || '').trim();
  if (!email || !password) {
    logger.warn(
      '[admin-bootstrap] ADMIN_BOOTSTRAP_INITIAL=true is set but ADMIN_EMAIL/ADMIN_PASSWORD are missing; nothing to create.',
    );
    return false;
  }

  const totalUsers = await prisma.user.count({ where: {} });
  if (totalUsers > 0) {
    // Never inject an admin into a database that already has accounts. The
    // configured account is handled by provisionConfiguredAdmins instead.
    logger.warn(
      `[admin-bootstrap] ADMIN_BOOTSTRAP_INITIAL=true ignored: the database already has ${totalUsers} user(s). ` +
        'Existing accounts are promoted via ADMIN_EMAIL/ADMIN_PASSWORD, not created.',
    );
    return false;
  }

  // Mirror normal registration (see AuthService.register / the Google flow):
  // unique placeholder phone "editable in admin console", random referral code,
  // derived SureX tag, and an empty wallet. Unlike a normal user this account
  // starts as an active, unbanned ADMIN with the operator-chosen password.
  let referralCode = crypto.randomBytes(4).toString('hex').toUpperCase();
  while (await prisma.user.findUnique({ where: { referralCode } })) {
    referralCode = crypto.randomBytes(4).toString('hex').toUpperCase();
  }
  let surexTag = 'platform.admin';
  if (await prisma.user.findUnique({ where: { surexTag } })) {
    surexTag = `platform.admin${crypto.randomInt(1000, 10000)}`;
  }
  await prisma.user.create({
    data: {
      email,
      phone: `admin-${crypto.randomInt(10000000, 100000000)}`, // placeholder; editable in admin console
      passwordHash: await bcrypt.hash(password, 12),
      firstName: 'Platform',
      lastName: 'Admin',
      surexTag,
      referralCode,
      role: 'ADMIN',
      isActive: true,
      isBanned: false,
      wallet: { create: {} },
    },
  });
  logger.log(
    `[admin-bootstrap] Created the first administrator account (${email}) on an empty database. ` +
      'This runs only while the User table is empty and ADMIN_BOOTSTRAP_INITIAL=true. ' +
      'Log in, then REMOVE ADMIN_EMAIL, ADMIN_PASSWORD and ADMIN_BOOTSTRAP_INITIAL from the environment.',
  );
  return true;
}

/**
 * The production gate. Same rule as before — at least one active, unbanned
 * ADMIN — but the failure now diagnoses the exact database state and names the
 * supported way out of each one.
 */
export async function assertProductionAdminGate(prisma: AdminBootstrapPrisma): Promise<void> {
  const activeCount = await prisma.user.count({ where: { role: 'ADMIN', isActive: true, isBanned: false } });
  if (activeCount >= 1) return;

  const totalAdmins = await prisma.user.count({ where: { role: 'ADMIN' } });
  const totalUsers = await prisma.user.count({ where: {} });
  const context = `ADMIN rows: ${totalAdmins}; active & unbanned: ${activeCount}; total users: ${totalUsers}.`;

  if (totalAdmins > 0) {
    throw new Error(
      'Refusing to start: no active, unbanned administrator is provisioned. ' +
        `${context} Administrator account(s) exist but every one is deactivated or banned. ` +
        'The app never reactivates accounts automatically: restore one deliberately in the database ' +
        '(users.isActive = true, users.is_banned = false), or provision a different admin per the cutover checklist.',
    );
  }
  if (totalUsers > 0) {
    throw new Error(
      'Refusing to start: no active, unbanned administrator is provisioned. ' +
        `${context} The database has registered users but none is an ADMIN yet. ` +
        'Fix without a redeploy: in the Production shell run `npm run admin:provision -- <registered-email>`. ' +
        'Or set ADMIN_EMAIL + ADMIN_PASSWORD (optionally ADMIN_RESET_PASSWORD=true) and redeploy — ' +
        'the configured account must already exist; see checklist item J.',
    );
  }
  throw new Error(
    'Refusing to start: no active, unbanned administrator is provisioned. ' +
      `${context} The production database has no users at all (fresh cutover), so nobody can register ` +
      'because this gate blocks boot. For exactly one deploy set ADMIN_EMAIL + ADMIN_PASSWORD + ADMIN_BOOTSTRAP_INITIAL=true: ' +
      'the first boot creates that operator account, then log in and remove all three variables. ' +
      'See checklist item J.',
  );
}
