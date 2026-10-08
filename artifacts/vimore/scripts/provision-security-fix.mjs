/**
 * Fixes the items that failed in the initial provisioning run:
 *   - severity attribute (not required, default 'INFO')
 *   - severity index
 *   - Appwrite Functions (correct runtime)
 */
import { Client, Databases, Functions, IndexType, Runtime } from 'node-appwrite';
import 'dotenv/config';

const ENDPOINT   = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://appwrite.mediatechliberia.online/v1';
const PROJECT_ID = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || 'vimore123';
const DB_ID      = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'vimoreprod';
const COLL_ID    = 'security_events';
const API_KEY    = process.env.APPWRITE_API_KEY;

if (!API_KEY) { console.error('APPWRITE_API_KEY not set'); process.exit(1); }

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db  = new Databases(client);
const fns = new Functions(client);

async function tryCreate(label, fn) {
  try {
    await fn();
    console.log(`  ✓ ${label}`);
  } catch (e) {
    if (e.code === 409) console.log(`  ↩ ${label} (already exists)`);
    else console.error(`  ✗ ${label}: ${e.message}`);
  }
}

await db.updateCollection(DB_ID, COLL_ID, 'security_events', [], false);
console.log('  ✓ public security-event reads disabled');

// Fix: severity — not required, with default 'INFO'
console.log('\n[ fix: severity attribute ]');
await tryCreate('severity (not required, default=INFO)', () =>
  db.createStringAttribute(DB_ID, COLL_ID, 'severity', 16, false, 'INFO')
);

// Wait for attribute to be ready before creating index
await new Promise(r => setTimeout(r, 4000));

console.log('\n[ fix: severity index ]');
await tryCreate('idx_severity', () =>
  db.createIndex(DB_ID, COLL_ID, 'idx_severity', IndexType.Key, ['severity'], ['ASC'])
);

// Fix: Appwrite Functions with correct runtime
console.log('\n[ Appwrite Functions ]');
const FUNCTIONS = [
  { id: 'fn-gift-transaction',        name: 'Gift Transaction' },
  { id: 'fn-subscribe-transaction',   name: 'Subscribe Transaction' },
  { id: 'fn-unlock-post-transaction', name: 'Unlock Post Transaction' },
  { id: 'fn-admin-action-log',        name: 'Admin Action Logger' },
];

for (const f of FUNCTIONS) {
  await tryCreate(`function: ${f.name}`, () =>
    fns.create(f.id, f.name, Runtime.Node200, ['users'], [], '', 15)
  );
  await new Promise(r => setTimeout(r, 600));
}

console.log('\n✅ Fix run complete.\n');
