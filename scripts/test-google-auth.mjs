// Run against scripts/google-auth-test-server.cjs on loopback port 3101.
// The real Google verifier checks locally signed fixtures; no production auth bypass.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import nextEnv from '@next/env';
import pg from 'pg';

nextEnv.loadEnvConfig(process.cwd());
const base = 'http://127.0.0.1:3101';
const aud = process.env.GOOGLE_CLIENT_ID || '863914614207-87f713kjfet5353gar6o8q3irsi4r0qp.apps.googleusercontent.com';
const key = readFileSync('.next-build/google-test-key.pem', 'utf8');
const stamp = Date.now();
const email = `zz-google-${stamp}@gmail.com`, existingEmail = `zz-existing-${stamp}@test.local`;
const emails = [email, existingEmail, `zz-external-${stamp}@test.local`];
const password = randomBytes(24).toString('base64url');
const connectionString = process.env.DATABASE_URL;
const db = new pg.Client({ connectionString, ...(/@(localhost|127\.0\.0\.1)[:/]/.test(connectionString) ? {} : { ssl: { rejectUnauthorized: false } }) });
const challenges = [];
async function challenge() {
  const res = await fetch(base + '/api/auth/google');
  assert.equal(res.status, 200);
  const data = await res.json(); challenges.push(data.nonce);
  return { nonce: data.nonce, cookie: res.headers.getSetCookie().map(value => value.split(';')[0]).join('; ') };
}
function token(nonce, overrides = {}, signingKey = key) {
  return jwt.sign({ iss: 'https://accounts.google.com', aud, sub: `google-test-${stamp}`, email, email_verified: true, name: 'Disposable Google User', nonce, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 600, ...overrides }, signingKey, { algorithm: 'RS256', keyid: 'local-test' });
}
async function submit(c, credential, extra = {}, expected = 200, origin = base) {
  const res = await fetch(base + '/api/auth/google', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: c.cookie, origin }, body: JSON.stringify({ credential, nonce: c.nonce, ...extra }) });
  const data = await res.json();
  assert.equal(res.status, expected, JSON.stringify(data));
  return { data, cookies: res.headers.getSetCookie() };
}
const registration = { fullname: 'Disposable Google User', role: 'BUYER', products: ['Corn'], agreeTerms: true };
await db.connect();
try {
  let c = await challenge();
  await submit(c, token(c.nonce), {}, 403, 'https://unrelated.example');
  await submit({ ...c, cookie: '' }, token(c.nonce), {}, 400);
  for (const override of [{ aud: 'wrong-client' }, { iss: 'https://unrelated.example' }, { exp: 1 }, { nonce: 'wrong-nonce' }, { email_verified: false }]) {
    c = await challenge(); await submit(c, token(c.nonce, override), {}, 401);
  }
  c = await challenge(); await submit(c, 'not-a-google-token', {}, 401);
  console.log('Rejected invalid tokens, issuer, audience, expiration, nonce, email verification and cross-site requests');
  c = await challenge();
  const credential = token(c.nonce);
  assert.equal((await submit(c, credential)).data.step, 'register');
  await submit(c, credential, { registration: { ...registration, agreeTerms: false } }, 400);
  const created = await submit(c, credential, { registration, keepSignedIn: true });
  assert.equal(created.data.role, 'BUYER');
  assert.ok(created.cookies.some(cookie => cookie.startsWith('anitime_session=') && cookie.includes('HttpOnly') && cookie.includes('Max-Age=2592000')));
  const sessionCookie = created.cookies.filter(cookie => cookie.startsWith('anitime_session=')).map(cookie => cookie.split(';')[0]).join('; ');
  const me = await fetch(base + '/api/auth/me', { headers: { cookie: sessionCookie } });
  assert.equal(me.status, 200, 'Created a real usable AniTime session');
  await submit(c, credential, {}, 429);
  const { rows: [firstUser] } = await db.query('SELECT id,role,"sellerVerified",product,"googleId" FROM "User" WHERE email=$1', [email]);
  assert.equal(firstUser.googleId, `google-test-${stamp}`); assert.equal(firstUser.sellerVerified, false); assert.equal(firstUser.product, 'Corn');
  c = await challenge();
  assert.equal((await submit(c, token(c.nonce, { email: 'changed-google-email@gmail.com' }))).data.success, true, 'Returning sign-in uses sub, not email');
  const { rows: [count] } = await db.query('SELECT count(*) FROM "User" WHERE "googleId"=$1', [`google-test-${stamp}`]);
  assert.equal(Number(count.count), 1);
  console.log('New registration, required consent, session cookie, single-use challenge and stable Google ID passed');

  const register = await fetch(base + '/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fullname: 'Disposable Existing User', email: existingEmail, password, product: 'Banana', role: 'SELLER' }) });
  assert.equal(register.status, 200);
  const { rows: [existing] } = await db.query('SELECT id FROM "User" WHERE email=$1', [existingEmail]);
  c = await challenge();
  let linkedCredential = token(c.nonce, { sub: `linked-${stamp}`, email: existingEmail });
  await submit(c, linkedCredential, {}, 403);
  await db.query('UPDATE "User" SET "emailVerified"=now() WHERE id=$1', [existing.id]);
  assert.equal((await submit(c, linkedCredential)).data.step, 'link');
  await submit(c, linkedCredential, { password: 'incorrect' }, 401);
  assert.equal((await submit(c, linkedCredential, { password, registration })).data.role, 'SELLER', 'Link cannot alter role');
  const { rows: [linked] } = await db.query('SELECT id,"googleId" FROM "User" WHERE email=$1', [existingEmail]);
  assert.equal(linked.id, existing.id); assert.equal(linked.googleId, `linked-${stamp}`);
  const login = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: existingEmail, password }) });
  assert.equal(login.status, 200, 'Original password still works');
  c = await challenge(); linkedCredential = token(c.nonce, { sub: `conflicting-${stamp}`, email: existingEmail });
  await submit(c, linkedCredential, { password }, 409);
  c = await challenge(); await submit(c, token(c.nonce, { sub: `external-${stamp}`, email: emails[2] }), { registration }, 403);
  c = await challenge();
  for (let index = 0; index < 8; index++) await submit(c, 'bad-token', {}, 401);
  await submit(c, 'bad-token', {}, 429);
  console.log('Existing account linking, password preservation, conflict protection, external email checks and attempt limits passed');
} finally {
  await db.query('DELETE FROM "User" WHERE email=ANY($1)', [emails]);
  await db.query('DELETE FROM "GoogleSignInChallenge" WHERE id=ANY($1)', [challenges]);
  await db.end();
  console.log('Disposable Google auth test data removed');
}
