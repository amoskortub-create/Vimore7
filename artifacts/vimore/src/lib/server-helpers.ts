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

export async function getAuthenticatedProfile(req: NextRequest | Request): Promise<{
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
  severity?: 'INFO' | 'WARNING' | 'CRITICAL';
  user_id?: string;
  username?: string;
  ip_address?: string;
  user_agent?: string;
  details?: string;
}): Promise<void> {
  try {
    const db = getAdminDatabases();
    await db.createDocument(DATABASE_ID, COL.SECURITY_EVENTS, ID.unique(), {
      event_type: data.event_type,
      severity: data.severity || 'INFO',
      user_id: data.user_id || '',
      ip_address: data.ip_address || '',
      user_agent: data.user_agent || '',
      details: data.details || '',
    });
  } catch {
    // non-fatal
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
