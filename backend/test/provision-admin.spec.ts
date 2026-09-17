const { isValidEmail, redactConnectionString, parseArgs } = require('../scripts/provision-admin');

describe('provision-admin helpers', () => {
  it('accepts ordinary emails and rejects malformed ones', () => {
    expect(isValidEmail('operator@example.com')).toBe(true);
    expect(isValidEmail('  operator@example.com  ')).toBe(true);
    expect(isValidEmail('no-at-sign')).toBe(false);
    expect(isValidEmail('a@b@c.com')).toBe(false);
    expect(isValidEmail('spaces @example.com')).toBe(false);
    expect(isValidEmail('missing-tld@host')).toBe(false);
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail(undefined)).toBe(false);
  });

  it('redacts credentials from the connection string', () => {
    const redacted = redactConnectionString('postgresql://user:s3cret@db.example.com:5432/postgres?sslmode=require');
    expect(redacted).toBe('postgresql://db.example.com:5432/postgres');
    expect(redacted).not.toContain('s3cret');
    expect(redactConnectionString('')).toBe('<unset>');
    expect(redactConnectionString('not a url :::')).toBe('<unparseable>');
  });

  it('parses args and falls back to ADMIN_EMAIL', () => {
    expect(parseArgs(['a@b.co'])).toMatchObject({ email: 'a@b.co', list: false, dryRun: false });
    expect(parseArgs(['a@b.co', '--dry-run'])).toMatchObject({ dryRun: true });
    expect(parseArgs(['--list'])).toMatchObject({ list: true, email: null });
    expect(parseArgs(['--help'])).toMatchObject({ help: true });
    expect(() => parseArgs(['--bogus'])).toThrow('Unknown flag');
    expect(() => parseArgs(['a@b.co', 'c@d.co'])).toThrow('Unexpected argument');
    process.env.ADMIN_EMAIL = 'env@example.com';
    try {
      expect(parseArgs([]).email).toBe('env@example.com');
    } finally {
      delete process.env.ADMIN_EMAIL;
    }
  });
});
