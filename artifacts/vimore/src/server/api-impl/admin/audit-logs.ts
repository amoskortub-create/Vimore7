import { NextRequest, NextResponse } from 'next/server';
import { Query } from 'node-appwrite';
import { DATABASE_ID, getAdminDatabases } from '@/lib/appwrite-server';
import { BUCKET, COL, getAvatarUrl } from '@/lib/appwrite';
import { createAuditEntry, requireAdminUser } from '@/lib/server-helpers';

export async function GET(req: NextRequest) {
  const admin = await requireAdminUser(req);
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const db = getAdminDatabases();
    const res = await db.listDocuments(DATABASE_ID, COL.AUDIT_LOGS, [
      Query.orderDesc('$createdAt'),
      Query.limit(150),
    ]);
    return NextResponse.json({ documents: res.documents, total: res.total });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to load audit logs' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireAdminUser(req);
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '').trim();
    const details = String(body.details || '').trim();
    if (!action) {
      return NextResponse.json({ error: 'action is required' }, { status: 400 });
    }

    const adminUsername = String(admin.profileDoc.username || admin.authUser.$id);
    const adminName = String(admin.profileDoc.name || admin.profileDoc.display_name || adminUsername);
    const doc = await createAuditEntry({
      action: action.slice(0, 128),
      details: details.slice(0, 1000),
      performedBy: adminUsername,
      performedByName: adminName,
      performedById: admin.authUser.$id,
      performedByAvatar: admin.profileDoc.avatar_id ? getAvatarUrl(BUCKET.AVATARS, admin.profileDoc.avatar_id) : '',
    });

    return NextResponse.json({ ok: true, doc });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to create audit log' }, { status: 500 });
  }
}
