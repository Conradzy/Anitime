// Build with NEXT_DIST_DIR=.next-build, then start with scripts/store-test-server.cjs
// as the Node preloader (see its command). Run: node scripts/test-store-buy-flow.mjs
// Uses disposable users on port 3100 and cleans up their rows in finally.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import nextEnv from '@next/env';
import pg from 'pg';

nextEnv.loadEnvConfig(process.cwd());
const base = 'http://localhost:3100';
const connectionString = process.env.DATABASE_URL;
const db = new pg.Client({ connectionString, ...(/@(localhost|127\.0\.0\.1)[:/]/.test(connectionString) ? {} : { ssl: { rejectUnauthorized: false } }) });
const stamp = Date.now();
const emails = [`zz-seller-${stamp}@test.local`, `zz-buyer-${stamp}@test.local`];
const password = randomBytes(18).toString('base64url');
let upload;
async function api(path, cookie, method = 'GET', body, expected = 200) {
  const response = await fetch(base + path, { method, headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json();
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`);
  return data;
}
async function login(email, pass = password) {
  const response = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: pass }) });
  assert.equal(response.status, 200, 'Login');
  return response.headers.getSetCookie().map(cookie => cookie.split(';')[0]).join('; ');
}
await db.connect();
try {
  for (let index = 0; index < emails.length; index++) {
    await api('/api/auth/register', null, 'POST', { email: emails[index], password, fullname: `Disposable store test ${index}`, product: 'Banana', role: index ? 'BUYER' : 'SELLER' });
  }
  await db.query('UPDATE "User" SET "emailVerified"=now() WHERE email=ANY($1)', [emails]);
  const seller = await login(emails[0]), buyer = await login(emails[1]);
  const stores = readdirSync('lib/stores').filter(file => file.endsWith('.json')).map(file => JSON.parse(readFileSync(`lib/stores/${file}`, 'utf8')));
  await api('/api/stores/lapanday/conversation', null, 'POST', {}, 401);
  await api('/api/stores/nonexistent/conversation', seller, 'POST', {}, 404);
  for (const store of stores) {
    const url = `/api/stores/${store.id}/conversation`;
    const chat = await api(url, seller, 'POST', {});
    assert.equal((await api(url, seller, 'POST', {})).id, chat.id, 'Reuses existing conversation');
    const detail = await api(`/api/conversations/${chat.id}`, seller);
    assert.equal(detail.listing.kind, 'BUY_REQUEST');
    assert.equal(detail.storeContact.phone, store.phone || store.phoneExample);
    assert.match(detail.other.fullname, /School demo/);
    await api(`/api/conversations/${chat.id}`, buyer, 'GET', undefined, 404);
  }
  console.log('All 19 store chats: correct buyer, phone, request, deduplication and access control passed');

  const { id: requestId } = await api('/api/buy-requests', buyer, 'POST', { crop: 'Banana', variety: 'Lakatan / Binangay', quantity: 10000, unit: 'kg', targetPrice: 22, location: 'Davao City test destination', latitude: 7.10902685, longitude: 125.649403, paymentMethods: ['CASH_ON_DELIVERY'], fulfillment: 'BOTH', description: `Disposable test ${stamp}` }, 201);
  const feed = `/api/buy-requests?q=${stamp}`;
  assert.ok((await api(feed, seller)).requests.some(item => item.id === requestId));
  assert.ok(!(await api(feed, buyer)).requests.some(item => item.id === requestId));
  const mine = async () => (await api('/api/buy-requests?scope=mine', buyer)).requests.find(item => item.id === requestId);
  assert.equal((await mine()).remainingQuantity, 10000);
  const { id: chatId } = await api('/api/conversations', seller, 'POST', { buyRequestId: requestId });
  const messages = `/api/conversations/${chatId}/messages`;
  const offer = { type: 'OFFER', quantity: 4000, unitPrice: 22, fulfillment: 'DELIVERY', scheduledAt: new Date(Date.now() + 86400000).toISOString() };
  const missing = await api(messages, seller, 'POST', offer, 409);
  assert.match(missing.error, /your location/i);
  const located = { ...offer, sellerLat: 7.1193212, sellerLng: 125.6564904, sellerAddress: 'Davao City test origin' };
  const { offerId } = await api(messages, seller, 'POST', located, 201);
  const { offerId: counterId } = await api(messages, buyer, 'POST', { ...offer, unitPrice: 21, parentOfferId: offerId }, 201);
  assert.ok((await api(`/api/conversations/${chatId}`, seller)).messages.some(message => message.offer?.status === 'COUNTERED'));

  const form = new FormData();
  form.append('file', new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jfYoAAAAASUVORK5CYII=', 'base64')], { type: 'image/png' }), 'test.png');
  const photoResponse = await fetch(base + '/api/uploads', { method: 'POST', headers: { cookie: seller }, body: form });
  assert.equal(photoResponse.status, 201); upload = await photoResponse.json();
  assert.ok(upload.url.startsWith('/api/uploads/'), 'Test server must use local uploads');
  await api(messages, seller, 'POST', { type: 'TEXT', body: 'Disposable photo test', images: [upload.path] }, 201);
  assert.ok((await api(`/api/conversations/${chatId}`, buyer)).messages.some(message => message.images.includes(upload.url)));

  await api(`/api/offers/${counterId}`, seller, 'PATCH', { action: 'accept' });
  const { rows: [first] } = await db.query('SELECT * FROM "Transaction" WHERE "offerId"=$1', [counterId]);
  assert.ok(first.originLat && first.destLat && Number(first.distanceKm) > 0 && first.routePath.length > 2, 'Computed road route');
  assert.equal(first.routeSource, 'road');
  assert.equal((await mine()).remainingQuantity, 6000);
  assert.equal((await mine()).status, 'ACTIVE');
  for (const action of ['start', 'delivered', 'paid']) await api(`/api/transactions/${first.id}`, seller, 'PATCH', { action });
  await api(`/api/transactions/${first.id}`, buyer, 'PATCH', { action: 'received' });
  await api(`/api/transactions/${first.id}/review`, buyer, 'POST', { rating: 5, comment: 'Disposable test review' }, 201);
  const publicRequest = await api(`/api/buy-requests/${requestId}`, seller);
  assert.equal(publicRequest.completed[0].review.rating, 5);
  assert.ok(publicRequest.completed[0].seller);
  const { offerId: secondId } = await api(messages, seller, 'POST', { ...located, quantity: 6000 }, 201);
  await api(`/api/offers/${secondId}`, buyer, 'PATCH', { action: 'accept' });
  assert.equal((await mine()).status, 'FULFILLED');
  assert.equal((await mine()).remainingQuantity, 0);
  const { rows: [second] } = await db.query('SELECT id FROM "Transaction" WHERE "offerId"=$1', [secondId]);
  await api(`/api/transactions/${second.id}`, buyer, 'PATCH', { action: 'cancel' });
  assert.equal((await mine()).remainingQuantity, 6000);
  assert.equal((await mine()).status, 'ACTIVE');
  await api(`/api/buy-requests/${requestId}`, buyer, 'PATCH', { action: 'close' });
  assert.ok(!(await api(feed, seller)).requests.some(item => item.id === requestId));
  console.log('Buy flow passed: location validation, photos, counteroffer, road route, partial/full fulfillment, completion, review, cancellation and close');
} finally {
  const { rows } = await db.query('SELECT id FROM "User" WHERE email=ANY($1)', [emails]);
  const ids = rows.map(row => row.id);
  await db.query('DELETE FROM "Review" WHERE "reviewerId"=ANY($1) OR "revieweeId"=ANY($1)', [ids]);
  await db.query('DELETE FROM "Transaction" WHERE "buyerId"=ANY($1) OR "sellerId"=ANY($1)', [ids]);
  await db.query('DELETE FROM "User" WHERE id=ANY($1)', [ids]);
  if (upload?.url.startsWith('/api/uploads/') && /^\d+\/[a-f0-9-]{36}\.png$/.test(upload.path)) rmSync(`.uploads/${upload.path}`, { force: true });
  await db.end();
  console.log('Disposable test data cleaned up');
}
