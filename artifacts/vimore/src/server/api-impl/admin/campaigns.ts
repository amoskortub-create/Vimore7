import { NextRequest, NextResponse } from 'next/server';
import { DATABASE_ID, getAdminDatabases } from '@/lib/appwrite-server';
import { BUCKET, COL, getAvatarUrl } from '@/lib/appwrite';
import { createAuditEntry, requireAdminUser } from '@/lib/server-helpers';

export async function POST(req: NextRequest) {
  const admin = await requireAdminUser(req, ['SUPER', 'MODERATOR']);
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '').toLowerCase();
    const id = String(body.id || '').trim();

    if (!id || (action !== 'toggle' && action !== 'delete')) {
      return NextResponse.json({ error: 'Invalid campaign action' }, { status: 400 });
    }

    const db = getAdminDatabases();
    const camp: any = await db.getDocument(DATABASE_ID, COL.AD_CAMPAIGNS, id);

    const adminUsername = String(admin.profileDoc.username || admin.authUser.$id);
    const adminName = String(admin.profileDoc.name || admin.profileDoc.display_name || adminUsername);
    const adminAvatar = admin.profileDoc.avatar_id ? getAvatarUrl(BUCKET.AVATARS, admin.profileDoc.avatar_id) : '';

    if (action === 'delete') {
      await db.deleteDocument(DATABASE_ID, COL.AD_CAMPAIGNS, id);
      await createAuditEntry({
        action: 'CAMPAIGN_DELETED',
        details: `Campaign "${camp.title || id}" deleted by ${adminName} (@${adminUsername})`,
        performedBy: adminUsername,
        performedByName: adminName,
        performedById: admin.authUser.$id,
        performedByAvatar: adminAvatar,
      });
      return NextResponse.json({ ok: true, deleted: true });
    }

    const isCurrentlyActive = camp.status === 'ACTIVE' || Boolean(camp.is_active);
    const nextIsActive = !isCurrentlyActive;
    const nextStatus = nextIsActive ? 'ACTIVE' : 'PAUSED';

    await db.updateDocument(DATABASE_ID, COL.AD_CAMPAIGNS, id, {
      status: nextStatus,
      is_active: nextIsActive,
    });

    await createAuditEntry({
      action: 'CAMPAIGN_UPDATED',
      details: `Campaign "${camp.title || id}" set to ${nextStatus} by ${adminName} (@${adminUsername})`,
      performedBy: adminUsername,
      performedByName: adminName,
      performedById: admin.authUser.$id,
      performedByAvatar: adminAvatar,
    });

    return NextResponse.json({ ok: true, status: nextStatus, is_active: nextIsActive });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Campaign action failed' }, { status: 500 });
  }
}
