import 'server-only';
import crypto from 'crypto';
import { getAdminDatabases, getAdminUsers, DATABASE_ID } from './appwrite-server';
import { Query } from 'node-appwrite';

export const OAUTH_COL = {
  CLIENTS:       'oauth_clients',
  AUTH_CODES:    'oauth_auth_codes',
  ACCESS_TOKENS: 'oauth_access_tokens',
};

export const SUPPORTED_SCOPES: Record<string, string> = {
  profile:      'Access your name, username, and profile picture',
  email:        'Access your email address',
  'read:posts': 'Read your public posts and activity',
};

export function generateToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export function hashSecret(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

export function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a || '', 'utf8');
  const bufB = Buffer.from(b || '', 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function isValidRedirectUri(uri: string): boolean {
  try {
    const parsed = new URL(uri);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    if (parsed.hash) return false;
    return true;
  } catch {
    return false;
  }
}

export function isSafeHttpUrl(uri: string): boolean {
  if (!uri) return true;
  try {
    const parsed = new URL(uri);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function normalizeScopes(scopeInput?: string): string {
  const requested = String(scopeInput || '')
    .split(/\s+/)
    .map((s) => s.trim())
    .filter((s) => Boolean(s) && Boolean(SUPPORTED_SCOPES[s]));
  const deduped = Array.from(new Set(requested));
  return deduped.length > 0 ? deduped.join(' ') : 'profile';
}

// ─── Clients ──────────────────────────────────────────────────────────────────
// Document $id === client_id — allows direct getDocument() lookup.

export async function createOAuthClient(data: {
  name: string;
  description?: string;
  logo_url?: string;
  website_url?: string;
  redirect_uris: string[];
  owner_id: string;
}) {
  const db = getAdminDatabases();
  const client_id = 'vimore_' + generateToken(8);        // 23 chars — safe as $id
  const client_secret_raw = generateToken(24);
  const client_secret_hash = hashSecret(client_secret_raw);

  await db.createDocument(DATABASE_ID, OAUTH_COL.CLIENTS, client_id, {
    client_id,
    client_secret: client_secret_hash,
    name: data.name,
    description: data.description || '',
    logo_url: data.logo_url || '',
    website_url: data.website_url || '',
    redirect_uris: data.redirect_uris,
    owner_id: data.owner_id,
    created_at: new Date().toISOString(),
  });

  return { client_id, client_secret: client_secret_raw };
}

export async function getOAuthClient(client_id: string) {
  const db = getAdminDatabases();
  try {
    return await db.getDocument(DATABASE_ID, OAUTH_COL.CLIENTS, client_id);
  } catch {
    return null;
  }
}

export async function listOAuthClients(owner_id: string) {
  const db = getAdminDatabases();
  try {
    const res = await db.listDocuments(DATABASE_ID, OAUTH_COL.CLIENTS, [
      Query.equal('owner_id', owner_id),
      Query.limit(100),
    ]);
    return res.documents;
  } catch {
    return [];
  }
}

export async function deleteOAuthClient(client_id: string, owner_id: string) {
  const db = getAdminDatabases();
  const doc = await db.getDocument(DATABASE_ID, OAUTH_COL.CLIENTS, client_id);
  if (doc.owner_id !== owner_id) throw new Error('Unauthorized');
  await db.deleteDocument(DATABASE_ID, OAUTH_COL.CLIENTS, client_id);
}

// ─── Auth Codes ───────────────────────────────────────────────────────────────
// Document $id === code — allows direct getDocument() lookup.
// generateToken(16) = 32 hex chars, safely within Appwrite's 36-char $id limit.

export async function createAuthCode(data: {
  client_id: string;
  user_id: string;
  scopes: string;
  redirect_uri: string;
}) {
  const db = getAdminDatabases();
  const code = generateToken(16);                         // 32 chars — safe as $id
  const expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const normalized = normalizeScopes(data.scopes);

  await db.createDocument(DATABASE_ID, OAUTH_COL.AUTH_CODES, code, {
    code,
    client_id: data.client_id,
    user_id: data.user_id,
    scope: normalized,
    scopes: normalized,
    redirect_uri: data.redirect_uri,
    expires_at,
    used: false,
  });

  return code;
}

export async function exchangeAuthCode(
  code: string,
  client_id: string,
  redirect_uri: string,
  client_secret: string,
) {
  const db = getAdminDatabases();

  const client = await getOAuthClient(client_id);
  if (!client) return { error: 'invalid_client' };
  if (!constantTimeEquals(String(client.client_secret || ''), hashSecret(client_secret))) {
    return { error: 'invalid_client' };
  }

  let doc: any;
  try {
    doc = await db.getDocument(DATABASE_ID, OAUTH_COL.AUTH_CODES, code);
  } catch {
    return { error: 'invalid_grant' };
  }

  if (doc.client_id !== client_id)         return { error: 'invalid_grant' };
  if (doc.used)                            return { error: 'invalid_grant' };
  if (new Date(doc.expires_at) < new Date()) return { error: 'invalid_grant' };
  if (doc.redirect_uri !== redirect_uri)   return { error: 'invalid_grant' };

  await db.updateDocument(DATABASE_ID, OAUTH_COL.AUTH_CODES, code, { used: true });

  const token = generateToken(16);                        // 32 chars — safe as $id
  const expires_at = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const grantedScopes = normalizeScopes(doc.scopes || doc.scope);

  await db.createDocument(DATABASE_ID, OAUTH_COL.ACCESS_TOKENS, token, {
    token,
    client_id,
    user_id: doc.user_id,
    scope: grantedScopes,
    scopes: grantedScopes,
    expires_at,
    revoked: false,
  });

  return { token, user_id: doc.user_id, scopes: grantedScopes, expires_at };
}

// ─── Access Tokens ────────────────────────────────────────────────────────────
// Document $id === token — allows direct getDocument() lookup.

export async function verifyAccessToken(token: string) {
  const db = getAdminDatabases();
  try {
    const doc = await db.getDocument(DATABASE_ID, OAUTH_COL.ACCESS_TOKENS, token);
    if (doc.revoked) return null;
    if (new Date(doc.expires_at) < new Date()) return null;
    return {
      user_id:   doc.user_id as string,
      scopes:    (doc.scopes || doc.scope || 'profile') as string,
      client_id: doc.client_id as string,
    };
  } catch {
    return null;
  }
}

export async function revokeAccessToken(token: string) {
  const db = getAdminDatabases();
  try {
    await db.updateDocument(DATABASE_ID, OAUTH_COL.ACCESS_TOKENS, token, { revoked: true });
  } catch {}
}

export async function listUserAccessTokens(user_id: string) {
  const db = getAdminDatabases();
  try {
    const res = await db.listDocuments(DATABASE_ID, OAUTH_COL.ACCESS_TOKENS, [
      Query.equal('user_id', user_id),
      Query.limit(100),
    ]);
    const now = new Date();
    return res.documents.filter(
      (d: any) => !d.revoked && (!d.expires_at || new Date(d.expires_at) > now)
    );
  } catch {
    return [];
  }
}

export async function revokeUserClientTokens(user_id: string, client_id: string): Promise<number> {
  const db = getAdminDatabases();
  const res = await db.listDocuments(DATABASE_ID, OAUTH_COL.ACCESS_TOKENS, [
    Query.equal('user_id', user_id),
    Query.equal('client_id', client_id),
    Query.limit(100),
  ]);
  const active = res.documents.filter((d: any) => !d.revoked);
  for (const doc of active) {
    await revokeAccessToken(doc.$id);
  }
  return active.length;
}

// ─── User Profile ─────────────────────────────────────────────────────────────

export async function getUserProfile(user_id: string) {
  const db = getAdminDatabases();
  try {
    return await db.getDocument(DATABASE_ID, 'users', user_id);
  } catch {
    try {
      const users = getAdminUsers();
      return await users.get(user_id);
    } catch {
      return null;
    }
  }
}
