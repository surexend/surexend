import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BridgeKit, BridgeChain } from '@circle-fin/bridge-kit';
import { createCircleWalletsAdapter } from '@circle-fin/adapter-circle-wallets';

const NETWORK_TO_CHAIN: Record<string, string> = {
  ARC: BridgeChain.Arc_Testnet,
  POLYGON: BridgeChain.Polygon_Amoy_Testnet,
  ETHEREUM: BridgeChain.Ethereum_Sepolia,
  AVALANCHE: BridgeChain.Avalanche_Fuji,
  ARBITRUM: BridgeChain.Arbitrum_Sepolia,
  BASE: BridgeChain.Base_Sepolia,
  OPTIMISM: BridgeChain.Optimism_Sepolia,
  SOLANA: BridgeChain.Solana_Devnet,
  MONAD: BridgeChain.Monad_Testnet,
};

@Injectable()
export class CctpService {
  private readonly logger = new Logger(CctpService.name);
  private kit: BridgeKit;

  constructor(private configService: ConfigService) {
    this.kit = new BridgeKit();
  }

  private createAdapter() {
    const apiKey = this.configService.get<string>('app.circle.apiKey') || '';
    const entitySecret = this.configService.get<string>('app.circle.entitySecret') || '';
    if (!apiKey || !entitySecret) {
      throw new BadRequestException('Circle CCTP credentials are not configured.');
    }
    return createCircleWalletsAdapter({ apiKey, entitySecret });
  }

  // Resolve a network name to its BridgeKit chain constant. Every entry in
  // NETWORK_TO_CHAIN can be used as a source OR destination since CCTP burns on
  // one supported chain and mints on another (bidirectional by design).
  private getChain(network: string, role: 'source' | 'destination'): string {
    const chain = NETWORK_TO_CHAIN[network.toUpperCase()];
    if (!chain) {
      throw new BadRequestException(
        `${role === 'source' ? 'Source' : 'Destination'} network ${network} is not supported for CCTP bridging.`
      );
    }
    return chain;
  }

  getDestinationChain(network: string): string {
    return this.getChain(network, 'destination');
  }

  getSourceChain(network: string): string {
    return this.getChain(network, 'source');
  }

  // Bridging is generic: pass any supported source/destination network pair.
  // CCTP handles burning USDC on the source chain and minting on the
  // destination chain, so this works in both directions across all listed
  // networks (Arc -> X and X -> Arc included).
  async bridge(params: {
    sourceNetwork: string;
    sourceAddress: string;
    destNetwork: string;
    recipientAddress: string;
    amount: number;
  }): Promise<any> {
    const { sourceNetwork, sourceAddress, destNetwork, recipientAddress, amount } = params;
    const sourceNet = sourceNetwork.toUpperCase();
    const destNet = destNetwork.toUpperCase();
    if (sourceNet === destNet) {
      throw new BadRequestException('Source and destination networks must be different.');
    }

    const sourceChain = this.getChain(sourceNet, 'source');
    const destChain = this.getChain(destNet, 'destination');

    const adapter = this.createAdapter();
    const amountStr = amount.toFixed(6).replace(/\.?0+$/, '');

    this.logger.log(
      `Initiating CCTP bridge: ${amount} USDC from ${sourceChain} (${sourceAddress}) -> ${destChain} (${recipientAddress})`
    );

    try {
      const result = await this.kit.bridge({
        from: {
          adapter,
          chain: sourceChain as any,
          address: sourceAddress,
        },
        to:
          destChain === BridgeChain.Solana_Devnet
            ? {
                chain: destChain as any,
                recipientAddress,
              }
            : {
                chain: destChain as any,
                recipientAddress,
                useForwarder: true as const,
              } as any,
        amount: amountStr,
        config: { transferSpeed: 'FAST' },
      });

      this.logger.log(`CCTP bridge result state: ${result.state}`);

      const steps: any[] = Array.isArray(result.steps) ? result.steps : [];
      const txHashes = steps
        .filter((s) => s?.txHash)
        .map((s) => ({ step: s.name, txHash: s.txHash }));

      this.logger.log(`CCTP bridge tx hashes: ${JSON.stringify(txHashes)}`);

      return {
        state: result.state,
        provider: result.provider,
        steps,
        txHashes,
      };
    } catch (err: any) {
      this.logger.error(
        'CCTP bridge failed:',
        err?.message || err,
        err?.stack,
      );
      throw new BadRequestException(err?.message || 'Cross-chain transfer failed.');
    }
  }
}
