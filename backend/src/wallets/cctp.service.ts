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

  getDestinationChain(network: string): string {
    const chain = NETWORK_TO_CHAIN[network.toUpperCase()];
    if (!chain || chain === BridgeChain.Arc_Testnet) {
      throw new BadRequestException(`Destination network ${network} is not supported for CCTP bridging.`);
    }
    return chain;
  }

  async bridgeFromArc(params: {
    sourceAddress: string;
    destChain: string;
    recipientAddress: string;
    amount: number;
  }): Promise<any> {
    const { sourceAddress, destChain, recipientAddress, amount } = params;
    const adapter = this.createAdapter();
    const amountStr = amount.toFixed(6).replace(/\.?0+$/, '');

    this.logger.log(
      `Initiating CCTP bridge: ${amount} USDC from Arc_Testnet (${sourceAddress}) -> ${destChain} (${recipientAddress})`
    );

    try {
      const result = await this.kit.bridge({
        from: {
          adapter,
          chain: BridgeChain.Arc_Testnet,
          address: sourceAddress,
        },
        to: {
          chain: destChain as any,
          recipientAddress,
          useForwarder: true,
        },
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
