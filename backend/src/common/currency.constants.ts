// Supported African local currencies and their static USD rates.
// Covers every African country. These are used as a reliable fallback so
// conversions work without any external integration. Live providers
// (YellowCard) can override at runtime, but the app is fully functional with
// just this table.
//
// `country` is the full country name (used for search), `countryCode` is the
// ISO 3166 alpha-2 code (used to render a cross-platform flag badge, since
// flag emoji do not render on Windows).
export const SUPPORTED_LOCAL_CURRENCIES = [
  { code: 'NGN', name: 'Nigerian Naira', symbol: '\u20A6', country: 'Nigeria', countryCode: 'NG', flag: '\u{1F1F3}\u{1F1EC}', rate: 1500 },
  { code: 'GHS', name: 'Ghanaian Cedi', symbol: 'GH\u20B5', country: 'Ghana', countryCode: 'GH', flag: '\u{1F1EC}\u{1F1ED}', rate: 15.8 },
  { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh', country: 'Kenya', countryCode: 'KE', flag: '\u{1F1F0}\u{1F1EA}', rate: 129.5 },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R', country: 'South Africa', countryCode: 'ZA', flag: '\u{1F1FF}\u{1F1E6}', rate: 18.2 },
  { code: 'UGX', name: 'Ugandan Shilling', symbol: 'USh', country: 'Uganda', countryCode: 'UG', flag: '\u{1F1FA}\u{1F1EC}', rate: 3680 },
  { code: 'TZS', name: 'Tanzanian Shilling', symbol: 'TSh', country: 'Tanzania', countryCode: 'TZ', flag: '\u{1F1F9}\u{1F1FF}', rate: 2650 },
  { code: 'EGP', name: 'Egyptian Pound', symbol: 'E\u00A3', country: 'Egypt', countryCode: 'EG', flag: '\u{1F1EA}\u{1F1EC}', rate: 48.2 },
  { code: 'MAD', name: 'Moroccan Dirham', symbol: 'DH', country: 'Morocco', countryCode: 'MA', flag: '\u{1F1F2}\u{1F1E6}', rate: 10.1 },
  { code: 'ETB', name: 'Ethiopian Birr', symbol: 'Br', country: 'Ethiopia', countryCode: 'ET', flag: '\u{1F1EA}\u{1F1F9}', rate: 57.2 },
  { code: 'RWF', name: 'Rwandan Franc', symbol: 'FRw', country: 'Rwanda', countryCode: 'RW', flag: '\u{1F1F7}\u{1F1FC}', rate: 1320 },
  { code: 'ZMW', name: 'Zambian Kwacha', symbol: 'K', country: 'Zambia', countryCode: 'ZM', flag: '\u{1F1FF}\u{1F1F2}', rate: 26.4 },
  { code: 'MZN', name: 'Mozambican Metical', symbol: 'MT', country: 'Mozambique', countryCode: 'MZ', flag: '\u{1F1F2}\u{1F1FF}', rate: 64.2 },
  { code: 'BWP', name: 'Botswana Pula', symbol: 'P', country: 'Botswana', countryCode: 'BW', flag: '\u{1F1E7}\u{1F1FC}', rate: 13.7 },
  { code: 'AOA', name: 'Angolan Kwanza', symbol: 'Kz', country: 'Angola', countryCode: 'AO', flag: '\u{1F1E6}\u{1F1F4}', rate: 830 },
  { code: 'CDF', name: 'Congolese Franc', symbol: 'FC', country: 'DR Congo', countryCode: 'CD', flag: '\u{1F1E8}\u{1F1E9}', rate: 2850 },
  { code: 'TND', name: 'Tunisian Dinar', symbol: 'DT', country: 'Tunisia', countryCode: 'TN', flag: '\u{1F1F9}\u{1F1F3}', rate: 3.1 },
  { code: 'DZD', name: 'Algerian Dinar', symbol: 'DA', country: 'Algeria', countryCode: 'DZ', flag: '\u{1F1E9}\u{1F1FF}', rate: 134.5 },
  { code: 'LYD', name: 'Libyan Dinar', symbol: 'LD', country: 'Libya', countryCode: 'LY', flag: '\u{1F1F1}\u{1F1FE}', rate: 4.85 },
  { code: 'SDG', name: 'Sudanese Pound', symbol: 'SD', country: 'Sudan', countryCode: 'SD', flag: '\u{1F1F8}\u{1F1E9}', rate: 600 },
  { code: 'SSP', name: 'South Sudanese Pound', symbol: 'SS', country: 'South Sudan', countryCode: 'SS', flag: '\u{1F1F8}\u{1F1F8}', rate: 1300 },
  { code: 'SOS', name: 'Somali Shilling', symbol: 'Sh', country: 'Somalia', countryCode: 'SO', flag: '\u{1F1F8}\u{1F1F4}', rate: 57000 },
  { code: 'DJF', name: 'Djiboutian Franc', symbol: 'Fdj', country: 'Djibouti', countryCode: 'DJ', flag: '\u{1F1E9}\u{1F1EF}', rate: 177.5 },
  { code: 'ERN', name: 'Eritrean Nakfa', symbol: 'Nfk', country: 'Eritrea', countryCode: 'ER', flag: '\u{1F1EA}\u{1F1F7}', rate: 15.2 },
  { code: 'MRU', name: 'Mauritanian Ouguiya', symbol: 'UM', country: 'Mauritania', countryCode: 'MR', flag: '\u{1F1F2}\u{1F1F7}', rate: 40.1 },
  { code: 'MGA', name: 'Malagasy Ariary', symbol: 'Ar', country: 'Madagascar', countryCode: 'MG', flag: '\u{1F1F2}\u{1F1EC}', rate: 4550 },
  { code: 'MWK', name: 'Malawian Kwacha', symbol: 'MK', country: 'Malawi', countryCode: 'MW', flag: '\u{1F1F2}\u{1F1FC}', rate: 1750 },
  { code: 'NAD', name: 'Namibian Dollar', symbol: 'N$', country: 'Namibia', countryCode: 'NA', flag: '\u{1F1F3}\u{1F1E6}', rate: 18.2 },
  { code: 'LSL', name: 'Lesotho Loti', symbol: 'L', country: 'Lesotho', countryCode: 'LS', flag: '\u{1F1F1}\u{1F1F8}', rate: 18.2 },
  { code: 'SZL', name: 'Swazi Lilangeni', symbol: 'E', country: 'Eswatini', countryCode: 'SZ', flag: '\u{1F1F8}\u{1F1FF}', rate: 18.2 },
  { code: 'MUR', name: 'Mauritian Rupee', symbol: 'Rs', country: 'Mauritius', countryCode: 'MU', flag: '\u{1F1F2}\u{1F1FA}', rate: 46.4 },
  { code: 'SCR', name: 'Seychellois Rupee', symbol: 'SR', country: 'Seychelles', countryCode: 'SC', flag: '\u{1F1F8}\u{1F1E8}', rate: 13.6 },
  { code: 'KMF', name: 'Comorian Franc', symbol: 'CF', country: 'Comoros', countryCode: 'KM', flag: '\u{1F1F0}\u{1F1F2}', rate: 490 },
  { code: 'CVE', name: 'Cape Verdean Escudo', symbol: '$', country: 'Cape Verde', countryCode: 'CV', flag: '\u{1F1E8}\u{1F1FB}', rate: 110 },
  { code: 'STN', name: 'S\u00E3o Tom\u00E9 Dobra', symbol: 'Db', country: 'S\u00E3o Tom\u00E9 and Pr\u00EDncipe', countryCode: 'ST', flag: '\u{1F1F8}\u{1F1F9}', rate: 22.5 },
  { code: 'GMD', name: 'Gambian Dalasi', symbol: 'D', country: 'Gambia', countryCode: 'GM', flag: '\u{1F1EC}\u{1F1F2}', rate: 67 },
  { code: 'SLL', name: 'Sierra Leonean Leone', symbol: 'Le', country: 'Sierra Leone', countryCode: 'SL', flag: '\u{1F1F8}\u{1F1F1}', rate: 22500 },
  { code: 'LRD', name: 'Liberian Dollar', symbol: 'L$', country: 'Liberia', countryCode: 'LR', flag: '\u{1F1F1}\u{1F1F7}', rate: 155 },
  { code: 'GNF', name: 'Guinean Franc', symbol: 'FG', country: 'Guinea', countryCode: 'GN', flag: '\u{1F1EC}\u{1F1F3}', rate: 8600 },
  { code: 'BIF', name: 'Burundian Franc', symbol: 'FBu', country: 'Burundi', countryCode: 'BI', flag: '\u{1F1E7}\u{1F1EE}', rate: 2900 },
  { code: 'ZWL', name: 'Zimbabwean Gold', symbol: 'ZWG', country: 'Zimbabwe', countryCode: 'ZW', flag: '\u{1F1FF}\u{1F1FC}', rate: 25.8 },
  { code: 'XAF', name: 'Central African CFA Franc', symbol: 'FCFA', country: 'Cameroon', countryCode: 'CM', flag: '\u{1F1E8}\u{1F1F2}', rate: 610 },
  { code: 'XOF', name: 'West African CFA Franc', symbol: 'CFA', country: 'Senegal', countryCode: 'SN', flag: '\u{1F1F8}\u{1F1EB}', rate: 605 },
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

export const LOCAL_CURRENCY_COUNTRIES: Record<string, string> = Object.fromEntries(
  SUPPORTED_LOCAL_CURRENCIES.map((c) => [c.code, c.country])
);

export function getLocalRate(currency: string): number {
  return LOCAL_CURRENCY_RATES[currency.toUpperCase()] || 1500;
}
