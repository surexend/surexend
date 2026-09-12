import * as crypto from 'crypto';
import { safeCompare, verifyHmacSha256 } from '../src/common/webhooks/webhook-signature';

describe('safeCompare', () => {
  it('accepts an exact match', () => {
    expect(safeCompare('verif-hash-abc', 'verif-hash-abc')).toBe(true);
  });

  it('rejects a different value', () => {
    expect(safeCompare('verif-hash-abc', 'verif-hash-abd')).toBe(false);
  });

  it('rejects a value of a different length', () => {
    expect(safeCompare('short', 'a-much-longer-secret')).toBe(false);
  });

  // The old Flutterwave check compared `hash !== secretHash`, which passed when
  // the secret was not configured and the header was absent. Both were
  // undefined, so the comparison was false and the request was accepted.
  it('never matches when either side is missing', () => {
    expect(safeCompare(undefined, undefined)).toBe(false);
    expect(safeCompare(undefined, 'secret')).toBe(false);
    expect(safeCompare('secret', undefined)).toBe(false);
    expect(safeCompare('', 'secret')).toBe(false);
  });
});

describe('verifyHmacSha256', () => {
  it('verifies Flutterwave raw-body HMAC signatures', () => {
    const body = Buffer.from('{"event":"charge.completed"}');
    const secret = 'test-secret';
    const signature = crypto.createHmac('sha256', secret).update(body).digest('base64');
    expect(verifyHmacSha256(body, signature, secret)).toBe(true);
    expect(verifyHmacSha256(Buffer.from('{"event":"tampered"}'), signature, secret)).toBe(false);
  });

  it('rejects a missing body, signature, or secret', () => {
    expect(verifyHmacSha256(undefined, 'sig', 'secret')).toBe(false);
    expect(verifyHmacSha256(Buffer.from('body'), undefined, 'secret')).toBe(false);
    expect(verifyHmacSha256(Buffer.from('body'), 'sig', undefined)).toBe(false);
  });
});
