import { NextRequest, NextResponse } from 'next/server';
import { Query } from 'node-appwrite';
import { getAdminDatabases, DATABASE_ID } from '@/lib/appwrite-server';
import { COL, getAvatarUrl } from '@/lib/appwrite';
import { requireAdminUser } from '@/lib/server-helpers';

export async function GET(req: NextRequest) {
  try {
    const admin = await requireAdminUser(req);
    if (!admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = getAdminDatabases();
    const res = await db.listDocuments(DATABASE_ID, COL.VERIFICATION_RECORDS, [
      Query.equal('status', 'PENDING'),
      Query.orderDesc('$createdAt'),
      Query.limit(100),
    ]);

    const userIds = Array.from(new Set(res.documents.map((d: any) => d.user_id).filter(Boolean)));
    const userMap = new Map<string, any>();
    if (userIds.length > 0) {
      try {
        const usersRes = await db.listDocuments(DATABASE_ID, COL.USERS, [
          Query.equal('$id', userIds),
          Query.limit(100),
        ]);
        for (const u of usersRes.documents as any[]) {
          userMap.set(u.$id, u);
        }
      } catch {
        // non-fatal
      }
    }

    const records = res.documents.map((rec: any) => {
      const u = userMap.get(rec.user_id);
      return {
        ...rec,
        amount: rec.amount ?? rec.cost,
        user: u
          ? {
              $id: u.$id,
              username: u.username || rec.username,
              display_name: u.display_name || u.name || rec.name,
              avatar: u.avatar_id ? getAvatarUrl(u.avatar_id) : u.avatar || null,
            }
          : rec.username
            ? { username: rec.username, display_name: rec.name || rec.username, avatar: null }
            : null,
      };
    });

    return NextResponse.json({ records });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to load verifications' }, { status: 500 });
  }
}
