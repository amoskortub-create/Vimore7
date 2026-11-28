import { NextRequest, NextResponse } from 'next/server';
import { DATABASE_ID, getAdminDatabases, getAdminUsers } from '@/lib/appwrite-server';
import { COL } from '@/lib/appwrite';
import {
  APPWRITE_PROJECT_ID,
  getAuthenticatedProfile,
  getClientIp,
  logSecurityEvent,
  verifyUserPassword,
} from '@/lib/server-helpers';

const RETENTION_DAYS = 90;

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthenticatedProfile(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const confirmPermanent = body.confirmPermanent === true;
    const password = String(body.password || '');

    if (!confirmPermanent) {
      return NextResponse.json(
        { error: 'Please confirm that deleting your account cannot be undone.' },
        { status: 400 }
      );
    }

    if (!password) {
      return NextResponse.json(
        { error: 'Please enter your password to confirm account deletion.' },
        { status: 400 }
      );
    }

    const email = String(session.authUser.email || session.profileDoc?.email || '').trim().toLowerCase();
    if (!email) {
      return NextResponse.json(
        { error: 'Unable to verify account credentials.' },
        { status: 400 }
      );
    }

    const isPasswordValid = await verifyUserPassword(email, password);
    if (!isPasswordValid) {
      await logSecurityEvent({
        event_type: 'ACCOUNT_DELETE_FAILED_AUTH',
        severity: 'WARNING',
        user_id: session.authUser.$id,
        ip_address: getClientIp(req),
        user_agent: req.headers.get('user-agent') || '',
        details: 'Incorrect password entered during account deletion confirmation.',
      });
      return NextResponse.json(
        { error: 'Incorrect password. Account deletion was not performed.' },
        { status: 403 }
      );
    }

    const now = new Date();
    const deletedAt = now.toISOString();
    const scheduledDeletionAt = new Date(
      now.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();

    const db = getAdminDatabases();
    const adminUsers = getAdminUsers();
    const userId = session.authUser.$id;

    // 1. Mark profile deleted & schedule full purge in 90 days
    await db.updateDocument(DATABASE_ID, COL.USERS, userId, {
      is_deleted: true,
      status: 'deleted',
      deleted_at: deletedAt,
      scheduled_deletion_at: scheduledDeletionAt,
      is_online: false,
      push_token: '',
      push_enabled: false,
      biometric_pin_hash: '',
    });

    // 2. Immediately terminate all sessions & disable Appwrite Auth access
    try {
      await adminUsers.deleteSessions(userId);
    } catch {
      // ignore if sessions already cleared
    }
    try {
      await adminUsers.updateStatus(userId, false);
    } catch {
      // ignore if already disabled
    }

    await logSecurityEvent({
      event_type: 'ACCOUNT_DELETION_SCHEDULED',
      severity: 'CRITICAL',
      user_id: userId,
      ip_address: getClientIp(req),
      user_agent: req.headers.get('user-agent') || '',
      details: `Access revoked immediately. Full data deletion scheduled for ${scheduledDeletionAt} (90 days).`,
    });

    const res = NextResponse.json({
      ok: true,
      deletedAt,
      scheduledDeletionAt,
      retentionDays: RETENTION_DAYS,
      message: 'Your account access has been removed. All account data will be permanently deleted after 90 days.',
    });

    res.cookies.set(`a_session_${APPWRITE_PROJECT_ID}`, '', {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });

    return res;
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Failed to delete account.' },
      { status: 500 }
    );
  }
}
