import { NextResponse } from 'next/server';
import { Query } from 'node-appwrite';
import { DATABASE_ID, getAdminDatabases } from '@/lib/appwrite-server';
import { COL } from '@/lib/appwrite';

export async function GET() {
  try {
    const db = getAdminDatabases();
    const now = new Date().toISOString();
    let postBoosts = 0;
    let trackBoosts = 0;
    let verifications = 0;
    let campaigns = 0;

    try {
      const expiredPosts = await db.listDocuments(DATABASE_ID, COL.POSTS, [
        Query.equal('is_boosted', true),
        Query.lessThan('boost_expiry', now),
        Query.limit(100),
      ]);
      for (const doc of expiredPosts.documents) {
        await db.updateDocument(DATABASE_ID, COL.POSTS, doc.$id, { is_boosted: false });
        postBoosts += 1;
      }
    } catch {
      // ignore index/schema mismatch
    }

    try {
      const expiredTracks = await db.listDocuments(DATABASE_ID, COL.TRACKS, [
        Query.equal('is_boosted', true),
        Query.lessThan('boost_expiry', now),
        Query.limit(100),
      ]);
      for (const doc of expiredTracks.documents) {
        await db.updateDocument(DATABASE_ID, COL.TRACKS, doc.$id, { is_boosted: false });
        trackBoosts += 1;
      }
    } catch {
      // ignore
    }

    try {
      const expiredUsers = await db.listDocuments(DATABASE_ID, COL.USERS, [
        Query.equal('is_verified', true),
        Query.lessThan('verification_expiry', now),
        Query.limit(100),
      ]);
      for (const doc of expiredUsers.documents) {
        await db.updateDocument(DATABASE_ID, COL.USERS, doc.$id, { is_verified: false });
        verifications += 1;
      }
    } catch {
      // ignore
    }

    try {
      const expiredAds = await db.listDocuments(DATABASE_ID, COL.AD_CAMPAIGNS, [
        Query.equal('status', 'ACTIVE'),
        Query.lessThan('expires_at', now),
        Query.limit(100),
      ]);
      for (const doc of expiredAds.documents) {
        await db.updateDocument(DATABASE_ID, COL.AD_CAMPAIGNS, doc.$id, { status: 'EXPIRED' });
        campaigns += 1;
      }
    } catch {
      // ignore
    }

    return NextResponse.json({
      ok: true,
      reset: { postBoosts, trackBoosts, verifications, campaigns },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Cleanup failed' }, { status: 500 });
  }
}
