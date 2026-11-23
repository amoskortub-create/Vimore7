import { NextRequest, NextResponse } from 'next/server';
import { getAdminDatabases, getAdminStorage, DATABASE_ID } from '@/lib/appwrite-server';
import { COL, BUCKET } from '@/lib/appwrite';
import { requireAdminUser } from '@/lib/server-helpers';

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdminUser(req, ['SUPER', 'MODERATOR']);
    if (!admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const productId = String(body.productId || '').trim();
    if (!productId) {
      return NextResponse.json({ error: 'Missing productId' }, { status: 400 });
    }

    const db = getAdminDatabases();
    const storage = getAdminStorage();

    const doc = await db.getDocument(DATABASE_ID, COL.PRODUCTS, productId);
    const imageIds: string[] = Array.isArray((doc as any).imageFileIds) ? (doc as any).imageFileIds : [];
    for (const fileId of imageIds) {
      try {
        await storage.deleteFile(BUCKET.MARKETPLACE_IMAGES, fileId);
      } catch {
        // non-fatal
      }
    }

    await db.deleteDocument(DATABASE_ID, COL.PRODUCTS, productId);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Delete failed' }, { status: 500 });
  }
}
