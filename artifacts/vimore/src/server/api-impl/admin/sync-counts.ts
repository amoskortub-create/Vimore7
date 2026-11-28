import { NextRequest, NextResponse } from 'next/server';
import { Query } from 'node-appwrite';
import { DATABASE_ID, getAdminDatabases } from '@/lib/appwrite-server';
import { BUCKET, COL, getAvatarUrl } from '@/lib/appwrite';
import {
  createAuditEntry,
  getClientIp,
  listAllDocuments,
  logSecurityEvent,
  requireAdminUser,
} from '@/lib/server-helpers';

export async function POST(req: NextRequest) {
  const admin = await requireAdminUser(req, ['SUPER']);
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden — Super Admin required' }, { status: 403 });
  }

  try {
    const db = getAdminDatabases();
    const users = await listAllDocuments(
      db,
      COL.USERS,
      [Query.select(['$id', 'username', 'followers_count', 'following_count', 'posts_count'])],
      5000
    );

    let updated = 0;
    let skipped = 0;
    let errors = 0;
    const log: string[] = [];

    const BATCH_SIZE = 20;
    for (let i = 0; i < users.length; i += BATCH_SIZE) {
      const batch = users.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (u: any) => {
          try {
            const [followersRes, followingRes, postsRes] = await Promise.allSettled([
              db.listDocuments(DATABASE_ID, COL.FOLLOWS, [Query.equal('following_id', u.$id), Query.limit(1)]),
              db.listDocuments(DATABASE_ID, COL.FOLLOWS, [Query.equal('follower_id', u.$id), Query.limit(1)]),
              db.listDocuments(DATABASE_ID, COL.POSTS, [Query.equal('user_id', u.$id), Query.limit(1)]),
            ]);

            const realFollowers = followersRes.status === 'fulfilled' ? followersRes.value.total : null;
            const realFollowing = followingRes.status === 'fulfilled' ? followingRes.value.total : null;
            const realPosts = postsRes.status === 'fulfilled' ? postsRes.value.total : null;

            const storedFollowers = u.followers_count ?? 0;
            const storedFollowing = u.following_count ?? 0;
            const storedPosts = u.posts_count ?? 0;

            const patch: Record<string, number> = {};
            if (realFollowers !== null && realFollowers !== storedFollowers) patch.followers_count = realFollowers;
            if (realFollowing !== null && realFollowing !== storedFollowing) patch.following_count = realFollowing;
            if (realPosts !== null && realPosts !== storedPosts) patch.posts_count = realPosts;

            if (Object.keys(patch).length > 0) {
              await db.updateDocument(DATABASE_ID, COL.USERS, u.$id, patch);
              log.push(
                `✓ @${u.username || u.$id}: followers ${storedFollowers}→${realFollowers ?? '?'}, following ${storedFollowing}→${realFollowing ?? '?'}, posts ${storedPosts}→${realPosts ?? '?'}`
              );
              updated += 1;
            } else {
              skipped += 1;
            }
          } catch (e: any) {
            log.push(`✗ @${u.username || u.$id}: ${e?.message || 'unknown error'}`);
            errors += 1;
          }
        })
      );
    }

    const adminUsername = String(admin.profileDoc.username || admin.authUser.$id);
    const adminName = String(admin.profileDoc.name || admin.profileDoc.display_name || adminUsername);

    await Promise.allSettled([
      createAuditEntry({
        action: 'COUNT_SYNC_EXECUTED',
        details: `Synced ${users.length} accounts (${updated} updated, ${skipped} skipped, ${errors} errors)`,
        performedBy: adminUsername,
        performedByName: adminName,
        performedById: admin.authUser.$id,
        performedByAvatar: admin.profileDoc.avatar_id ? getAvatarUrl(BUCKET.AVATARS, admin.profileDoc.avatar_id) : '',
      }),
      logSecurityEvent({
        event_type: 'ADMIN_COUNT_SYNC',
        severity: 'INFO',
        actor_id: admin.authUser.$id,
        actor_role: admin.role,
        result: 'success',
        endpoint: '/api/admin/sync-counts',
        method: 'POST',
        ip_address: getClientIp(req),
        details: `${adminName} (@${adminUsername}) synced counters: ${updated} updated, ${skipped} skipped, ${errors} errors`,
      }),
    ]);

    return NextResponse.json({
      ok: true,
      total: users.length,
      updated,
      skipped,
      errors,
      log,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Count sync failed' }, { status: 500 });
  }
}
