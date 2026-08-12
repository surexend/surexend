'use client'

// Cross-platform flag badge. Flag emoji (e.g. 🇳🇬) do not render on Windows
// (Chrome/Edge show the two letters instead), so we render a deterministic
// gradient badge with the ISO country code instead. Works everywhere.
const FLAG_GRADIENTS: Record<string, string> = {
  NG: 'linear-gradient(135deg,#1B7A3D,#3E9B5F)',
  GH: 'linear-gradient(135deg,#F5B400,#1B7A3D)',
  KE: 'linear-gradient(135deg,#1B1B1B,#B13A3A)',
  ZA: 'linear-gradient(135deg,#E8A000,#007749)',
  UG: 'linear-gradient(135deg,#FFD200,#000000)',
  TZ: 'linear-gradient(135deg,#1EB53A,#00A3DD)',
  EG: 'linear-gradient(135deg,#CE1126,#FFFFFF)',
  MA: 'linear-gradient(135deg,#C1272D,#006233)',
  ET: 'linear-gradient(135deg,#078930,#FCDD09)',
  RW: 'linear-gradient(135deg,#00A3DD,#E5BE01)',
  ZM: 'linear-gradient(135deg,#198A00,#EF7D00)',
  MZ: 'linear-gradient(135deg,#006539,#FCD116)',
  BW: 'linear-gradient(135deg,#75AADB,#000000)',
  AO: 'linear-gradient(135deg,#CC092F,#CC092F)',
  CD: 'linear-gradient(135deg,#007FFF,#F7D618)',
  TN: 'linear-gradient(135deg,#E70013,#FFFFFF)',
  DZ: 'linear-gradient(135deg,#006233,#D21034)',
  LY: 'linear-gradient(135deg,#239E46,#000000)',
  SD: 'linear-gradient(135deg,#D21034,#007229)',
  SS: 'linear-gradient(135deg,#078930,#D21034)',
  SO: 'linear-gradient(135deg,#4189DD,#FFFFFF)',
  DJ: 'linear-gradient(135deg,#6CB2E1,#12AD2B)',
  ER: 'linear-gradient(135deg,#218731,#D21034)',
  MR: 'linear-gradient(135deg,#D01C1F,#00A95C)',
  MG: 'linear-gradient(135deg,#FC3D32,#007E3A)',
  MW: 'linear-gradient(135deg,#3A5A00,#B30000)',
  NA: 'linear-gradient(135deg,#003580,#D21034)',
  LS: 'linear-gradient(135deg,#00209F,#FFFFFF)',
  SZ: 'linear-gradient(135deg,#003D7D,#FFC300)',
  MU: 'linear-gradient(135deg,#EA2839,#1A2067)',
  SC: 'linear-gradient(135deg,#003F87,#FCD856)',
  KM: 'linear-gradient(135deg,#FFC61C,#FFFFFF)',
  CV: 'linear-gradient(135deg,#003893,#CF2027)',
  ST: 'linear-gradient(135deg,#12AD2B,#FFCE00)',
  GM: 'linear-gradient(135deg,#CE1126,#0C1C8C)',
  SL: 'linear-gradient(135deg,#1EB53A,#0072C6)',
  LR: 'linear-gradient(135deg,#BF0A30,#002868)',
  GN: 'linear-gradient(135deg,#CE1126,#FCD116)',
  BI: 'linear-gradient(135deg,#CE1126,#1EB53A)',
  ZW: 'linear-gradient(135deg,#006400,#FFD200)',
  CM: 'linear-gradient(135deg,#007A5E,#CE1126)',
  SN: 'linear-gradient(135deg,#00853F,#FCD116)',
}

function hashToColor(code: string): string {
  let h = 0
  for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) >>> 0
  const hue = h % 360
  return `linear-gradient(135deg, hsl(${hue},65%,35%), hsl(${(hue + 60) % 360},65%,45%))`
}

export default function CurrencyFlag({ countryCode, size = 28 }: { countryCode?: string; size?: number }) {
  const code = (countryCode || 'XX').toUpperCase()
  const background = FLAG_GRADIENTS[code] || hashToColor(code)
  return (
    <span
      className="inline-flex items-center justify-center rounded-lg font-black text-white/95 shrink-0 select-none"
      style={{
        width: size,
        height: Math.round(size * 0.7),
        background,
        fontSize: Math.round(size * 0.32),
        letterSpacing: '0.02em',
        border: '1px solid rgba(255,255,255,0.25)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
      }}
      aria-label={`${code} flag`}
    >
      {code}
    </span>
  )
}
