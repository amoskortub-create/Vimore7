import {
  databases,
  storage,
  DATABASE_ID,
  COL,
  BUCKET,
  ID,
  Query,
  Permission,
  Role,
  getFilePreview,
} from './appwrite';
import { uploadViaClient } from './upload';
import { CREDIT_PRICES } from './credit-pricing';
import { authFetch } from './auth-fetch';

export const STORE_CATEGORIES = [
  'Fashion & Clothing',
  'Electronics & Gadgets',
  'Food & Drinks',
  'Beauty & Health',
  'Home & Living',
  'Services',
  'Farming & Agriculture',
  'Books & Education',
  'Sports & Fitness',
  'Art & Crafts',
  'Other',
] as const;

export type StoreCategory = (typeof STORE_CATEGORIES)[number];

export const STORE_BOOST_DIAMONDS_PER_DAY = CREDIT_PRICES.storeBoostPerDay;
export const STORE_BOOST_MAX_DAYS = 30;

export interface StoreDoc {
  $id: string;
  $createdAt?: string;
  owner_id: string;
  owner_username: string;
  store_name: string;
  logo_file_id?: string | null;
  description: string;
  motto: string;
  category: StoreCategory;
  boost_until?: string | null;
  is_active?: boolean;
}

function mapStore(doc: any): StoreDoc {
  const category = STORE_CATEGORIES.includes(doc.category)
    ? (doc.category as StoreCategory)
    : 'Other';
  return {
    $id: doc.$id,
    $createdAt: doc.$createdAt,
    owner_id: doc.owner_id || '',
    owner_username: doc.owner_username || '',
    store_name: doc.store_name || '',
    logo_file_id: doc.logo_file_id || null,
    description: doc.description || '',
    motto: doc.motto || '',
    category,
    boost_until: doc.boost_until || null,
    is_active: doc.is_active !== false,
  };
}

export function categoryToSlug(category: string): string {
  return category
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function slugToCategory(slug: string): StoreCategory | null {
  const normalized = (slug || '').toLowerCase().trim();
  const match = STORE_CATEGORIES.find((cat) => categoryToSlug(cat) === normalized);
  return match ?? null;
}

export function getStoreLogoUrl(fileId: string): string {
  if (!fileId) return '';
  return getFilePreview(BUCKET.STORE_LOGOS, fileId, {
    width: 256,
    height: 256,
    quality: 75,
    output: 'webp',
  });
}

export function isStoreBoosted(store: Pick<StoreDoc, 'boost_until'>): boolean {
  if (!store.boost_until) return false;
  return new Date(store.boost_until).getTime() > Date.now();
}

export async function listAllStores(limit = 200): Promise<StoreDoc[]> {
  try {
    const res = await databases.listDocuments(DATABASE_ID, COL.STORES, [
      Query.orderDesc('$createdAt'),
      Query.limit(limit),
    ]);
    return res.documents.map(mapStore);
  } catch {
    return [];
  }
}

export async function listStoresByCategory(
  category: StoreCategory,
  limit = 100
): Promise<StoreDoc[]> {
  try {
    const res = await databases.listDocuments(DATABASE_ID, COL.STORES, [
      Query.equal('category', category),
      Query.orderDesc('$createdAt'),
      Query.limit(limit),
    ]);
    return res.documents.map(mapStore);
  } catch {
    return [];
  }
}

export async function getStore(storeId: string): Promise<StoreDoc | null> {
  if (!storeId) return null;
  try {
    const doc = await databases.getDocument(DATABASE_ID, COL.STORES, storeId);
    return mapStore(doc);
  } catch {
    return null;
  }
}

export async function getMyStore(ownerId: string): Promise<StoreDoc | null> {
  if (!ownerId) return null;
  try {
    const res = await databases.listDocuments(DATABASE_ID, COL.STORES, [
      Query.equal('owner_id', ownerId),
      Query.limit(1),
    ]);
    if (!res.documents.length) return null;
    return mapStore(res.documents[0]);
  } catch {
    return null;
  }
}

export async function createStore(input: {
  owner_id: string;
  owner_username: string;
  store_name: string;
  logo_file?: File | null;
  description: string;
  motto?: string;
  category: StoreCategory;
}): Promise<StoreDoc> {
  let logoFileId: string | null = null;
  if (input.logo_file) {
    logoFileId = await uploadViaClient(input.logo_file, BUCKET.STORE_LOGOS);
  }

  const doc = await databases.createDocument(
    DATABASE_ID,
    COL.STORES,
    ID.unique(),
    {
      owner_id: input.owner_id,
      owner_username: input.owner_username,
      store_name: input.store_name.trim(),
      logo_file_id: logoFileId,
      description: input.description.trim(),
      motto: (input.motto || '').trim(),
      category: input.category,
      is_active: true,
    },
    [
      Permission.read(Role.any()),
      Permission.update(Role.user(input.owner_id)),
      Permission.delete(Role.user(input.owner_id)),
    ]
  );

  return mapStore(doc);
}

export async function updateStore(
  storeId: string,
  ownerId: string,
  input: {
    store_name: string;
    logo_file?: File | null;
    description: string;
    motto?: string;
    category: StoreCategory;
  },
  existingLogoFileId?: string | null
): Promise<StoreDoc> {
  let logoFileId = existingLogoFileId || null;
  if (input.logo_file) {
    logoFileId = await uploadViaClient(input.logo_file, BUCKET.STORE_LOGOS);
    if (existingLogoFileId && existingLogoFileId !== logoFileId) {
      storage.deleteFile(BUCKET.STORE_LOGOS, existingLogoFileId).catch(() => {});
    }
  }

  const doc = await databases.updateDocument(DATABASE_ID, COL.STORES, storeId, {
    owner_id: ownerId,
    store_name: input.store_name.trim(),
    logo_file_id: logoFileId,
    description: input.description.trim(),
    motto: (input.motto || '').trim(),
    category: input.category,
  });

  return mapStore(doc);
}

export async function boostStoreWithDiamonds(
  storeId: string,
  _userId: string,
  days: number,
  currentBalance: number
): Promise<string> {
  const safeDays = Math.min(STORE_BOOST_MAX_DAYS, Math.max(1, Math.floor(days)));
  const cost = safeDays * STORE_BOOST_DIAMONDS_PER_DAY;
  if (currentBalance < cost) {
    throw new Error(`Insufficient credits: need ${cost} Credits.`);
  }

  const res = await authFetch('/api/transaction/boost', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'STORE', targetId: storeId, days: safeDays }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || 'Store boost failed');
  }
  return data.boostExpiry;
}
