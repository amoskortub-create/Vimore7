import { NextRequest, NextResponse } from 'next/server';
import { Query } from 'node-appwrite';
import { DATABASE_ID, getAdminDatabases } from '@/lib/appwrite-server';
import { requireAdminUser } from '@/lib/server-helpers';

const COLLECTION = 'ai_knowledge_bank';

export async function GET(req: NextRequest) {
  const admin = await requireAdminUser(req, ['SUPER']);
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const limit = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get('limit') || 50)));
    const offset = Math.max(0, Number(req.nextUrl.searchParams.get('offset') || 0));
    const db = getAdminDatabases();
    const res = await db.listDocuments(DATABASE_ID, COLLECTION, [
      Query.orderDesc('$createdAt'),
      Query.limit(limit),
      Query.offset(offset),
    ]);
    return NextResponse.json({ documents: res.documents, total: res.total });
  } catch (err: any) {
    return NextResponse.json({ documents: [], total: 0, error: err?.message });
  }
}

export async function DELETE(req: NextRequest) {
  const admin = await requireAdminUser(req, ['SUPER']);
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get('id') || '';
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  try {
    const db = getAdminDatabases();
    await db.deleteDocument(DATABASE_ID, COLLECTION, id);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Delete failed' }, { status: 500 });
  }
}
