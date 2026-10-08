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

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function sessionScope(session: string): Promise<string | null> {
  try {
    const bytes = new TextEncoder().encode(session);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
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

  const entries = await new Promise<CachedResponse[]>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result as CachedResponse[]);
    request.onerror = () => reject(request.error);
  });
  entries.sort((left, right) => left.cachedAt - right.cachedAt);
  let totalBytes = entries.reduce(
    (total, item) => total + new TextEncoder().encode(item.body).byteLength,
    0,
  );
  const expiredKeys: string[] = [];
  while (entries.length - expiredKeys.length > MAX_ENTRIES || totalBytes > MAX_TOTAL_BYTES) {
    const oldest = entries[expiredKeys.length];
    if (!oldest) break;
    expiredKeys.push(oldest.key);
    totalBytes -= new TextEncoder().encode(oldest.body).byteLength;
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
  if (!scope || typeof indexedDB === 'undefined') return fetchFresh();

  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch {
    return fetchFresh();
  }

  const key = `${scope}:${url}`;
  let cached: CachedResponse | undefined;
  try {
    cached = await readEntry(db, key);
  } catch {
    db.close();
    return fetchFresh();
  }

  if (cached && Date.now() - cached.cachedAt < FRESH_TTL_MS) {
    db.close();
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
      if (new TextEncoder().encode(body).byteLength <= MAX_RESPONSE_SIZE) {
        try {
          await writeEntry(db, {
            key,
            body,
            status: response.status,
            statusText: response.statusText,
            headers: Array.from(response.headers.entries()),
            cachedAt: Date.now(),
          });
        } catch {}
      }
    }
    db.close();
    return response;
  } catch (error) {
    db.close();
    if (cached && Date.now() - cached.cachedAt < OFFLINE_TTL_MS) {
      return responseFromEntry(cached);
    }
    throw error;
  }
}

export async function clearApiResponseCache(): Promise<void> {
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
    db.close();
  } catch {}
}