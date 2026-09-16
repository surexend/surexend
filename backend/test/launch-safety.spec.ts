import { BadRequestException } from '@nestjs/common';
import { assertRecipientShape } from '../src/common/recipient-validation';
import { parseReviewedNetworkMatrix, validateEnabledMainnetNetworks } from '../src/config/network-matrix';

const validEntry = {
  circleBlockchain: 'ETH',
  cctpChain: 'Ethereum',
  rpcUrls: ['https://rpc.example.invalid'],
  chainId: 1,
  usdcContract: '0x1111111111111111111111111111111111111111',
  usdcDecimals: 6,
  explorerUrl: 'https://explorer.example.invalid',
};

describe('launch safety fixtures', () => {
  it('rejects testnet mappings and local endpoints from a mainnet matrix', () => {
    expect(() => parseReviewedNetworkMatrix(JSON.stringify({ ETHEREUM: { ...validEntry, cctpChain: 'Ethereum_Sepolia' } })))
      .toThrow(/testnet\/sandbox/);
    expect(() => parseReviewedNetworkMatrix(JSON.stringify({ ETHEREUM: { ...validEntry, rpcUrls: ['http://127.0.0.1:8545'] } })))
      .toThrow(/HTTPS/);
  });

  it('requires enabled networks to have reviewed entries', () => {
    const matrix = parseReviewedNetworkMatrix(JSON.stringify({ ETHEREUM: validEntry }));
    expect(validateEnabledMainnetNetworks(matrix, 'ETHEREUM,ethereum')).toEqual(['ETHEREUM']);
    expect(() => validateEnabledMainnetNetworks(matrix, 'SOLANA')).toThrow(/no entry/);
  });

  it('rejects malformed EVM and Solana recipients before provider calls', () => {
    expect(() => assertRecipientShape('ETHEREUM', 'not-an-address')).toThrow(BadRequestException);
    expect(() => assertRecipientShape('SOLANA', '0x1111111111111111111111111111111111111111')).toThrow(BadRequestException);
    expect(() => assertRecipientShape('ETHEREUM', '0x1111111111111111111111111111111111111111')).not.toThrow();
    expect(() => assertRecipientShape('SOLANA', '11111111111111111111111111111111')).not.toThrow();
  });
});
