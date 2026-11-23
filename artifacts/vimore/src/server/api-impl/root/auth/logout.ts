import { NextRequest, NextResponse } from 'next/server';
import { APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID } from '@/lib/server-helpers';
import { extractRequestSessionToken } from '@/lib/session';

export async function POST(req: NextRequest) {
  const token = extractRequestSessionToken(req);

  if (token) {
    try {
      await fetch(`${APPWRITE_ENDPOINT}/account/sessions/current`, {
        method: 'DELETE',
        headers: {
          'X-Appwrite-Project': APPWRITE_PROJECT_ID,
          'X-Appwrite-Session': token,
          Cookie: `a_session_${APPWRITE_PROJECT_ID}=${encodeURIComponent(token)}`,
        },
        cache: 'no-store',
      });
    } catch {
      // Ignore upstream errors during logout
    }
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.delete(`a_session_${APPWRITE_PROJECT_ID}`);
  return response;
}
