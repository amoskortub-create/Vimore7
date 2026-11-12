import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminDatabases, DATABASE_ID } from '@/lib/appwrite-server';
import { getSessionUser } from '@/lib/session';

/**
 * GET /api/auth/me
 * Verifies the caller's Appwrite session and returns the authenticated account
 * plus the user's profile document. The account identity comes from the
 * validated session, not a separate admin Users API lookup.
 */
export async function GET(req: NextRequest) {
  try {
    const sessionUser = await getSessionUser(req);
    if (!sessionUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const profileDoc = await getAdminDatabases().getDocument(DATABASE_ID, 'users', sessionUser.userId);

    return NextResponse.json(
      { authUser: sessionUser.authUser, profileDoc },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
        },
      },
    );
  } catch (err: any) {
    console.error('[/api/auth/me]', err);
    const code = err?.code ?? err?.status;
    if (code === 401 || err?.type === 'general_unauthorized_scope') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: err.message || 'Session check failed' }, { status: 500 });
  }
}
