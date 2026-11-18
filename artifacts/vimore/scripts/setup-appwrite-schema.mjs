import { Client, Databases, ID, Permission, Role } from 'node-appwrite';
import 'dotenv/config';

const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://appwrite.mediatechliberia.online/v1';
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || 'vimore123';
const databaseId = process.env.APPWRITE_DATABASE_ID || process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'vimoreprod';
const apiKey = process.env.APPWRITE_API_KEY;

if (!apiKey) {
  console.error('APPWRITE_API_KEY is required');
  process.exit(1);
}

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const databases = new Databases(client);
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const schemas = [
  {
    id: 'transactions', name: 'Transactions', permissions: [],
    attrs: [
      ['transactionId', 'string', { size: 36, required: true }], ['senderUserId', 'string', { size: 36, required: true }], ['receiverUserId', 'string', { size: 36, required: true }],
      ['transactionType', 'enum', { elements: ['gift', 'subscription', 'unlock_post', 'unlock_music', 'store_boost', 'marketplace_boost', 'verification', 'currency_purchase'], required: true }], ['amountLD', 'integer', { required: true, min: 1 }],
      ['amountCredits', 'float'], ['currency', 'string', { size: 16 }], ['user_id', 'string', { size: 36 }],
      ['type', 'string', { size: 64 }], ['amount', 'float'], ['description', 'string', { size: 512 }],
      ['reference_id', 'string', { size: 64 }], ['from_user_id', 'string', { size: 36 }],
      ['from_user_name', 'string', { size: 128 }], ['from_user_avatar', 'string', { size: 512 }],
      ['itemId', 'string', { size: 36 }], ['itemType', 'enum', { elements: ['post', 'music', 'gift_item'] }],
      ['status', 'enum', { elements: ['pending', 'completed', 'failed', 'cancelled'], required: true }], ['createdAt', 'datetime', { required: true }],
    ], indexes: [['transactionId', 'unique', ['transactionId']], ['senderUserId', 'key', ['senderUserId']], ['receiverUserId', 'key', ['receiverUserId']], ['user_id', 'key', ['user_id']], ['transactionType', 'key', ['transactionType']], ['amountLD', 'key', ['amountLD']], ['status', 'key', ['status']], ['createdAt', 'key', ['createdAt']]],
  },
  {
    id: 'creator_earnings', name: 'Creator Earnings', permissions: [],
    attrs: [['userId', 'string', { size: 36, required: true }], ['totalEarningsLD', 'integer', { required: true, defaultValue: 0 }], ['giftsEarningsLD', 'integer', { required: true, defaultValue: 0 }], ['subscriptionsEarningsLD', 'integer', { required: true, defaultValue: 0 }], ['lockedPostsEarningsLD', 'integer', { required: true, defaultValue: 0 }], ['lockedMusicEarningsLD', 'integer', { required: true, defaultValue: 0 }], ['lastUpdated', 'datetime', { required: true }]], indexes: [['userId', 'unique', ['userId']]],
  },
  {
    id: 'locked_content', name: 'Locked Content', permissions: [],
    attrs: [['contentId', 'string', { size: 36, required: true }], ['creatorUserId', 'string', { size: 36, required: true }], ['contentType', 'enum', { elements: ['post', 'music'], required: true }], ['priceCredits', 'float', { required: true, min: 2, max: 10 }], ['isLocked', 'boolean', { required: true, defaultValue: true }], ['createdAt', 'datetime', { required: true }]], indexes: [['contentId', 'unique', ['contentId']], ['creatorUserId', 'key', ['creatorUserId']], ['contentType', 'key', ['contentType']], ['priceCredits', 'key', ['priceCredits']]],
  },
  {
    id: 'subscriptions', name: 'Subscriptions', permissions: [],
    attrs: [['subscriber_id', 'string', { size: 36, required: true }], ['creator_id', 'string', { size: 36, required: true }], ['creator_username', 'string', { size: 64 }], ['subscriber_username', 'string', { size: 64 }], ['price', 'float', { defaultValue: 0 }], ['tier', 'string', { size: 32 }], ['status', 'string', { size: 16, defaultValue: 'ACTIVE' }], ['expires_at', 'datetime']],
    indexes: [['subscriber_id', 'key', ['subscriber_id']], ['creator_id', 'key', ['creator_id']], ['status', 'key', ['status']]],
  },
  {
    id: 'withdraw_requests', name: 'Withdraw Requests', permissions: [],
    attrs: [
      ['userId', 'string', { size: 36, required: true }], ['userName', 'string', { size: 128 }],
      ['username', 'string', { size: 64 }], ['amountCredits', 'float', { required: true, min: 10 }],
      ['amountLD', 'float', { required: true }], ['amountUSD', 'float', { required: true }],
      ['method', 'string', { size: 32, required: true }], ['accountName', 'string', { size: 128, required: true }],
      ['accountNumber', 'string', { size: 128, required: true }], ['status', 'string', { size: 16, required: true, defaultValue: 'pending' }],
      ['reason', 'string', { size: 512 }], ['createdAt', 'datetime', { required: true }],
      ['adminMessage', 'string', { size: 512 }], ['proofImageUrl', 'string', { size: 512 }],
      ['reviewedBy', 'string', { size: 36 }], ['reviewedAt', 'datetime'],
    ],
    indexes: [['userId', 'key', ['userId']], ['status', 'key', ['status']]],
  },
  {
    id: 'withdrawal_locks', name: 'Withdrawal Locks', permissions: [],
    attrs: [['userId', 'string', { size: 36, required: true }], ['expiresAt', 'datetime', { required: true }]],
    indexes: [['userId_unique', 'unique', ['userId']]],
  },
  {
    id: 'platform_fees', name: 'Platform Fees', permissions: [],
    attrs: [['buyerId', 'string', { size: 36, required: true }], ['creatorId', 'string', { size: 36, required: true }], ['amountCredits', 'float', { required: true }], ['purchaseType', 'string', { size: 32, required: true }], ['createdAt', 'datetime', { required: true }]],
    indexes: [['creatorId', 'key', ['creatorId']], ['purchaseType', 'key', ['purchaseType']]],
  },
  {
    id: 'gift_items', name: 'Gift Items', permissions: [Permission.read(Role.users())],
    attrs: [['giftId', 'string', { size: 36, required: true }], ['name', 'string', { size: 128, required: true }], ['priceCredits', 'float', { required: true, min: 0.01 }], ['category', 'string', { size: 64, required: true }], ['iconUrl', 'string', { size: 512, required: true }], ['isActive', 'boolean', { required: true, defaultValue: true }]], indexes: [['giftId', 'unique', ['giftId']], ['priceCredits', 'key', ['priceCredits']], ['category', 'key', ['category']]],
  },
];

async function createAttribute(collectionId, [key, type, options]) {
  try {
    const { size, required = false, defaultValue = null, min = null, max = null, elements } = options;
    if (type === 'string') await databases.createStringAttribute(databaseId, collectionId, key, size, required, defaultValue);
    if (type === 'integer') await databases.createIntegerAttribute(databaseId, collectionId, key, required, min, max, defaultValue);
    if (type === 'float') await databases.createFloatAttribute(databaseId, collectionId, key, required, min, max, defaultValue);
    if (type === 'boolean') await databases.createBooleanAttribute(databaseId, collectionId, key, required, defaultValue);
    if (type === 'datetime') await databases.createDatetimeAttribute(databaseId, collectionId, key, required, defaultValue);
    if (type === 'enum') await databases.createEnumAttribute(databaseId, collectionId, key, elements, required, defaultValue);
  } catch (error) {
    if (error?.code !== 409) throw error;
  }
}

async function ensureSchema(schema) {
  try {
    await databases.createCollection(databaseId, schema.id, schema.name, schema.permissions, false, true);
    console.log(`Created collection ${schema.id}`);
  } catch (error) {
    if (error?.code !== 409) throw error;
  }
  for (const attribute of schema.attrs) {
    await createAttribute(schema.id, attribute);
    await sleep(100);
  }
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    const collection = await databases.getCollection(databaseId, schema.id);
    if ((collection.attributes || []).every((attribute) => attribute.status === 'available')) break;
    await sleep(1500);
  }
  for (const [key, type, attributes] of schema.indexes) {
    try { await databases.createIndex(databaseId, schema.id, key, type, attributes); } catch (error) { if (error?.code !== 409) throw error; }
  }
}

for (const schema of schemas) await ensureSchema(schema);
console.log('Appwrite monetization schema is ready');