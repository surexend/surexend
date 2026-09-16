const testnetBases: Record<string, string> = {
  ARC: 'https://testnet.arcscan.app/tx/',
  ETHEREUM: 'https://sepolia.etherscan.io/tx/',
  POLYGON: 'https://amoy.polygonscan.com/tx/',
  AVALANCHE: 'https://testnet.snowtrace.io/tx/',
  ARBITRUM: 'https://sepolia.arbiscan.io/tx/',
  BASE: 'https://sepolia.basescan.org/tx/',
  OPTIMISM: 'https://sepolia-optimistic.etherscan.io/tx/',
  SOLANA: 'https://explorer.solana.com/tx/',
  MONAD: 'https://testnet.monadscan.com/tx/',
  BSC: 'https://testnet.bscscan.com/tx/',
}

const networks = Object.keys(testnetBases)
const isMainnet = process.env.NEXT_PUBLIC_CHAIN_ENV === 'mainnet'
const configuredBases: Record<string, string | undefined> = {
  ARC: process.env.NEXT_PUBLIC_ARC_EXPLORER_BASE,
  ETHEREUM: process.env.NEXT_PUBLIC_ETHEREUM_EXPLORER_BASE,
  POLYGON: process.env.NEXT_PUBLIC_POLYGON_EXPLORER_BASE,
  AVALANCHE: process.env.NEXT_PUBLIC_AVALANCHE_EXPLORER_BASE,
  ARBITRUM: process.env.NEXT_PUBLIC_ARBITRUM_EXPLORER_BASE,
  BASE: process.env.NEXT_PUBLIC_BASE_EXPLORER_BASE,
  OPTIMISM: process.env.NEXT_PUBLIC_OPTIMISM_EXPLORER_BASE,
  SOLANA: process.env.NEXT_PUBLIC_SOLANA_EXPLORER_BASE,
  MONAD: process.env.NEXT_PUBLIC_MONAD_EXPLORER_BASE,
  BSC: process.env.NEXT_PUBLIC_BSC_EXPLORER_BASE,
}

/**
 * Explorer links are deployment data just like RPCs and token contracts. A
 * mainnet frontend never falls back to a testnet explorer; missing deployment
 * data produces no link instead of a misleading verification link.
 */
export function explorerBase(network: string): string | null {
  const normalized = String(network || 'ARC').toUpperCase()
  const configured = configuredBases[normalized]
  if (configured?.startsWith('https://')) return configured.endsWith('/') ? configured : `${configured}/`
  if (isMainnet) return null
  return testnetBases[normalized] || testnetBases.ARC
}

export function explorerTransactionUrl(network: string, hash: string | undefined | null): string | null {
  if (!hash) return null
  const base = explorerBase(network)
  return base ? `${base}${encodeURIComponent(hash)}` : null
}

export function requiredMainnetExplorerNetworks(): string[] {
  return networks
}
