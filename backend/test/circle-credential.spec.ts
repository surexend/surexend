import {
  classifyCircleApiKey,
  isValidCircleEntitySecret,
  isValidCircleWalletSetId,
  redactCircleApiKey,
} from '../src/config/circle-credential';

// Shapes come from https://developers.circle.com/api-reference/keys:
//   testnet: TEST_API_KEY:<id>:<secret>   mainnet: LIVE_API_KEY:<id>:<secret>
const TEST_KEY = 'TEST_API_KEY:ebb3ad72232624921abc4b162148bb84:019ef3358ef9cd6d08fc32csfe89a68d';
const LIVE_KEY = 'LIVE_API_KEY:ebb3ad72232624921abc4b162148bb84:019ef3358ef9cd6d08fc32csfe89a68d';

describe('Circle credential classification', () => {
  it('recognises the documented testnet and mainnet key prefixes', () => {
    expect(classifyCircleApiKey(TEST_KEY)).toBe('testnet');
    expect(classifyCircleApiKey(LIVE_KEY)).toBe('mainnet');
    expect(classifyCircleApiKey(`  ${LIVE_KEY}  `)).toBe('mainnet');
  });

  it('never treats an unrecognised key as mainnet', () => {
    expect(classifyCircleApiKey('')).toBe('missing');
    expect(classifyCircleApiKey(undefined)).toBe('missing');
    expect(classifyCircleApiKey('LIVE_API_KEY')).toBe('invalid');
    expect(classifyCircleApiKey('LIVE_API_KEY:onlytwo')).toBe('invalid');
    expect(classifyCircleApiKey('LIVE_API_KEY:a:b:c')).toBe('invalid');
    expect(classifyCircleApiKey('LIVE_API_KEY::secret')).toBe('invalid');
    expect(classifyCircleApiKey('SAND_API_KEY:id:secret')).toBe('invalid');
    expect(classifyCircleApiKey('live_api_key:id:secret')).toBe('invalid');
    expect(classifyCircleApiKey('Bearer LIVE_API_KEY:id:secret')).toBe('invalid');
  });

  it('validates the entity secret and wallet set id shapes', () => {
    expect(isValidCircleEntitySecret('a'.repeat(64))).toBe(true);
    expect(isValidCircleEntitySecret('A1B2'.repeat(16))).toBe(true);
    expect(isValidCircleEntitySecret('a'.repeat(63))).toBe(false);
    expect(isValidCircleEntitySecret('g'.repeat(64))).toBe(false);
    expect(isValidCircleEntitySecret('')).toBe(false);

    expect(isValidCircleWalletSetId('c4d1da72-111e-4d52-bdbf-2e74a2d803d5')).toBe(true);
    expect(isValidCircleWalletSetId('mainnet-wallet-set-id')).toBe(false);
    expect(isValidCircleWalletSetId('')).toBe(false);
  });

  it('redacts keys down to their environment prefix', () => {
    expect(redactCircleApiKey(LIVE_KEY)).toBe('LIVE_API_KEY:…');
    expect(redactCircleApiKey(TEST_KEY)).toBe('TEST_API_KEY:…');
    expect(redactCircleApiKey('nonsense')).toBe('(invalid-shape)');
    expect(redactCircleApiKey('')).toBe('(missing)');
    expect(redactCircleApiKey(LIVE_KEY)).not.toContain('ebb3ad72');
  });

  it('keeps the CommonJS mirror used by operator scripts in sync', () => {
    const { execFileSync } = require('node:child_process');
    const path = require('node:path');
    const script = `
      const m = require(${JSON.stringify(path.resolve(__dirname, '../scripts/lib/circle-credential.js'))});
      const keys = ${JSON.stringify([TEST_KEY, LIVE_KEY, '', 'bad', 'LIVE_API_KEY:a:b:c'])};
      process.stdout.write(JSON.stringify({
        classes: keys.map((k) => m.classifyCircleApiKey(k)),
        secret: m.isValidCircleEntitySecret('f'.repeat(64)),
        set: m.isValidCircleWalletSetId('c4d1da72-111e-4d52-bdbf-2e74a2d803d5'),
      }));
    `;
    const out = JSON.parse(execFileSync(process.execPath, ['-e', script], { encoding: 'utf8' }));
    expect(out.classes).toEqual([TEST_KEY, LIVE_KEY, '', 'bad', 'LIVE_API_KEY:a:b:c'].map((k) => classifyCircleApiKey(k)));
    expect(out.secret).toBe(true);
    expect(out.set).toBe(true);
  });
});
