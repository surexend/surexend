import { addMinor, allocateMinor, decimalsFor, fromMinor, isMinorUnits, roundTo, subtractMinor, sumMinor, toMinor } from '../src/common/money';

describe('money primitives', () => {
  it('uses currency precision rules', () => { expect(decimalsFor('USDC')).toBe(6); expect(decimalsFor('NGN')).toBe(2); expect(decimalsFor('XAF')).toBe(0); });
  it('rounds the 1.005 trap correctly', () => expect(toMinor(1.005, 'USD')).toBe(101n));
  it('keeps decimal addition exact in minor units', () => expect(addMinor(toMinor(.1, 'USD'), toMinor(.2, 'USD'))).toBe(30n));
  it('converts to and from minor units', () => expect(fromMinor(toMinor(12.345678, 'USDC'), 'USDC')).toBe(12.345678));
  it('supports zero-decimal currencies', () => expect(toMinor(12.7, 'XOF')).toBe(13n));
  it('adds values', () => expect(addMinor(2n, 3n)).toBe(5n));
  it('subtracts values', () => expect(subtractMinor(2n, 3n)).toBe(-1n));
  it('sums values', () => expect(sumMinor([1n, 2n, 3n])).toBe(6n));
  it('allocates with remainder preserved', () => expect(sumMinor(allocateMinor(10n, [1, 1, 1]))).toBe(10n));
  it('accepts safe integer minor numbers', () => expect(isMinorUnits(10)).toBe(true));
  it('rejects fractional minor numbers', () => expect(isMinorUnits(1.5)).toBe(false));
  it('rejects unsafe minor numbers', () => expect(() => toMinor(Number.MAX_SAFE_INTEGER, 'USD')).toThrow());
  it('rejects invalid allocations', () => expect(() => allocateMinor(1n, [])).toThrow());
});
