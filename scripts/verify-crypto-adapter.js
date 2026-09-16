#!/usr/bin/env node

/**
 * Verify the narrow local elliptic compatibility package used by
 * @ethersproject/signing-key. This is deliberately a crypto smoke test, not a
 * substitute for an independent cryptographic review.
 */
const crypto = require('node:crypto');
const { SigningKey, recoverPublicKey, computePublicKey } = require('@ethersproject/signing-key');

const privateKey = `0x${'00'.repeat(31)}01`;
const expectedPublicKey = '0x0479be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8';
if (computePublicKey(privateKey) !== expectedPublicKey) {
  throw new Error('Known secp256k1 public-key vector failed.');
}

for (let index = 0; index < 100; index += 1) {
  const digest = `0x${crypto.randomBytes(32).toString('hex')}`;
  const signingKey = new SigningKey(privateKey);
  const signature = signingKey.signDigest(digest);
  const recovered = recoverPublicKey(digest, signature);
  if (recovered !== signingKey.publicKey) {
    throw new Error(`secp256k1 signature recovery failed on iteration ${index}.`);
  }
}

console.log('Noble-backed secp256k1 compatibility checks passed.');
