// Run once with: node scripts/seed-store-demos.mjs
// Idempotent: does not reset passwords, request quantities or fulfilled requests.
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import nextEnv from '@next/env';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import ts from 'typescript';

nextEnv.loadEnvConfig(process.cwd());
const source = ts.transpileModule(readFileSync('lib/store-prices.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.ES2022 } }).outputText;
const { storePrice } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const connectionString = process.env.DATABASE_URL;
const db = new pg.Client({ connectionString, ...(/@(localhost|127\.0\.0\.1)[:/]/.test(connectionString) ? {} : { ssl: { rejectUnauthorized: false } }) });
const credentialPath = '.env.store-demo.local'; // ignored by Git; never print passwords
const credentials = existsSync(credentialPath) ? JSON.parse(readFileSync(credentialPath, 'utf8').split('\n').find(line => line.startsWith('STORE_DEMO_ACCOUNTS=')).slice('STORE_DEMO_ACCOUNTS='.length).slice(1, -1)) : [];
await db.connect();
try {
  for (const file of readdirSync('lib/stores').filter(file => file.endsWith('.json'))) {
    const store = JSON.parse(readFileSync(`lib/stores/${file}`, 'utf8'));
    const email = `store-${store.id}@stores.anitime.invalid`;
    await db.query('BEGIN');
    try {
      let { rows: [user] } = await db.query('SELECT id, fullname, role FROM "User" WHERE email=$1', [email]);
      let credential;
      if (!user) {
        const password = randomBytes(18).toString('base64url');
        const hash = await bcrypt.hash(password, 12);
        ({ rows: [user] } = await db.query('INSERT INTO "User" (fullname,businessname,product,email,"passwordHash",role,"buyerTier","emailVerified","updatedAt") VALUES ($1,$1,$2,$3,$4,\'BUYER\',\'BASIC\',now(),now()) RETURNING id', [`${store.name} (School demo)`, store.crop, email, hash]));
        credential = { store: store.name, email, password };
      } else if (!user.fullname.endsWith('(School demo)') || user.role !== 'BUYER') {
        throw new Error(`Reserved address is already used by a non-demo account: ${store.id}`);
      }
      const { rows: [request] } = await db.query('SELECT id FROM "BuyRequest" WHERE "buyerId"=$1 ORDER BY id LIMIT 1', [user.id]);
      if (!request) {
        const variety = { Banana: 'Cavendish (demo)', Corn: 'Feed corn (demo)', Pineapple: 'Hawaiian (demo)', Copra: 'Dried copra (demo)' }[store.crop];
        await db.query('INSERT INTO "BuyRequest" ("buyerId",crop,variety,unit,quantity,"remainingQuantity","targetPrice","paymentMethods",description,location,latitude,longitude,"updatedAt") VALUES ($1,$2,$3,\'kg\',10000,10000,$4,ARRAY[\'CASH_ON_DELIVERY\',\'CASH_ON_PICKUP\']::"PaymentMethod"[],$5,$6,$7,$8,now())', [user.id, store.crop, variety, storePrice(store).price, 'School demonstration only. This account and buying request are not operated by the named business. Prices and quantities are illustrative.', store.address, store.lat, store.lng]);
      }
      await db.query('INSERT INTO "UserProfile" ("userId","profilePhotoUrl","updatedAt") VALUES ($1,$2,now()) ON CONFLICT ("userId") DO NOTHING', [user.id, store.photo]);
      // Save credentials before committing so an interrupted run cannot lose access.
      if (credential) {
        const index = credentials.findIndex(item => item.email === email);
        if (index >= 0) credentials[index] = credential; else credentials.push(credential);
        writeFileSync(credentialPath, `# Private school-demo logins. Do not commit or share publicly.\nSTORE_DEMO_ACCOUNTS='${JSON.stringify(credentials)}'\n`);
      }
      await db.query('COMMIT');
      console.log(`Ready: ${store.name}`);
    } catch (error) { await db.query('ROLLBACK'); throw error; }
  }
  console.log(`Demo accounts ready. Private logins: ${credentialPath}`);
} finally { await db.end(); }

