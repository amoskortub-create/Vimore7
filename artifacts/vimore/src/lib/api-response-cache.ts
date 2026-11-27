const DB_NAME = 'vimore-api-response-cache';
const DB_VERSION = 1;
const STORE_NAME = 'responses';
const FRESH_TTL_MS = 30_000;
const OFFLINE_TTL_MS = 5 * 60 * 60 * 1000;
const MAX_ENTRIES = 100;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
const MAX_RESPONSE_SIZE = 1024 * 1024;

interface CachedResponse {
  key: string;
  body: string;
  status: number;
  statusText: string;
  headers: [string, string][];
  cachedAt: number;
}

const memoryCache = new Map<string, CachedResponse>();
const sessionScopeCache = new Map<string, string>();
let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onclose = () => { dbPromise = null; };
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
  });
  return dbPromise;
}

async function sessionScope(session: string): Promise<string | null> {
  const existing = sessionScopeCache.get(session);
  if (existing) return existing;
  try {
    const bytes = new TextEncoder().encode(session);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const scope = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    sessionScopeCache.set(session, scope);
    return scope;
  } catch {
    return null;
  }
}

function readEntry(db: IDBDatabase, key: string): Promise<CachedResponse | undefined> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result as CachedResponse | undefined);
    request.onerror = () => reject(request.error);
  });
}

function responseFromEntry(entry: CachedResponse): Response {
  return new Response(entry.body, {
    status: entry.status,
    statusText: entry.statusText,
    headers: entry.headers,
  });
}

async function writeEntry(db: IDBDatabase, entry: CachedResponse): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(entry);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });

  if (memoryCache.size > MAX_ENTRIES) {
    memoryCache.clear();
  }

  const entries = await new Promise<CachedResponse[]>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result as CachedResponse[]);
    request.onerror = () => reject(request.error);
  });
  if (entries.length <= MAX_ENTRIES) return;

  entries.sort((left, right) => left.cachedAt - right.cachedAt);
  let totalBytes = entries.reduce(
    (total, item) => total + item.body.length * 2,
    0,
  );
  const expiredKeys: string[] = [];
  while (entries.length - expiredKeys.length > MAX_ENTRIES || totalBytes > MAX_TOTAL_BYTES) {
    const oldest = entries[expiredKeys.length];
    if (!oldest) break;
    expiredKeys.push(oldest.key);
    totalBytes -= oldest.body.length * 2;
  }
  if (expiredKeys.length === 0) return;

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    expiredKeys.forEach((key) => store.delete(key));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function fetchCachedApiResponse(
  url: string,
  session: string,
  fetchFresh: () => Promise<Response>,
): Promise<Response> {
  const scope = await sessionScope(session);
  if (!scope) return fetchFresh();

  const key = `${scope}:${url}`;
  const memHit = memoryCache.get(key);
  if (memHit && Date.now() - memHit.cachedAt < FRESH_TTL_MS) {
    return responseFromEntry(memHit);
  }

  let db: IDBDatabase | null = null;
  let cached: CachedResponse | undefined = memHit;
  if (typeof indexedDB !== 'undefined') {
    try {
      db = await openDb();
      if (!cached) {
        cached = await readEntry(db, key);
        if (cached) memoryCache.set(key, cached);
      }
    } catch {
      db = null;
    }
  }

  if (cached && Date.now() - cached.cachedAt < FRESH_TTL_MS) {
    return responseFromEntry(cached);
  }

  try {
    const response = await fetchFresh();
    const cacheControl = response.headers.get('Cache-Control') || '';
    const contentType = response.headers.get('Content-Type') || '';
    if (
      response.status === 200 &&
      response.ok &&
      contentType.includes('application/json') &&
      !/\bno-store\b/i.test(cacheControl)
    ) {
      const body = await response.clone().text();
      if (body.length * 2 <= MAX_RESPONSE_SIZE) {
        const entry: CachedResponse = {
          key,
          body,
          status: response.status,
          statusText: response.statusText,
          headers: Array.from(response.headers.entries()),
          cachedAt: Date.now(),
        };
        memoryCache.set(key, entry);
        if (db) {
          writeEntry(db, entry).catch(() => {});
        }
      }
    }
    return response;
  } catch (error) {
    if (cached && Date.now() - cached.cachedAt < OFFLINE_TTL_MS) {
      return responseFromEntry(cached);
    }
    throw error;
  }
}

export async function clearApiResponseCache(): Promise<void> {
  memoryCache.clear();
  if (typeof indexedDB === 'undefined') return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } catch {}
}