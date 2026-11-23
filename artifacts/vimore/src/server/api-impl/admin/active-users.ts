import { NextRequest, NextResponse } from 'next/server';
import { Query } from 'node-appwrite';
import { getAdminDatabases, DATABASE_ID } from '@/lib/appwrite-server';
import { COL } from '@/lib/appwrite';
import { requireAdminUser } from '@/lib/server-helpers';

export async function GET(req: NextRequest) {
  try {
    const admin = await requireAdminUser(req, ['SUPER']);
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const db = getAdminDatabases();
    const res = await db.listDocuments(DATABASE_ID, COL.USER_ACTIVITY, [
      Query.orderDesc('$updatedAt'),
      Query.limit(500),
    ]);

    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

    const dauSet = new Set<string>();
    const mauSet = new Set<string>();
    const totalSet = new Set<string>();
    const byDay = new Map<string, Set<string>>();

    for (let i = 13; i >= 0; i--) {
      const d = new Date(now - i * 86_400_000).toISOString().slice(0, 10);
      byDay.set(d, new Set());
    }

    const userList = res.documents.map((doc: any) => {
      const lastSeen = doc.last_seen || doc.$updatedAt || doc.$createdAt;
      const ts = new Date(lastSeen).getTime();
      const uid = doc.user_id || doc.$id;
      totalSet.add(uid);
      if (ts >= oneDayAgo) dauSet.add(uid);
      if (ts >= thirtyDaysAgo) mauSet.add(uid);

      const dayKey = new Date(lastSeen).toISOString().slice(0, 10);
      if (byDay.has(dayKey)) {
        byDay.get(dayKey)!.add(uid);
      }

      return {
        user_id: uid,
        username: doc.username || 'unknown',
        ip_address: doc.ip_address || '0.0.0.0',
        last_seen: lastSeen,
        user_agent: doc.user_agent || '',
      };
    });

    const dailyChart = Array.from(byDay.entries()).map(([date, set]) => ({
      date,
      count: set.size,
    }));

    return NextResponse.json({
      dau: dauSet.size,
      mau: mauSet.size,
      totalTracked: totalSet.size,
      dailyChart,
      userList,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to fetch active users' }, { status: 500 });
  }
}
