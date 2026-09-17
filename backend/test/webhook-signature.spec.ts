import * as crypto from 'crypto';
import { safeCompare, verifyHmacSha256, verifyPaymentPointSignature } from '../src/common/webhooks/webhook-signature';

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

describe('verifyPaymentPointSignature', () => {
  const body = Buffer.from('{"status":"successful","transaction_id":"pp-1"}');
  const secret = 'paymentpoint-webhook-secret';

  it('stays closed when no provider contract mode is selected', () => {
    expect(verifyPaymentPointSignature(body, secret, secret, undefined)).toBe(false);
    expect(verifyPaymentPointSignature(body, secret, secret, 'disabled')).toBe(false);
  });

  it('supports only the explicitly selected raw-body HMAC encoding', () => {
    const base64 = crypto.createHmac('sha256', secret).update(body).digest('base64');
    const hex = crypto.createHmac('sha256', secret).update(body).digest('hex');
    expect(verifyPaymentPointSignature(body, base64, secret, 'hmac-sha256-raw-base64')).toBe(true);
    expect(verifyPaymentPointSignature(body, hex, secret, 'hmac-sha256-raw-hex')).toBe(true);
    expect(verifyPaymentPointSignature(body, base64, secret, 'hmac-sha256-raw-hex')).toBe(false);
  });

  it('supports the legacy static mode only when explicitly selected', () => {
    expect(verifyPaymentPointSignature(body, secret, secret, 'static-secret-legacy')).toBe(true);
  });
});
