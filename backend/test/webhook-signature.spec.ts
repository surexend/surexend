import { safeCompare } from '../src/common/webhooks/webhook-signature';

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
