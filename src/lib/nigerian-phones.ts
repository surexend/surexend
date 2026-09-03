/**
 * Nigerian Phone Number Validation, Formatting, and Network Auto-Detection
 * Supports: MTN, Airtel, Glo, 9mobile
 */

export type NetworkCode = 'MTN' | 'AIRTEL' | 'GLO' | '9MOBILE'

export interface NetworkMeta {
  code: NetworkCode
  name: string
  logo: string
  color: string
  prefixes: string[]
}

export const NIGERIAN_NETWORKS: Record<NetworkCode, NetworkMeta> = {
  MTN: {
    code: 'MTN',
    name: 'MTN Nigeria',
    logo: '/logos/mtn.png',
    color: '#FFCC00',
    prefixes: [
      '0803', '0806', '0703', '0706', '0813', '0816', '0810', '0814',
      '0903', '0906', '0913', '0916', '0704', '07025', '07026', '0707'
    ],
  },
  AIRTEL: {
    code: 'AIRTEL',
    name: 'Airtel Nigeria',
    logo: '/logos/airtel.png',
    color: '#FF0000',
    prefixes: [
      '0802', '0808', '0708', '0812', '0701', '0902', '0901', '0904',
      '0907', '0912', '0911'
    ],
  },
  GLO: {
    code: 'GLO',
    name: 'Globacom',
    logo: '/logos/glo.png',
    color: '#00B140',
    prefixes: [
      '0805', '0807', '0705', '0815', '0811', '0905', '0915'
    ],
  },
  '9MOBILE': {
    code: '9MOBILE',
    name: '9mobile',
    logo: '/logos/9mobile.png',
    color: '#006838',
    prefixes: [
      '0809', '0817', '0818', '0909', '0908'
    ],
  },
}

/**
 * Normalizes input to 11-digit Nigerian format (e.g. 08031234567)
 * Handles +234, 234, leading 0 omissions, spaces, hyphens, parentheses
 */
export function normalizeNigerianPhone(raw: string): string {
  if (!raw) return ''
  let cleaned = raw.replace(/[^\d+]/g, '')
  if (cleaned.startsWith('+234')) {
    cleaned = '0' + cleaned.slice(4)
  } else if (cleaned.startsWith('234') && cleaned.length >= 13) {
    cleaned = '0' + cleaned.slice(3)
  } else if (cleaned.length === 10 && !cleaned.startsWith('0')) {
    cleaned = '0' + cleaned
  }
  return cleaned
}

/**
 * Formats a phone number for clean readable display:
 * e.g., "0706 7965 200" or "0803 123 4567"
 */
export function formatPhoneDisplay(raw: string): string {
  const norm = normalizeNigerianPhone(raw)
  if (!norm) return raw
  if (norm.length <= 4) return norm
  if (norm.length <= 8) return `${norm.slice(0, 4)} ${norm.slice(4)}`
  return `${norm.slice(0, 4)} ${norm.slice(4, 8)} ${norm.slice(8, 11)}`
}

/**
 * Automatically detects the Nigerian network from a phone number prefix
 */
export function detectNetworkFromPhone(phone: string): NetworkCode | null {
  const norm = normalizeNigerianPhone(phone)
  if (norm.length < 4) return null

  for (const net of Object.values(NIGERIAN_NETWORKS)) {
    for (const prefix of net.prefixes) {
      if (norm.startsWith(prefix)) {
        return net.code
      }
    }
  }
  return null
}

export interface PhoneValidationResult {
  isValid: boolean
  normalized: string
  detectedNetwork: NetworkCode | null
  error?: string
  warning?: string
  isMismatch?: boolean
}

/**
 * Validates a Nigerian phone number and checks compatibility with selected network
 */
export function validateNigerianPhone(
  phone: string,
  selectedNetwork?: string,
  isPorted: boolean = false
): PhoneValidationResult {
  const normalized = normalizeNigerianPhone(phone)

  if (!normalized) {
    return {
      isValid: false,
      normalized: '',
      detectedNetwork: null,
      error: 'Please enter a phone number',
    }
  }

  // Check digit count
  if (normalized.length < 11) {
    return {
      isValid: false,
      normalized,
      detectedNetwork: detectNetworkFromPhone(normalized),
      error: `Phone number is incomplete (${normalized.length}/11 digits)`,
    }
  }

  if (normalized.length > 11) {
    return {
      isValid: false,
      normalized,
      detectedNetwork: detectNetworkFromPhone(normalized),
      error: `Phone number too long (${normalized.length}/11 digits)`,
    }
  }

  // Must match Nigerian mobile prefix (070, 080, 081, 090, 091)
  if (!/^0[789][01]\d{8}$/.test(normalized)) {
    return {
      isValid: false,
      normalized,
      detectedNetwork: null,
      error: 'Invalid Nigerian mobile number prefix (must start with 070, 080, 081, 090, or 091)',
    }
  }

  const detected = detectNetworkFromPhone(normalized)

  if (selectedNetwork && detected) {
    const cleanSelected = selectedNetwork.toUpperCase().replace('-DATA', '').trim()
    if (cleanSelected !== detected && !isPorted) {
      return {
        isValid: true,
        normalized,
        detectedNetwork: detected,
        isMismatch: true,
        warning: `This number belongs to ${detected}, but ${cleanSelected} is selected. Enable "Ported Number" if you switched networks.`,
      }
    }
  }

  return {
    isValid: true,
    normalized,
    detectedNetwork: detected,
  }
}
