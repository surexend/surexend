export const MAINNET_NETWORKS = [
  'ARC',
  'ETHEREUM',
  'POLYGON',
  'AVALANCHE',
  'ARBITRUM',
  'BASE',
  'OPTIMISM',
  'SOLANA',
  'MONAD',
] as const;

export type SupportedNetwork = (typeof MAINNET_NETWORKS)[number];

export interface ReviewedNetworkMatrixEntry {
  circleBlockchain: string;
  cctpChain: string;
  rpcUrls: string[];
  chainId: number;
  usdcContract: string;
  usdcDecimals: number;
  explorerUrl: string;
}

export type ReviewedNetworkMatrix = Partial<Record<SupportedNetwork, ReviewedNetworkMatrixEntry>>;

/**
 * The mainnet matrix is deliberately supplied as reviewed deployment data,
 * rather than guessed in application code. Chain names accepted by Circle and
 * BridgeKit, token addresses, RPC endpoints, and explorer URLs are provider and
 * network release data; an incorrect value can route money to the wrong chain.
 */
export function parseReviewedNetworkMatrix(raw: string | undefined): ReviewedNetworkMatrix {
  if (!raw?.trim()) {
    throw new Error('MAINNET_CHAIN_MATRIX_JSON is required when mainnet is selected.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('MAINNET_CHAIN_MATRIX_JSON must be valid JSON.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('MAINNET_CHAIN_MATRIX_JSON must be an object keyed by network name.');
  }

  const matrix: ReviewedNetworkMatrix = {};
  for (const [rawNetwork, rawEntry] of Object.entries(parsed as Record<string, unknown>)) {
    const network = rawNetwork.toUpperCase() as SupportedNetwork;
    if (!(MAINNET_NETWORKS as readonly string[]).includes(network)) {
      throw new Error(`MAINNET_CHAIN_MATRIX_JSON contains unsupported network ${rawNetwork}.`);
    }
    if (matrix[network]) {
      throw new Error(`MAINNET_CHAIN_MATRIX_JSON contains duplicate network entries for ${network}.`);
    }
    if (!rawEntry || typeof rawEntry !== 'object' || Array.isArray(rawEntry)) {
      throw new Error(`Mainnet matrix entry ${network} must be an object.`);
    }
    const entry = rawEntry as Record<string, unknown>;
    const circleBlockchain = String(entry.circleBlockchain || '').trim();
    const cctpChain = String(entry.cctpChain || '').trim();
    const rpcUrls = Array.isArray(entry.rpcUrls)
      ? entry.rpcUrls.map((value) => String(value).trim()).filter(Boolean)
      : [];
    const chainId = Number(entry.chainId);
    const usdcContract = String(entry.usdcContract || '').trim();
    const usdcDecimals = Number(entry.usdcDecimals);
    const explorerUrl = String(entry.explorerUrl || '').trim();

    if (!circleBlockchain || !cctpChain) {
      throw new Error(`Mainnet matrix entry ${network} must include circleBlockchain and cctpChain.`);
    }
    if (!rpcUrls.length || rpcUrls.some((url) => !/^https:\/\//i.test(url) || /localhost|127\.0\.0\.1/i.test(url))) {
      throw new Error(`Mainnet matrix entry ${network} must contain HTTPS, non-local rpcUrls.`);
    }
    if (!Number.isSafeInteger(chainId) || chainId <= 0) {
      throw new Error(`Mainnet matrix entry ${network} must contain a positive integer chainId.`);
    }
    // EVM addresses and Solana-style base58 public keys are both supported.
    if (!/^0x[a-fA-F0-9]{40}$/.test(usdcContract) && !/^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(usdcContract)) {
      throw new Error(`Mainnet matrix entry ${network} has an invalid usdcContract.`);
    }
    if (!Number.isInteger(usdcDecimals) || usdcDecimals <= 0 || usdcDecimals > 18) {
      throw new Error(`Mainnet matrix entry ${network} must contain valid usdcDecimals.`);
    }
    if (!/^https:\/\//i.test(explorerUrl) || /localhost|127\.0\.0\.1/i.test(explorerUrl)) {
      throw new Error(`Mainnet matrix entry ${network} must contain an HTTPS explorerUrl.`);
    }

    matrix[network] = { circleBlockchain, cctpChain, rpcUrls, chainId, usdcContract, usdcDecimals, explorerUrl };
  }
  return matrix;
}

export function validateEnabledMainnetNetworks(matrix: ReviewedNetworkMatrix, rawEnabled: string | undefined): SupportedNetwork[] {
  const enabled = (rawEnabled || 'ARC').split(',').map((value) => value.trim().toUpperCase()).filter(Boolean) as SupportedNetwork[];
  if (!enabled.length) throw new Error('MAINNET_ENABLED_NETWORKS must contain at least one network.');
  for (const network of enabled) {
    if (!(MAINNET_NETWORKS as readonly string[]).includes(network)) {
      throw new Error(`MAINNET_ENABLED_NETWORKS contains unsupported network ${network}.`);
    }
    if (!matrix[network]) {
      throw new Error(`MAINNET_ENABLED_NETWORKS includes ${network}, but the reviewed matrix has no entry for it.`);
    }
  }
  return [...new Set(enabled)];
}
