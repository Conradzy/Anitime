/* eslint-disable @typescript-eslint/no-require-imports -- Node --require preloads CommonJS before Next.js starts. */
// Isolated test server ONLY. Injects test signing keys into Google's real verifier.
// $env:NEXT_DIST_DIR='.next-build'; node -r ./scripts/google-auth-test-server.cjs node_modules/next/dist/bin/next start --hostname 127.0.0.1 -p 3101
const assert = require('node:assert/strict');
const { generateKeyPairSync } = require('node:crypto');
const { writeFileSync } = require('node:fs');
const { OAuth2Client } = require('google-auth-library');
assert.equal(process.argv[process.argv.indexOf('--hostname') + 1], '127.0.0.1', 'Test auth server must bind only to loopback');
assert.equal(process.argv[process.argv.indexOf('-p') + 1], '3101', 'Use the dedicated test port');
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
writeFileSync('.next-build/google-test-key.pem', privateKey);
OAuth2Client.prototype.getFederatedSignonCertsAsync = async () => ({ certs: { 'local-test': publicKey }, format: 'PEM' });
require('nodemailer').createTransport = () => ({ sendMail: async () => ({ messageId: 'local-test-no-email' }) });
