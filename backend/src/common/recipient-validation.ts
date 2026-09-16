import { BadRequestException } from '@nestjs/common';

/** Validate the address shape before any custody or provider operation. */
export function assertRecipientShape(network: string, recipient: string): void {
  const normalizedNetwork = String(network || '').toUpperCase();
  if (normalizedNetwork === 'SUREX_TAG') return;
  const value = String(recipient || '').trim();
  if (normalizedNetwork === 'SOLANA') {
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(value)) {
      throw new BadRequestException('Invalid Solana recipient address.');
    }
    return;
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
    throw new BadRequestException('Invalid EVM recipient address.');
  }
}
