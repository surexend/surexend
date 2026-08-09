const crypto = require('crypto');

// 1. Paste the Circle Public Key from the Circle Console inside the backticks below
const circlePublicKeyPem = `-----BEGIN PUBLIC KEY-----
REPLACE_THIS_WITH_THE_PUBLIC_KEY_FROM_YOUR_CIRCLE_CONSOLE
-----END PUBLIC KEY-----`;

function encryptEntitySecret(publicKeyPem, secretHex) {
  const buffer = Buffer.from(secretHex, 'hex');
  const encrypted = crypto.publicEncrypt(
    {
      key: publicKeyPem,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    buffer
  );
  return encrypted.toString('base64');
}

function run() {
  if (circlePublicKeyPem.includes('REPLACE_THIS_WITH_THE_PUBLIC_KEY')) {
    console.error('\n❌ ERROR: Please edit this file and paste your Circle Public Key inside the backticks first!\n');
    process.exit(1);
  }

  // Generate a random 32-byte hex secret
  const rawSecret = crypto.randomBytes(32).toString('hex');
  
  // Encrypt it
  const ciphertext = encryptEntitySecret(circlePublicKeyPem, rawSecret);

  console.log('\n==================================================');
  console.log('🎉 ENTITY SECRET GENERATED & ENCRYPTED SUCCESSFULLY');
  console.log('==================================================\n');
  console.log('1. Copy the RAW HEX SECRET below and add it to your .env file as CIRCLE_ENTITY_SECRET:');
  console.log(`\nCIRCLE_ENTITY_SECRET=${rawSecret}\n`);
  console.log('--------------------------------------------------');
  console.log('2. Copy the ENCRYPTED CIPHERTEXT below and paste it into your Circle Console:');
  console.log(`\n${ciphertext}\n`);
  console.log('==================================================\n');
}

run();
