import { NextResponse } from 'next/server';
import { Query } from 'node-appwrite';
import { DATABASE_ID, getAdminDatabases } from '@/lib/appwrite-server';
import { COL } from '@/lib/appwrite';
import { safeNotify } from '@/lib/server-helpers';

export async function GET() {
  try {
    const db = getAdminDatabases();
    const now = new Date();
    const in72h = new Date(now.getTime() + 72 * 60 * 60 * 1000).toISOString();
    const nowIso = now.toISOString();

    let posts = 0;
    let tracks = 0;
    let users = 0;

    try {
      const expiringPosts = await db.listDocuments(DATABASE_ID, COL.POSTS, [
        Query.equal('is_boosted', true),
        Query.greaterThan('boost_expiry', nowIso),
        Query.lessThan('boost_expiry', in72h),
        Query.limit(50),
      ]);
      for (const p of expiringPosts.documents) {
        if (p.user_id) {
          await safeNotify({
            user_id: p.user_id,
            type: 'SYSTEM',
            title: 'Post Boost Expiring Soon',
            content: 'Your boosted post campaign expires within 72 hours.',
            post_id: p.$id,
          });
          posts += 1;
        }
      }
    } catch {
      // ignore
    }

    try {
      const expiringTracks = await db.listDocuments(DATABASE_ID, COL.TRACKS, [
        Query.equal('is_boosted', true),
        Query.greaterThan('boost_expiry', nowIso),
        Query.lessThan('boost_expiry', in72h),
        Query.limit(50),
      ]);
      for (const t of expiringTracks.documents) {
        if (t.user_id) {
          await safeNotify({
            user_id: t.user_id,
            type: 'SYSTEM',
            title: 'Track Boost Expiring Soon',
            content: 'Your promoted music track boost expires within 72 hours.',
          });
          tracks += 1;
        }
      }
    } catch {
      // ignore
    }

    try {
      const expiringUsers = await db.listDocuments(DATABASE_ID, COL.USERS, [
        Query.equal('is_verified', true),
        Query.greaterThan('verification_expiry', nowIso),
        Query.lessThan('verification_expiry', in72h),
        Query.limit(50),
      ]);
      for (const u of expiringUsers.documents) {
        await safeNotify({
          user_id: u.$id,
          type: 'SYSTEM',
          title: 'Verification Expiring Soon',
          content: 'Your ViMore verification badge expires within 72 hours. Renew to keep it active.',
        });
        users += 1;
      }
    } catch {
      // ignore
    }

    return NextResponse.json({
      ok: true,
      sent: { posts, tracks, users },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Expiry alerts failed' }, { status: 500 });
  }
}
