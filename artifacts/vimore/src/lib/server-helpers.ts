import 'server-only';
import type { NextRequest } from 'next/server';
import { Query, ID } from 'node-appwrite';
import { getAdminDatabases, DATABASE_ID } from './appwrite-server';
import { getSessionUser, type SessionUser } from './session';
import { COL } from './appwrite';

export const APPWRITE_ENDPOINT = (
  process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://appwrite.mediatechliberia.online/v1'
).replace(/\/$/, '');
export const APPWRITE_PROJECT_ID =
  process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || 'vimore123';

export type AdminRole = 'SUPER' | 'FINANCIAL' | 'MODERATOR';
export const ADMIN_ROLES: AdminRole[] = ['SUPER', 'FINANCIAL', 'MODERATOR'];

export function extractSessionCookie(setCookieHeader: string | null, projectId = APPWRITE_PROJECT_ID): string {
  if (!setCookieHeader) return '';
  const escaped = projectId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = setCookieHeader.match(new RegExp(`a_session_${escaped}=([^;,\\s]+)`));
  return match ? decodeURIComponent(match[1]) : '';
}

export function isAccountDeleted(profileDoc: any): boolean {
  if (!profileDoc) return false;
  return Boolean(
    profileDoc.is_deleted === true ||
    String(profileDoc.status || '').toLowerCase() === 'deleted'
  );
}

export async function verifyUserPassword(email: string, password: string): Promise<boolean> {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail || !password) return false;
  try {
    const res = await fetch(`${APPWRITE_ENDPOINT}/account/sessions/email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Appwrite-Project': APPWRITE_PROJECT_ID,
      },
      body: JSON.stringify({ email: cleanEmail, password }),
      cache: 'no-store',
    });
    if (!res.ok) return false;
    const data = await res.json().catch(() => ({}));
    const cookieSecret = extractSessionCookie(res.headers.get('set-cookie'));
    const tempSecret = cookieSecret || String(data?.secret || '');
    if (tempSecret) {
      // Clean up the temporary verification session immediately
      fetch(`${APPWRITE_ENDPOINT}/account/sessions/current`, {
        method: 'DELETE',
        headers: {
          'X-Appwrite-Project': APPWRITE_PROJECT_ID,
          'X-Appwrite-Session': tempSecret,
        },
        cache: 'no-store',
      }).catch(() => {});
    }
    return true;
  } catch {
    return false;
  }
}

export async function getRawAuthenticatedProfile(req: NextRequest | Request): Promise<{
  authUser: SessionUser;
  profileDoc: any;
} | null> {
  const authUser = await getSessionUser(req);
  if (!authUser) return null;

  try {
    const db = getAdminDatabases();
    try {
      const profileDoc = await db.getDocument(DATABASE_ID, COL.USERS, authUser.$id);
      return { authUser, profileDoc };
    } catch {
      if (authUser.email) {
        const res = await db.listDocuments(DATABASE_ID, COL.USERS, [
          Query.equal('email', authUser.email.toLowerCase()),
          Query.limit(1),
        ]);
        if (res.documents[0]) {
          return { authUser, profileDoc: res.documents[0] };
        }
      }
      return { authUser, profileDoc: null };
    }
  } catch {
    return { authUser, profileDoc: null };
  }
}

export async function getAuthenticatedProfile(req: NextRequest | Request): Promise<{
  authUser: SessionUser;
  profileDoc: any;
} | null> {
  const session = await getRawAuthenticatedProfile(req);
  if (!session) return null;
  if (isAccountDeleted(session.profileDoc)) return null;
  return session;
}

export async function requireAdminUser(
  req: NextRequest | Request,
  allowedRoles: AdminRole[] = ADMIN_ROLES
): Promise<{ authUser: SessionUser; profileDoc: any; role: AdminRole } | null> {
  const session = await getAuthenticatedProfile(req);
  if (!session?.profileDoc) return null;
  const role = String(session.profileDoc.role || 'USER').toUpperCase() as AdminRole;
  if (!allowedRoles.includes(role)) return null;
  return { authUser: session.authUser, profileDoc: session.profileDoc, role };
}

export function getClientIp(req: NextRequest | Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers.get('x-real-ip') || '0.0.0.0';
}

export async function safeNotify(data: {
  user_id: string;
  from_user_id?: string;
  from_user_name?: string;
  from_user_avatar?: string;
  type: string;
  title: string;
  content: string;
  post_id?: string;
  action_href?: string;
}): Promise<void> {
  try {
    const db = getAdminDatabases();
    await db.createDocument(DATABASE_ID, COL.NOTIFICATIONS, ID.unique(), {
      user_id: data.user_id,
      from_user_id: data.from_user_id || 'system',
      from_user_name: data.from_user_name || 'ViMore',
      from_user_avatar: data.from_user_avatar || '',
      type: data.type,
      title: data.title,
      content: data.content,
      message: data.content,
      post_id: data.post_id || undefined,
      action_href: data.action_href || undefined,
      is_read: false,
    });
  } catch {
    // non-fatal
  }
}

export async function logSecurityEvent(data: {
  event_type: string;
  severity?: 'INFO' | 'WARN' | 'WARNING' | 'ERROR' | 'CRITICAL';
  user_id?: string;
  username?: string;
  actor_id?: string;
  actor_role?: string;
  target_id?: string;
  amount?: string | number;
  currency?: string;
  result?: 'success' | 'failure' | 'blocked';
  endpoint?: string;
  method?: string;
  ip_address?: string;
  user_agent?: string;
  details?: string;
}): Promise<void> {
  try {
    const db = getAdminDatabases();
    const rawSeverity = data.severity || 'INFO';
    const normalizedSeverity = rawSeverity === 'WARNING' ? 'WARN' : rawSeverity;
    const payload: Record<string, any> = {
      event_type: data.event_type,
      severity: normalizedSeverity,
      user_id: data.user_id || data.target_id || '',
      ip_address: data.ip_address || '',
      user_agent: data.user_agent || '',
      details: data.details || '',
      result: data.result || 'success',
    };
    if (data.actor_id) payload.actor_id = data.actor_id;
    if (data.actor_role) payload.actor_role = data.actor_role;
    if (data.target_id) payload.target_id = data.target_id;
    if (data.amount !== undefined && data.amount !== null && data.amount !== '') {
      payload.amount = String(data.amount);
    }
    if (data.currency) payload.currency = data.currency;
    if (data.endpoint) payload.endpoint = data.endpoint;
    if (data.method) payload.method = data.method;

    await db.createDocument(DATABASE_ID, COL.SECURITY_EVENTS, ID.unique(), payload);
  } catch {
    // non-fatal
  }
}

export async function createAuditEntry(data: {
  action: string;
  details: string;
  performedBy: string;
  performedByName?: string;
  performedById?: string;
  performedByAvatar?: string;
}): Promise<any | null> {
  try {
    const db = getAdminDatabases();
    return await db.createDocument(DATABASE_ID, COL.AUDIT_LOGS, ID.unique(), {
      action: data.action,
      details: data.details,
      performed_by: data.performedBy || 'system',
      performed_by_name: data.performedByName || data.performedBy || 'System',
      performed_by_id: data.performedById || '',
      performed_by_avatar: data.performedByAvatar || '',
    });
  } catch {
    return null;
  }
}

export async function listAllDocuments(
  db: ReturnType<typeof getAdminDatabases>,
  collectionId: string,
  baseQueries: string[] = [],
  maxDocs = 2000
): Promise<any[]> {
  const results: any[] = [];
  let cursor: string | null = null;
  const pageSize = 100;
  while (results.length < maxDocs) {
    const queries: string[] = cursor
      ? [...baseQueries, Query.limit(pageSize), Query.cursorAfter(cursor)]
      : [...baseQueries, Query.limit(pageSize)];
    const res: any = await db.listDocuments(DATABASE_ID, collectionId, queries);
    results.push(...res.documents);
    if (res.documents.length < pageSize) break;
    cursor = res.documents[res.documents.length - 1].$id;
  }
  return results;
}

export async function getFirstProtectedUserId(
  db: ReturnType<typeof getAdminDatabases>
): Promise<string | null> {
  try {
    const res = await db.listDocuments(DATABASE_ID, COL.USERS, [
      Query.orderAsc('join_date'),
      Query.limit(1),
    ]);
    if (res.documents[0]?.$id) return res.documents[0].$id;
  } catch {
    // fallback below
  }
  try {
    const res = await db.listDocuments(DATABASE_ID, COL.USERS, [
      Query.orderAsc('$createdAt'),
      Query.limit(1),
    ]);
    return res.documents[0]?.$id ?? null;
  } catch {
    return null;
  }
}

export function getUserBalance(doc: any): number {
  const diamond = typeof doc?.diamond_balance === 'number' ? doc.diamond_balance : undefined;
  const credit = typeof doc?.credit_balance === 'number' ? doc.credit_balance : undefined;
  const raw = Number(diamond ?? credit ?? 0);
  return Number.isFinite(raw) ? Math.round(raw * 100) / 100 : 0;
}

export async function findUserByUsername(username: string): Promise<any | null> {
  const clean = (username || '').trim().replace(/^@/, '');
  if (!clean) return null;
  const db = getAdminDatabases();
  const res = await db.listDocuments(DATABASE_ID, COL.USERS, [
    Query.equal('username', clean),
    Query.limit(1),
  ]);
  return res.documents[0] ?? null;
}
