import { NextRequest, NextResponse } from 'next/server';
import { ID, Query } from 'node-appwrite';
import { DATABASE_ID, getAdminDatabases } from '@/lib/appwrite-server';
import { COL } from '@/lib/appwrite';
import { getAuthenticatedProfile } from '@/lib/server-helpers';
import { STORE_CATEGORIES } from '@/lib/stores';

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthenticatedProfile(req);
    if (!session?.profileDoc) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const storeName = String(body.store_name || body.storeName || '').trim();
    const description = String(body.description || '').trim();
    const motto = String(body.motto || '').trim();
    const logoFileId = body.logo_file_id || body.logoFileId || null;
    const rawCategory = String(body.category || 'Other');
    const category = (STORE_CATEGORIES as readonly string[]).includes(rawCategory)
      ? rawCategory
      : 'Other';

    if (!storeName || !description) {
      return NextResponse.json(
        { error: 'Store name and description are required' },
        { status: 400 }
      );
    }

    const db = getAdminDatabases();
    const existing = await db.listDocuments(DATABASE_ID, COL.STORES, [
      Query.equal('owner_id', session.authUser.$id),
      Query.limit(1),
    ]);
    if (existing.documents[0]) {
      return NextResponse.json({ ok: true, store: existing.documents[0], existed: true });
    }

    const store = await db.createDocument(DATABASE_ID, COL.STORES, ID.unique(), {
      owner_id: session.authUser.$id,
      owner_username: String(session.profileDoc.username || ''),
      store_name: storeName,
      logo_file_id: logoFileId,
      description,
      motto,
      category,
      is_active: true,
    });

    return NextResponse.json({ ok: true, store });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Store creation failed' }, { status: 500 });
  }
}
