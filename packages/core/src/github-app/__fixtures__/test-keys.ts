// Test fixtures for the github-app module. A real RSA key pair is generated
// once per test process; tests reuse it to keep the run fast and
// deterministic. The key size is small (2048) and used only in-process.

import { generateKeyPairSync } from 'node:crypto';

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

export const TEST_PRIVATE_KEY_PEM = privateKey;
export const TEST_APP_ID = '123456';
export const TEST_FROZEN_NOW = 1_700_000_000; // 2023-11-14T22:13:20Z
