import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const APPWRITE_ENDPOINT =
  process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://appwrite.mediatechliberia.online/v1';

export async function GET() {
  try {
    const response = await fetch(`${APPWRITE_ENDPOINT.replace(/\/+$/, '')}/health/db`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return NextResponse.json({ status: 'unavailable' }, { status: 503 });
    }

    return NextResponse.json({ status: 'ok' }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    });
  } catch {
    return NextResponse.json({ status: 'unavailable' }, { status: 503 });
  }
}