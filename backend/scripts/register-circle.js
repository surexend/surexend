const crypto = require('crypto');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Constants
const BASE_URL = 'https://api.circle.com';
const envPath = path.join(__dirname, '../.env');

// Read API Key from user input or fallback to .env
let apiKey = 'TEST_API_KEY:e4fb19dbe72b0770658211afe0782553:c2941d95d8fbfd34a2890900f7dfcad9';

// Check if .env has an API key override
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const match = envContent.match(/^CIRCLE_API_KEY=(.*)$/m);
  if (match && match[1].trim()) {
    apiKey = match[1].trim();
  }
}

console.log('Using Circle API Key:', apiKey.substring(0, 16) + '...');

/**
 * Encrypts a secret using RSA-OAEP with SHA-256.
 */
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

async function run() {
  try {
    // 1. Generate cryptographically secure 32-byte hex (64 chars) entity secret
    const rawSecret = crypto.randomBytes(32).toString('hex');
    console.log('\nStep 1: Generated raw entity secret (keep this secret!):');
    console.log(rawSecret);

    // 2. Fetch the entity public key
    console.log('\nStep 2: Fetching Circle Public Key...');
    const pubKeyResponse = await axios.get(`${BASE_URL}/v1/w3s/config/entity/publicKey`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        accept: 'application/json',
      },
    });

    const publicKeyPem = pubKeyResponse.data.data.publicKey;
    console.log('Public Key retrieved successfully.');

    // 3. Encrypt the secret
    const ciphertext = encryptEntitySecret(publicKeyPem, rawSecret);
    console.log('Entity secret encrypted successfully.');

    // 4. Register the Entity Secret with Circle
    console.log('\nStep 3: Registering Entity Secret Ciphertext with Circle...');
    await axios.post(
      `${BASE_URL}/v1/w3s/config/entity/entitySecret`,
      { entitySecretCiphertext: ciphertext },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          accept: 'application/json',
        },
      }
    );
    console.log('Entity Secret registered successfully on Circle Sandbox.');

    // 5. Create default Wallet Set for the platform
    console.log('\nStep 4: Creating platform default Wallet Set...');
    const freshCiphertext = encryptEntitySecret(publicKeyPem, rawSecret);
    const walletSetResponse = await axios.post(
      `${BASE_URL}/v1/w3s/developer/walletSets`,
      {
        entitySecretCiphertext: freshCiphertext,
        idempotencyKey: crypto.randomUUID(),
        name: 'SureXend Default Wallet Set',
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          accept: 'application/json',
        },
      }
    );

    const walletSetId = walletSetResponse.data.data.walletSet.id;
    console.log('Wallet Set created successfully. ID:', walletSetId);

    // 6. Print environmental keys configuration block
    console.log('\n==================================================');
    console.log('🎉 CIRCLE INTEGRATION CREDENTIALS GENERATED');
    console.log('==================================================\n');
    console.log('Copy the following block and paste it into your .env file:\n');
    console.log(`CIRCLE_API_KEY=${apiKey}`);
    console.log(`CIRCLE_ENTITY_SECRET=${rawSecret}`);
    console.log(`CIRCLE_WALLET_SET_ID=${walletSetId}`);
    console.log('\n==================================================');
  } catch (error) {
    console.error('Error during Circle registration:', error.response ? error.response.data : error.message);
  }
}

run();
