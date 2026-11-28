import { NextRequest, NextResponse } from 'next/server';
import { Query } from 'node-appwrite';
import { DATABASE_ID, getAdminDatabases } from '@/lib/appwrite-server';
import { BUCKET, COL, getAvatarUrl } from '@/lib/appwrite';
import { listAllDocuments, requireAdminUser } from '@/lib/server-helpers';

export async function GET(req: NextRequest) {
  const admin = await requireAdminUser(req, ['SUPER']);
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden — Super Admin required' }, { status: 403 });
  }

  try {
    const db = getAdminDatabases();

    const [leadersRes, allReferrers, activityRes] = await Promise.all([
      db.listDocuments(DATABASE_ID, COL.USERS, [
        Query.orderDesc('referral_count'),
        Query.limit(25),
      ]),
      listAllDocuments(
        db,
        COL.USERS,
        [Query.greaterThan('referral_count', 0), Query.select(['$id', 'referral_count'])],
        5000
      ).catch(() => []),
      db.listDocuments(DATABASE_ID, COL.NOTIFICATIONS, [
        Query.equal('title', 'Referral Bonus!'),
        Query.orderDesc('$createdAt'),
        Query.limit(30),
      ]).catch(() => ({ documents: [] })),
    ]);

    const leaders = leadersRes.documents
      .filter((u: any) => Number(u.referral_count || 0) > 0)
      .slice(0, 20)
      .map((u: any) => ({
        $id: u.$id,
        name: u.name || u.display_name || u.username || 'User',
        username: u.username || '',
        avatar: u.avatar_id ? getAvatarUrl(BUCKET.AVATARS, u.avatar_id) : '',
        referral_count: Number(u.referral_count || 0),
      }));

    const totalReferralCount =
      allReferrers.length > 0
        ? allReferrers.reduce((sum: number, u: any) => sum + Number(u.referral_count || 0), 0)
        : leaders.reduce((sum: number, u: any) => sum + Number(u.referral_count || 0), 0);

    return NextResponse.json({
      leaders,
      totalReferralCount,
      recentActivity: activityRes.documents || [],
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to load referral stats' }, { status: 500 });
  }
}
