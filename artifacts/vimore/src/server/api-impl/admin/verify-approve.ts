import { NextRequest, NextResponse } from 'next/server';
import { getAdminDatabases, DATABASE_ID } from '@/lib/appwrite-server';
import { COL } from '@/lib/appwrite';
import { requireAdminUser, safeNotify } from '@/lib/server-helpers';

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdminUser(req, ['SUPER', 'MODERATOR']);
    if (!admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const recordId = String(body.recordId || '').trim();
    if (!recordId) {
      return NextResponse.json({ error: 'Missing recordId' }, { status: 400 });
    }

    const db = getAdminDatabases();
    const record: any = await db.getDocument(DATABASE_ID, COL.VERIFICATION_RECORDS, recordId);
    const userId = record.user_id;
    if (!userId) {
      return NextResponse.json({ error: 'Invalid verification record' }, { status: 400 });
    }

    const expiryIso = new Date(Date.now() + 30 * 86_400_000).toISOString();

    await db.updateDocument(DATABASE_ID, COL.USERS, userId, {
      is_verified: true,
      has_ever_been_verified: true,
      verification_expiry: expiryIso,
    });

    await db.updateDocument(DATABASE_ID, COL.VERIFICATION_RECORDS, recordId, {
      status: 'APPROVED',
      reviewed_by: admin.authUser.$id,
      reviewed_at: new Date().toISOString(),
    });

    await safeNotify({
      user_id: userId,
      type: 'SYSTEM',
      title: 'Verification Approved ✅',
      content: 'Congratulations! Your ViMore verified badge is now active.',
    });

    return NextResponse.json({ ok: true, status: 'APPROVED', verificationExpiry: expiryIso });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Approval failed' }, { status: 500 });
  }
}
