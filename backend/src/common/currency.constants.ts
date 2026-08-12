// Supported African local currencies and their static USD rates.
// These are used as a reliable fallback so conversions work without any
// external integration. Live providers (YellowCard) can override at runtime,
// but the app is fully functional with just this table.
export const SUPPORTED_LOCAL_CURRENCIES = [
  { code: 'NGN', name: 'Nigerian Naira', symbol: '\u20A6', flag: '\u{1F1F3}\u{1F1EC}', rate: 1500 },
  { code: 'GHS', name: 'Ghanaian Cedi', symbol: 'GH\u20B5', flag: '\u{1F1EC}\u{1F1ED}', rate: 15.8 },
  { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh', flag: '\u{1F1F0}\u{1F1EA}', rate: 129.5 },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R', flag: '\u{1F1FF}\u{1F1E6}', rate: 18.2 },
  { code: 'UGX', name: 'Ugandan Shilling', symbol: 'USh', flag: '\u{1F1FA}\u{1F1EC}', rate: 3680 },
  { code: 'TZS', name: 'Tanzanian Shilling', symbol: 'TSh', flag: '\u{1F1F9}\u{1F1FF}', rate: 2650 },
  { code: 'XAF', name: 'Central African CFA', symbol: 'FCFA', flag: '\u{1F1E8}\u{1F1F2}', rate: 610 },
  { code: 'XOF', name: 'West African CFA', symbol: 'CFA', flag: '\u{1F1F8}\u{1F1EB}', rate: 605 },
] as const;

export type LocalCurrencyCode = (typeof SUPPORTED_LOCAL_CURRENCIES)[number]['code'];

export const LOCAL_CURRENCY_RATES: Record<string, number> = Object.fromEntries(
  SUPPORTED_LOCAL_CURRENCIES.map((c) => [c.code, c.rate])
);

export const LOCAL_CURRENCY_NAMES: Record<string, string> = Object.fromEntries(
  SUPPORTED_LOCAL_CURRENCIES.map((c) => [c.code, c.name])
);

export const LOCAL_CURRENCY_SYMBOLS: Record<string, string> = Object.fromEntries(
  SUPPORTED_LOCAL_CURRENCIES.map((c) => [c.code, c.symbol])
);

export function getLocalRate(currency: string): number {
  return LOCAL_CURRENCY_RATES[currency.toUpperCase()] || 1500;
}
