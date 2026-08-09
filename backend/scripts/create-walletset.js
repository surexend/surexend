const crypto = require('crypto');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../.env');

// Read settings from .env
let apiKey = '';
let entitySecret = '';

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const keyMatch = envContent.match(/^CIRCLE_API_KEY=(.*)$/m);
  const secretMatch = envContent.match(/^CIRCLE_ENTITY_SECRET=(.*)$/m);
  if (keyMatch) apiKey = keyMatch[1].trim();
  if (secretMatch) entitySecret = secretMatch[1].trim();
}

if (!apiKey || !entitySecret) {
  console.error('❌ ERROR: Missing CIRCLE_API_KEY or CIRCLE_ENTITY_SECRET in .env file!');
  process.exit(1);
}

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
    console.log('Using API Key:', apiKey.substring(0, 16) + '...');
    console.log('Using Entity Secret:', entitySecret.substring(0, 16) + '...');

    // 1. Fetch the entity public key
    console.log('\nStep 1: Fetching Circle Public Key...');
    const pubKeyResponse = await axios.get('https://api.circle.com/v1/w3s/config/entity/publicKey', {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        accept: 'application/json',
      },
    });

    const publicKeyPem = pubKeyResponse.data.data.publicKey;
    console.log('Public Key retrieved successfully.');

    // 2. Encrypt the secret
    const ciphertext = encryptEntitySecret(publicKeyPem, entitySecret);

    // 3. Create default Wallet Set
    console.log('\nStep 2: Creating default Wallet Set...');
    const walletSetResponse = await axios.post(
      'https://api.circle.com/v1/w3s/developer/walletSets',
      {
        entitySecretCiphertext: ciphertext,
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
    console.log('🎉 Wallet Set created successfully! ID:', walletSetId);

    // 4. Update the .env file with the generated wallet set ID
    let envContent = fs.readFileSync(envPath, 'utf8');
    if (envContent.includes('CIRCLE_WALLET_SET_ID=')) {
      envContent = envContent.replace(/^CIRCLE_WALLET_SET_ID=.*$/m, `CIRCLE_WALLET_SET_ID=${walletSetId}`);
    } else {
      envContent += `\nCIRCLE_WALLET_SET_ID=${walletSetId}`;
    }
    fs.writeFileSync(envPath, envContent, 'utf8');
    console.log('✅ Updated .env file with CIRCLE_WALLET_SET_ID.');

  } catch (error) {
    console.error('❌ Error creating wallet set:', error.response ? error.response.data : error.message);
  }
}

run();
