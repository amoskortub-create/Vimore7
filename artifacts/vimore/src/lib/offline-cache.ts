const CACHE_MAX_AGE_MS = 5 * 60 * 60 * 1000; // 5 hours

const KEYS = {
  USER:        'vm_offline_user',
  POSTS:       'vm_offline_posts',
  CONNECTIONS: 'vm_offline_connections',
  SONGS:       'vm_offline_songs',
  ALBUMS:      'vm_offline_albums',
};

interface TimestampedEntry<T> {
  data: T;
  savedAt: number;
}

function save(key: string, data: unknown) {
  try {
    const entry: TimestampedEntry<unknown> = { data, savedAt: Date.now() };
    localStorage.setItem(key, JSON.stringify(entry));
  } catch { }
}

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    if (!v) return fallback;
    const parsed = JSON.parse(v);
    if (parsed && typeof parsed === 'object' && 'savedAt' in parsed && 'data' in parsed) {
      const entry = parsed as TimestampedEntry<T>;
      if (Date.now() - entry.savedAt > CACHE_MAX_AGE_MS) {
        localStorage.removeItem(key);
        return fallback;
      }
      return entry.data;
    }
    return parsed as T;
  } catch { return fallback; }
}

export const offlineCache = {
  saveUser:        (user: unknown)        => save(KEYS.USER, user),
  getUser:         ()                     => load<unknown | null>(KEYS.USER, null),
  clearUser:       ()                     => { try { localStorage.removeItem(KEYS.USER); } catch { } },

  savePosts:       (posts: unknown[])     => save(KEYS.POSTS, posts),
  getPosts:        ()                     => load<unknown[]>(KEYS.POSTS, []),

  saveConnections: (conns: unknown[])     => save(KEYS.CONNECTIONS, conns),
  getConnections:  ()                     => load<unknown[]>(KEYS.CONNECTIONS, []),

  saveSongs:       (songs: unknown[])     => save(KEYS.SONGS, songs),
  getSongs:        ()                     => load<unknown[]>(KEYS.SONGS, []),

  saveAlbums:      (albums: unknown[])    => save(KEYS.ALBUMS, albums),
  getAlbums:       ()                     => load<unknown[]>(KEYS.ALBUMS, []),
};

// ─── Extended cache helpers ────────────────────────────────────────────────────

export const OFFLINE_KEYS = {
  // Feeds
  REELS:                'vimore_videos_cache_v1',
  VIDEOS:               'vimore_videos_cache_v1',
  HOME_FEED:            'vimore_feed_cache_v1',
  MUSIC:                'vimore_music_cache_v1',
  MUSIC_PLAYED:         'vimore_music_played_v1',

  // Conversations
  MESSAGES_CONTACTS:    'vimore_messages_contacts_v1',
  MESSAGES_CHAT:        'vimore_messages_chat_v1',        // per-chat messages, keyed by chatId

  // Friends
  FRIENDS:              'vimore_friends_cache_v1',
  FRIENDS_DISCOVERY:    'vimore_friends_discovery_v1',
  FRIENDS_CONFIRM:      'vimore_friends_confirm_v1',
  FRIENDS_PENDING:      'vimore_friends_pending_v1',

  // Pages / hubs
  PROFILE:              'vimore_profile_cache_v1',
  ACTIVITY:             'vimore_activity_cache_v1',
  SEARCH:               'vimore_search_cache_v1',
  MENU:                 'vimore_menu_cache_v1',
  CURRENCY_DATA:        'vimore_currency_data_v1',
  EARNINGS_DATA:        'vimore_earnings_data_v1',
  MARKETPLACE_STORES:   'vimore_marketplace_stores_v1',
  STORE_DATA:           'vimore_store_data_v1',
  MTL_DATA:             'vimore_mtl_data_v1',
  TICKETS:              'vimore_tickets_cache_v1',
};

export const FEED_CACHE_TIME_KEY = 'vimore_feed_cache_time';

export interface FeedCache<T> {
  posts: T[];
  savedAt: number | null;
  indexedDB?: boolean;
}

const FEED_CACHE_DB = 'vimore-device-cache-v1';
const FEED_CACHE_STORE = 'feed';

function openFeedCacheDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(FEED_CACHE_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(FEED_CACHE_STORE)) {
        request.result.createObjectStore(FEED_CACHE_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open feed cache database'));
  });
}

function writeFeedCacheToIndexedDB<T>(posts: T[], savedAt: number): Promise<void> {
  return openFeedCacheDatabase().then(database => new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(FEED_CACHE_STORE, 'readwrite');
    transaction.objectStore(FEED_CACHE_STORE).put({ posts, savedAt }, 'home');
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(transaction.error || new Error('Could not save feed cache')); };
  }));
}

function readFeedCacheFromIndexedDB<T>(): Promise<FeedCache<T> | null> {
  return openFeedCacheDatabase().then(database => new Promise<FeedCache<T> | null>((resolve, reject) => {
    const transaction = database.transaction(FEED_CACHE_STORE, 'readonly');
    const request = transaction.objectStore(FEED_CACHE_STORE).get('home');
    request.onsuccess = () => {
      const saved = request.result;
      resolve(saved && Array.isArray(saved.posts)
        ? { posts: saved.posts as T[], savedAt: Number(saved.savedAt) || null, indexedDB: true }
        : null);
    };
    request.onerror = () => reject(request.error || new Error('Could not read feed cache'));
    transaction.oncomplete = () => database.close();
  }));
}

export function loadFeedCache<T>(): FeedCache<T> {
  if (typeof window === 'undefined') return { posts: [], savedAt: null };
  try {
    const raw = localStorage.getItem(OFFLINE_KEYS.HOME_FEED);
    if (!raw) return { posts: [], savedAt: null };
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return { posts: parsed as T[], savedAt: null };
    if (parsed && Array.isArray(parsed.posts)) {
      return {
        posts: parsed.posts as T[],
        savedAt: Number(parsed.savedAt) || Number(localStorage.getItem(FEED_CACHE_TIME_KEY)) || null,
        indexedDB: parsed.indexedDB === true,
      };
    }
    if (parsed && Array.isArray(parsed.data)) {
      return {
        posts: parsed.data as T[],
        savedAt: Number(parsed.savedAt) || Number(localStorage.getItem(FEED_CACHE_TIME_KEY)) || null,
      };
    }
  } catch {}
  return { posts: [], savedAt: null };
}

export async function loadFeedCacheAsync<T>(): Promise<FeedCache<T>> {
  const cached = loadFeedCache<T>();
  if (!cached.indexedDB) return cached;
  try {
    return await readFeedCacheFromIndexedDB<T>() || cached;
  } catch (error) {
    console.warn('[offline-cache] IndexedDB feed read failed; using local preview.', error);
    return cached;
  }
}

export function saveFeedCache<T>(posts: T[]): void {
  if (typeof window === 'undefined') return;
  const savedAt = Date.now();
  try {
    const persistentUrl = (value: unknown) =>
      typeof value === 'string' && !value.startsWith('data:') && !value.startsWith('blob:') ? value : undefined;
    const compactPosts = posts.slice(0, 30).map((post: any) => ({
      $id: post.$id,
      $createdAt: post.$createdAt,
      user: post.user ? {
        $id: post.user.$id,
        name: post.user.name,
        username: post.user.username,
        avatar: persistentUrl(post.user.avatar),
        cover: persistentUrl(post.user.cover),
        isVerified: post.user.isVerified,
        followers: post.user.followers,
        role: post.user.role,
      } : post.user,
      content: typeof post.content === 'string' ? post.content.slice(0, 2000) : '',
      image: persistentUrl(post.image),
      images: Array.isArray(post.images) ? post.images.map(persistentUrl).filter(Boolean) : undefined,
      videoUrl: persistentUrl(post.videoUrl),
      likes: post.likes,
      unlikes: post.unlikes,
      comments: post.comments,
      shares: post.shares,
      views: post.views,
      time: post.time,
      type: post.type,
      isBoosted: post.isBoosted,
      isLocked: post.isLocked,
      unlockPrice: post.unlockPrice,
      linkPreview: post.linkPreview ? {
        ...post.linkPreview,
        image: persistentUrl(post.linkPreview.image),
        favicon: persistentUrl(post.linkPreview.favicon),
      } : post.linkPreview,
    }));
    const entry = JSON.stringify({ posts: compactPosts, savedAt });
    if (new Blob([entry]).size > 5 * 1024 * 1024) {
      const localPreview = JSON.stringify({ posts: compactPosts.slice(0, 5), savedAt, indexedDB: true });
      localStorage.setItem(OFFLINE_KEYS.HOME_FEED, localPreview);
      void writeFeedCacheToIndexedDB(compactPosts, savedAt).catch(error => {
        console.warn('[offline-cache] IndexedDB feed write failed; retaining local preview.', error);
      });
    } else {
      localStorage.setItem(OFFLINE_KEYS.HOME_FEED, entry);
    }
    localStorage.setItem(FEED_CACHE_TIME_KEY, String(savedAt));
  } catch {}
}

/** Save up to maxItems items to localStorage with a timestamp. */
export function saveCache<T>(key: string, items: T[], maxItems = 15): void {
  if (typeof window === 'undefined') return;
  try {
    const savedAt = Date.now();
    const entry: TimestampedEntry<T[]> = { data: items.slice(0, maxItems), savedAt };
    localStorage.setItem(key, JSON.stringify(entry));
    localStorage.setItem(`${key}_time`, String(savedAt));
  } catch {}
}

export function isCacheFresh(key: string, maxAgeMs = 5 * 60 * 1000): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    const savedAt = Number(parsed?.savedAt) || Number(localStorage.getItem(`${key}_time`)) || 0;
    return savedAt > 0 && Date.now() - savedAt < maxAgeMs;
  } catch {
    return false;
  }
}

/** Load items saved with saveCache. Returns [] on any failure or expiry. */
export function loadCache<T>(key: string): T[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && 'savedAt' in parsed && 'data' in parsed) {
      const entry = parsed as TimestampedEntry<T[]>;
      if (Date.now() - entry.savedAt > CACHE_MAX_AGE_MS) {
        localStorage.removeItem(key);
        return [];
      }
      return Array.isArray(entry.data) ? entry.data : [];
    }
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

/**
 * Save a single object (not an array) to localStorage with a timestamp.
 * Use for page-level data like profile, currency rates, earnings summary, etc.
 */
export function saveKeyValue<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    const savedAt = Date.now();
    const entry: TimestampedEntry<T> = { data: value, savedAt };
    localStorage.setItem(key, JSON.stringify(entry));
    localStorage.setItem(`${key}_time`, String(savedAt));
  } catch {}
}

/**
 * Load a single object saved with saveKeyValue. Returns null if missing or expired.
 */
export function loadKeyValue<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && 'savedAt' in parsed && 'data' in parsed) {
      const entry = parsed as TimestampedEntry<T>;
      if (Date.now() - entry.savedAt > CACHE_MAX_AGE_MS) {
        localStorage.removeItem(key);
        return null;
      }
      return entry.data;
    }
    return parsed as T;
  } catch {
    return null;
  }
}

/**
 * Save messages for a specific chat conversation.
 * Key is scoped per chatId so different conversations don't overwrite each other.
 */
export function saveChatMessages<T>(chatId: string, messages: T[], maxItems = 50): void {
  if (typeof window === 'undefined' || !chatId) return;
  saveCache<T>(`${OFFLINE_KEYS.MESSAGES_CHAT}_${chatId}`, messages, maxItems);
}

/**
 * Load cached messages for a specific chat conversation.
 */
export function loadChatMessages<T>(chatId: string): T[] {
  if (typeof window === 'undefined' || !chatId) return [];
  return loadCache<T>(`${OFFLINE_KEYS.MESSAGES_CHAT}_${chatId}`);
}

// ─── Offline message outbox ───────────────────────────────────────────────────
// Messages the user tried to send while offline are queued here and retried on reconnect.

const OUTBOX_KEY = 'vimore_message_outbox_v1';

export interface OutboxMessage {
  id: string;           // client-generated UUID
  recipientId: string;
  clusterId?: string;
  text?: string;
  mediaUrl?: string;
  mediaType?: string;
  queuedAt: number;
  retries: number;
}

export function getOutboxMessages(): OutboxMessage[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(OUTBOX_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as OutboxMessage[];
  } catch { return []; }
}

export function enqueueOutboxMessage(msg: Omit<OutboxMessage, 'id' | 'queuedAt' | 'retries'>): OutboxMessage {
  const entry: OutboxMessage = {
    ...msg,
    id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
    queuedAt: Date.now(),
    retries: 0,
  };
  try {
    const current = getOutboxMessages();
    current.push(entry);
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(current.slice(-100)));
  } catch {}
  return entry;
}

export function removeOutboxMessage(id: string): void {
  try {
    const current = getOutboxMessages().filter(m => m.id !== id);
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(current));
  } catch {}
}

export function incrementOutboxRetry(id: string): void {
  try {
    const current = getOutboxMessages().map(m =>
      m.id === id ? { ...m, retries: m.retries + 1 } : m
    );
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(current));
  } catch {}
}

/**
 * Clears every known offline/feed cache from localStorage AND tells the
 * service worker to delete all its caches too.
 */
export function clearAllLocalCaches(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') { resolve(); return; }

    const allKeys = [
      ...Object.values(KEYS),
      ...Object.values(OFFLINE_KEYS).flatMap(key => [key, `${key}_time`]),
      FEED_CACHE_TIME_KEY,
      OUTBOX_KEY,
      'vimore_marketplace_dir_v1',
      'vimore_product_grid_v1',
      'vimore_search_history',
      'vimore_drafts',
    ];
    for (const k of allKeys) {
      try { localStorage.removeItem(k); } catch {}
    }

    try {
      indexedDB.deleteDatabase('vimore-db-cache');
    } catch {}

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready
        .then(reg => {
          if (reg.active) {
            const channel = new MessageChannel();
            channel.port1.onmessage = () => resolve();
            reg.active.postMessage({ type: 'CLEAR_ALL_CACHE' }, [channel.port2]);
            setTimeout(resolve, 2000);
          } else {
            resolve();
          }
        })
        .catch(() => resolve());
    } else {
      resolve();
    }
  });
}

/**
 * Tell the service worker to pre-fetch and store these URLs in the
 * long-lived (24 h) pinned media cache for offline use.
 */
export function pinMediaInSW(urls: string[]): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  const valid = urls.filter(u => Boolean(u) && (u.startsWith('http') || u.startsWith('/')));
  if (!valid.length) return;
  navigator.serviceWorker.ready
    .then(reg => { reg.active?.postMessage({ type: 'PIN_MEDIA', urls: valid }); })
    .catch(() => {});
}

/**
 * Ask the service worker to pre-cache the given routes for offline navigation.
 */
export function precacheRoutes(routes: string[]): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.ready
    .then(reg => { reg.active?.postMessage({ type: 'PRECACHE_ROUTES', routes }); })
    .catch(() => {});
}
