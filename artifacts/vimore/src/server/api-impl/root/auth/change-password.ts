import { NextRequest, NextResponse } from 'next/server';
import { getAdminUsers } from '@/lib/appwrite-server';
import {
  APPWRITE_ENDPOINT,
  APPWRITE_PROJECT_ID,
  extractSessionCookie,
  getAuthenticatedProfile,
  getClientIp,
  logSecurityEvent,
  verifyUserPassword,
} from '@/lib/server-helpers';

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthenticatedProfile(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const currentPassword = String(body.currentPassword || '');
    const newPassword = String(body.newPassword || '');
    const confirmPassword = String(body.confirmPassword || '');

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: 'Current password and new password are required.' },
        { status: 400 }
      );
    }

    if (newPassword.length < 8 || newPassword.length > 128) {
      return NextResponse.json(
        { error: 'New password must be between 8 and 128 characters.' },
        { status: 400 }
      );
    }

    if (confirmPassword && newPassword !== confirmPassword) {
      return NextResponse.json(
        { error: 'New password and confirmation do not match.' },
        { status: 400 }
      );
    }

    if (currentPassword === newPassword) {
      return NextResponse.json(
        { error: 'New password must be different from your current password.' },
        { status: 400 }
      );
    }

    const email = String(session.authUser.email || session.profileDoc?.email || '').trim().toLowerCase();
    if (!email) {
      return NextResponse.json(
        { error: 'Unable to verify account email.' },
        { status: 400 }
      );
    }

    const isCurrentValid = await verifyUserPassword(email, currentPassword);
    if (!isCurrentValid) {
      await logSecurityEvent({
        event_type: 'PASSWORD_CHANGE_FAILED',
        severity: 'WARNING',
        user_id: session.authUser.$id,
        ip_address: getClientIp(req),
        user_agent: req.headers.get('user-agent') || '',
        details: 'Incorrect current password provided.',
      });
      return NextResponse.json(
        { error: 'Your current password is incorrect.' },
        { status: 403 }
      );
    }

    const adminUsers = getAdminUsers();
    await adminUsers.updatePassword(session.authUser.$id, newPassword);

    // Revoke all old sessions across other devices, then issue a fresh session for this browser
    let freshSecret = '';
    try {
      await adminUsers.deleteSessions(session.authUser.$id);
      const loginRes = await fetch(`${APPWRITE_ENDPOINT}/account/sessions/email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Appwrite-Project': APPWRITE_PROJECT_ID,
        },
        body: JSON.stringify({ email, password: newPassword }),
        cache: 'no-store',
      });
      if (loginRes.ok) {
        const loginData = await loginRes.json().catch(() => ({}));
        freshSecret = extractSessionCookie(loginRes.headers.get('set-cookie')) || String(loginData?.secret || '');
      }
    } catch {
      // Non-fatal: password was updated even if session rotation fell back
    }

    await logSecurityEvent({
      event_type: 'PASSWORD_CHANGED',
      severity: 'INFO',
      user_id: session.authUser.$id,
      ip_address: getClientIp(req),
      user_agent: req.headers.get('user-agent') || '',
      details: 'Password updated and other sessions revoked.',
    });

    const res = NextResponse.json({
      ok: true,
      secret: freshSecret || undefined,
      message: 'Password updated successfully.',
    });

    if (freshSecret) {
      res.cookies.set(`a_session_${APPWRITE_PROJECT_ID}`, freshSecret, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 30,
      });
    }

    return res;
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Failed to update password.' },
      { status: 500 }
    );
  }
}
