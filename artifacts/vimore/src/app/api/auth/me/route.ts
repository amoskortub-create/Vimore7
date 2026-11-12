import { NextRequest, NextResponse } from 'next/server';

import { getSessionUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    return NextResponse.json(
      { loggedIn: Boolean(user) },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } },
    );
  } catch (error) {
    console.error('[auth/me] Session lookup failed:', error);
    return NextResponse.json(
      { loggedIn: false },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } },
    );
  }
}
