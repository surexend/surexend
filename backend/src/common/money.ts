const ZERO_DECIMAL_CURRENCIES = new Set(['XAF', 'XOF', 'GNF', 'KMF', 'RWF', 'UGX', 'TZS', 'SLL', 'SOS']);
const SIX_DECIMAL_CURRENCIES = new Set(['USDC', 'USDT']);

export function decimalsFor(currency: string): number {
  const c = currency.toUpperCase();
  return SIX_DECIMAL_CURRENCIES.has(c) ? 6 : ZERO_DECIMAL_CURRENCIES.has(c) ? 0 : 2;
}

export function guardMinor(value: bigint | number | string): bigint {
  let result: bigint;
  try { result = typeof value === 'bigint' ? value : BigInt(value); } catch { throw new TypeError('Minor amount must be an integer'); }
  if (typeof value === 'number' && (!Number.isSafeInteger(value) || !Number.isFinite(value))) throw new TypeError('Minor amount must be a safe integer');
  if (typeof value === 'string' && !/^-?\d+$/.test(value)) throw new TypeError('Minor amount must be an integer');
  return result;
}
export const isMinorUnits = (value: unknown): value is bigint | number => {
  try { guardMinor(value as any); return typeof value === 'bigint' || (typeof value === 'number' && Number.isSafeInteger(value)); } catch { return false; }
};
export function roundTo(amount: number, currency: string): number {
  if (!Number.isFinite(amount)) throw new TypeError('Amount must be finite');
  const factor = 10 ** decimalsFor(currency);
  return Number((amount * factor).toPrecision(15)) / factor;
}
export function toMinor(amount: number, currency: string): bigint { return guardMinor(Math.round(roundTo(amount, currency) * 10 ** decimalsFor(currency))); }
export function fromMinor(amount: bigint | number | string, currency: string): number { return Number(guardMinor(amount)) / 10 ** decimalsFor(currency); }
export function addMinor(a: bigint | number, b: bigint | number): bigint { return guardMinor(a) + guardMinor(b); }
export function subtractMinor(a: bigint | number, b: bigint | number): bigint { return guardMinor(a) - guardMinor(b); }
export function sumMinor(values: (bigint | number)[]): bigint { return values.reduce((s, v) => s + guardMinor(v), 0n); }
export function allocateMinor(amount: bigint | number, ratios: number[]): bigint[] {
  const total = guardMinor(amount); if (!ratios.length || ratios.some(r => !Number.isFinite(r) || r < 0)) throw new TypeError('Invalid allocation ratios');
  const denominator = ratios.reduce((a, b) => a + b, 0); if (!denominator) throw new TypeError('Allocation ratios must not be zero');
  let allocated = 0n; const result = ratios.map((r, i) => i === ratios.length - 1 ? total - allocated : (total * BigInt(Math.floor(r * 1e12 / denominator))) / 1000000000000n);
  result.forEach(v => allocated += v); return result;
}
