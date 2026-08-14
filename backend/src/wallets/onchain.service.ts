import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

export interface ChainConfig {
  key: string;
  label: string;
  rpcUrl: string;
  rpcUrls?: string[];
  usdcContract: string;
  usdcDecimals: number;
}

// EVM testnets the app monitors. Keyed by the value getBlockchainName() maps a
// network label to, so the deposit monitor can look a network up directly.
// Each chain carries a primary RPC plus fallbacks so transient public-endpoint
// failures (404/429/502) never stop reconciliation.
export const EVM_CHAINS: ChainConfig[] = [
  { key: 'ARC-TESTNET', label: 'ARC', rpcUrl: 'https://rpc.testnet.arc.network', usdcContract: '0x3600000000000000000000000000000000000000', usdcDecimals: 6 },
  { key: 'MATIC-AMOY', label: 'POLYGON', rpcUrl: 'https://polygon-amoy-bor-rpc.publicnode.com', rpcUrls: ['https://polygon-amoy-bor-rpc.publicnode.com', 'https://amoy.drpc.org'], usdcContract: '0x41e94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582', usdcDecimals: 6 },
  { key: 'BASE-SEPOLIA', label: 'BASE', rpcUrl: 'https://sepolia.base.org', rpcUrls: ['https://sepolia.base.org', 'https://base-sepolia-rpc.publicnode.com'], usdcContract: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', usdcDecimals: 6 },
  { key: 'ETH-SEPOLIA', label: 'ETHEREUM', rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com', usdcContract: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', usdcDecimals: 6 },
  { key: 'ARB-SEPOLIA', label: 'ARBITRUM', rpcUrl: 'https://sepolia-rollup.arbitrum.io/rpc', rpcUrls: ['https://sepolia-rollup.arbitrum.io/rpc', 'https://arbitrum-sepolia-rpc.publicnode.com'], usdcContract: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d', usdcDecimals: 6 },
  { key: 'OP-SEPOLIA', label: 'OPTIMISM', rpcUrl: 'https://sepolia.optimism.io', rpcUrls: ['https://sepolia.optimism.io', 'https://optimism-sepolia-rpc.publicnode.com'], usdcContract: '0x5fd84259d66Cd46123540766Be93DFE6D43130D7', usdcDecimals: 6 },
  { key: 'AVAX-FUJI', label: 'AVALANCHE', rpcUrl: 'https://api.avax-test.network/ext/bc/C/rpc', usdcContract: '0x5425890298aed601595a70AB815c96711a31Bc65', usdcDecimals: 6 },
  { key: 'MONAD-TESTNET', label: 'MONAD', rpcUrl: 'https://testnet-rpc.monad.xyz', rpcUrls: ['https://testnet-rpc.monad.xyz', 'https://rpc.ankr.com/monad_testnet', 'https://rpc-testnet.monadinfra.com'], usdcContract: '0x534b2f3A21130d7a60830c2Df862319e593943A3', usdcDecimals: 6 },
];

export const TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

const BALANCE_OF_CALL = '0x70a08231000000000000000000000000';

export interface OnChainTransfer {
  chainKey: string;
  network: string;
  txHash: string;
  blockNumber: number;
  timestamp: number;
  from: string;
  to: string;
  amount: number;
}

@Injectable()
export class OnchainService {
  private readonly logger = new Logger(OnchainService.name);

  private async rpc(chain: ChainConfig, method: string, params: any[]): Promise<any> {
    const urls = [chain.rpcUrl, ...(chain.rpcUrls || [])];
    let lastErr: any = null;
    for (const url of urls) {
      try {
        const res = await axios.post(
          url,
          { jsonrpc: '2.0', id: 1, method, params },
          { timeout: 25000 },
        );
        if (res.data.error) {
          throw new Error(`${chain.key} ${method}: ${res.data.error.message}`);
        }
        return res.data.result;
      } catch (err: any) {
        lastErr = err;
      }
    }
    throw new Error(`${chain.key} ${method}: all RPCs failed (${lastErr?.message || 'unknown'})`);
  }

  getChainByKey(key: string): ChainConfig | undefined {
    return EVM_CHAINS.find((c) => c.key === key);
  }

  getChainByNetwork(network: string): ChainConfig | undefined {
    const net = network.toUpperCase();
    return EVM_CHAINS.find((c) => c.label === net);
  }

  async getLatestBlock(chain: ChainConfig): Promise<number> {
    const hex = await this.rpc(chain, 'eth_blockNumber', []);
    return parseInt(hex, 16);
  }

  async getBlockTimestamp(chain: ChainConfig, blockNumber: number): Promise<number> {
    try {
      const block = await this.rpc(chain, 'eth_getBlockByNumber', [`0x${blockNumber.toString(16)}`, false]);
      if (block && block.timestamp) return parseInt(block.timestamp, 16);
    } catch (err: any) {
      this.logger.warn(`Failed to fetch block ${blockNumber} on ${chain.key}: ${err.message}`);
    }
    return Math.floor(Date.now() / 1000);
  }

  // USDC balance of an EVM address on the given chain, via the USDC contract's
  // balanceOf(). Arc's USDC precompile also honours this (6 decimals).
  async getUsdcBalance(chain: ChainConfig, address: string): Promise<number> {
    const hex = await this.rpc(chain, 'eth_call', [
      { to: chain.usdcContract, data: BALANCE_OF_CALL + address.slice(2).toLowerCase() },
      'latest',
    ]);
    return Number(BigInt(hex).toString()) / Math.pow(10, chain.usdcDecimals);
  }

  // Fetch USDC Transfer logs to a specific recipient across a block range.
  async getTransfersTo(
    chain: ChainConfig,
    address: string,
    fromBlock: number,
    toBlock: number,
  ): Promise<OnChainTransfer[]> {
    const paddedTo = '0x' + address.slice(2).toLowerCase().padStart(64, '0');
    const params = [
      {
        address: chain.usdcContract,
        topics: [TRANSFER_TOPIC, null, paddedTo],
        fromBlock: `0x${fromBlock.toString(16)}`,
        toBlock: `0x${toBlock.toString(16)}`,
      },
    ];

    let logs: any[] = [];
    let attempts = 0;
    while (attempts < 3) {
      attempts += 1;
      try {
        const result = await this.rpc(chain, 'eth_getLogs', params);
        logs = Array.isArray(result) ? result : [];
        break;
      } catch (err: any) {
        if (attempts >= 3) break;
        // Public testnet RPCs rate-limit (429); back off briefly and retry
        // instead of losing the deposit window for this scan.
        this.logger.warn(`eth_getLogs retry ${attempts}/2 on ${chain.key} for ${address}: ${err.message}`);
        await new Promise((r) => setTimeout(r, 1200 * attempts));
      }
    }
    if (attempts >= 3 && logs.length === 0) {
      this.logger.warn(`eth_getLogs failed on ${chain.key} for ${address}`);
    }

    const transfers: OnChainTransfer[] = [];
    for (const log of logs) {
      if (!log || !log.topics || log.topics.length < 3) continue;
      const to = '0x' + log.topics[2].substring(26).toLowerCase();
      if (to !== address.toLowerCase()) continue;

      let amount = 0;
      try {
        amount = Number(BigInt(log.data).toString()) / Math.pow(10, chain.usdcDecimals);
      } catch {
        continue;
      }
      if (amount <= 0) continue;

      const blockNumber = parseInt(log.blockNumber, 16);
      const timestamp = await this.getBlockTimestamp(chain, blockNumber);

      transfers.push({
        chainKey: chain.key,
        network: chain.label,
        txHash: log.transactionHash,
        blockNumber,
        timestamp,
        from: '0x' + (log.topics[1] || '').substring(26).toLowerCase(),
        to,
        amount,
      });
    }
    return transfers;
  }
}
