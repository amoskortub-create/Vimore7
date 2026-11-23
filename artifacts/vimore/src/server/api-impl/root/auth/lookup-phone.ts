import { NextRequest, NextResponse } from 'next/server';
import { Query } from 'node-appwrite';
import { DATABASE_ID, getAdminDatabases } from '@/lib/appwrite-server';
import { COL } from '@/lib/appwrite';

async function handleLookup(phone: string) {
  const clean = phone.trim();
  if (!clean) {
    return NextResponse.json({ error: 'Phone number is required.' }, { status: 400 });
  }

  try {
    const db = getAdminDatabases();
    const res = await db.listDocuments(DATABASE_ID, COL.USERS, [
      Query.equal('phone', clean),
      Query.limit(1),
    ]);
    const user = res.documents[0];
    if (!user) {
      return NextResponse.json({ error: 'No account found with that phone number.' }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      email: user.email || '',
      username: user.username || '',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Lookup failed.' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const phone = req.nextUrl.searchParams.get('phone') || '';
  return handleLookup(phone);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  return handleLookup(String(body.phone || body.identifier || ''));
}
