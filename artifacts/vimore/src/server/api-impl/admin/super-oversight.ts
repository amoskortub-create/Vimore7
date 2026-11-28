import { NextRequest, NextResponse } from 'next/server';
import { Query } from 'node-appwrite';
import { DATABASE_ID, getAdminDatabases } from '@/lib/appwrite-server';
import { BUCKET, COL, getAvatarUrl, getFileUrl, toProxyUrl } from '@/lib/appwrite';
import { listAllDocuments, requireAdminUser } from '@/lib/server-helpers';

export async function GET(req: NextRequest) {
  const admin = await requireAdminUser(req, ['SUPER']);
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden — Super Admin required' }, { status: 403 });
  }

  try {
    const db = getAdminDatabases();

    const [users, paymentsDocs, withdrawalsDocs, banDocs] = await Promise.all([
      listAllDocuments(db, COL.USERS, [Query.orderDesc('$createdAt')], 2000),
      listAllDocuments(db, COL.PAYMENT_REQUESTS, [Query.orderDesc('$createdAt')], 500),
      listAllDocuments(db, COL.WITHDRAWAL_REQUESTS, [Query.orderDesc('$createdAt')], 500),
      listAllDocuments(db, COL.USER_BANS, [Query.orderDesc('$createdAt')], 500).catch(() => []),
    ]);

    const userById = new Map<string, any>();
    const userByUsername = new Map<string, any>();
    for (const u of users) {
      userById.set(u.$id, u);
      if (u.username) {
        userByUsername.set(String(u.username).toLowerCase(), u);
      }
    }

    const resolveAdminInfo = (reviewedById?: string, reviewedBy?: string, reviewedByName?: string) => {
      const matched =
        (reviewedById && userById.get(reviewedById)) ||
        (reviewedBy && (userById.get(reviewedBy) || userByUsername.get(String(reviewedBy).toLowerCase()))) ||
        null;

      const resolvedName =
        reviewedByName ||
        matched?.name ||
        matched?.display_name ||
        (matched?.username ? `@${matched.username}` : '') ||
        reviewedBy ||
        '';
      const resolvedUsername = matched?.username || (reviewedBy && !reviewedBy.includes(' ') ? reviewedBy : '') || '';
      const resolvedId = reviewedById || matched?.$id || '';

      return {
        reviewedByName: resolvedName || null,
        reviewedByUsername: resolvedUsername || null,
        reviewedById: resolvedId || null,
      };
    };

    const getUserSummary = (uid?: string, uname?: string) => {
      const doc =
        (uid && userById.get(uid)) ||
        (uname && userByUsername.get(String(uname).toLowerCase())) ||
        null;
      const name = doc?.name || doc?.display_name || uname || 'User';
      const username = doc?.username || uname || '';
      const avatar = doc?.avatar_id
        ? getAvatarUrl(BUCKET.AVATARS, doc.avatar_id)
        : (doc?.avatar || '');
      return {
        userId: doc?.$id || uid || '',
        name,
        username,
        avatar,
        isVerified: Boolean(doc?.is_verified),
      };
    };

    const payments = paymentsDocs.map((doc: any) => {
      const requester = getUserSummary(doc.user_id, doc.username);
      const reviewer = resolveAdminInfo(doc.reviewed_by_id, doc.reviewed_by, doc.reviewed_by_name);
      return {
        $id: doc.$id,
        createdAt: doc.$createdAt,
        status: String(doc.status || 'PENDING').toUpperCase(),
        userId: requester.userId,
        userName: doc.name || requester.name,
        username: doc.username || requester.username,
        userAvatar: requester.avatar,
        userVerified: requester.isVerified,
        packageName: doc.package_name || doc.message || 'Credit Package',
        amount: Number(doc.amount || 0),
        currency: doc.currency || 'USD',
        coinType: doc.coin_type || 'Credit',
        coinAmount: Number(doc.coin_amount || 0),
        code: doc.code || '',
        screenshotId: doc.screenshot_id || '',
        screenshotUrl: doc.screenshot_id ? getFileUrl(BUCKET.PAYMENT_SCREENSHOTS, doc.screenshot_id) : '',
        rejectionReason: doc.rejection_reason || '',
        reviewedByName: reviewer.reviewedByName,
        reviewedByUsername: reviewer.reviewedByUsername,
        reviewedById: reviewer.reviewedById,
        reviewedAt: doc.reviewed_at || null,
      };
    });

    const withdrawals = withdrawalsDocs.map((doc: any) => {
      const requester = getUserSummary(doc.user_id, doc.username);
      const reviewer = resolveAdminInfo(doc.reviewed_by_id, doc.reviewed_by, doc.reviewed_by_name);
      const rawProof = doc.proof_image_url || '';
      return {
        $id: doc.$id,
        createdAt: doc.$createdAt,
        status: String(doc.status || 'PENDING').toUpperCase(),
        userId: requester.userId,
        userName: requester.name,
        username: doc.username || requester.username,
        userAvatar: requester.avatar,
        userVerified: requester.isVerified,
        method: doc.method || doc.payment_method || 'Mobile Money',
        accountName: doc.account_name || doc.accountName || '',
        accountNumber: doc.account_number || doc.accountNumber || doc.payment_details || '',
        amount: Number(doc.amount || 0),
        currency: doc.currency || 'DIAMOND',
        payoutAmount: Number(doc.payout_amount ?? doc.payoutAmount ?? 0),
        payoutCurrency: doc.payout_currency || doc.payoutCurrency || 'USD',
        adminMessage: doc.admin_message || '',
        proofImageUrl: rawProof ? toProxyUrl(rawProof) : '',
        reviewedByName: reviewer.reviewedByName,
        reviewedByUsername: reviewer.reviewedByUsername,
        reviewedById: reviewer.reviewedById,
        reviewedAt: doc.reviewed_at || null,
      };
    });

    const bansByUserId = new Map<string, any[]>();
    for (const b of banDocs) {
      const uid = String(b.user_id || '');
      if (!uid) continue;
      if (!bansByUserId.has(uid)) bansByUserId.set(uid, []);
      bansByUserId.get(uid)!.push(b);
    }

    const restrictedUsers: any[] = [];
    const nowMs = Date.now();

    for (const u of users) {
      const status = String(u.status || 'active').toLowerCase();
      const isCurrentlySuspended =
        status === 'suspended' ||
        (u.is_suspended === true && (!u.suspended_until || new Date(u.suspended_until).getTime() > nowMs));
      const isBanned = status === 'banned';

      if (!isBanned && !isCurrentlySuspended) continue;

      const records = bansByUserId.get(u.$id) || [];
      const latestBanRecord = records.find((r: any) => r.status !== 'RESTORED') || records[0] || null;
      const actorInfo = resolveAdminInfo(
        latestBanRecord?.admin_id,
        isBanned ? (u.banned_by || latestBanRecord?.banned_by) : (u.suspended_by || latestBanRecord?.banned_by),
        isBanned ? (u.banned_by_name || latestBanRecord?.banned_by_name || latestBanRecord?.admin_name) : (u.suspended_by_name || latestBanRecord?.banned_by_name || latestBanRecord?.admin_name)
      );

      restrictedUsers.push({
        $id: u.$id,
        name: u.name || u.display_name || u.username || 'User',
        username: u.username || '',
        email: u.email || '',
        phone: u.phone || '',
        avatar: u.avatar_id ? getAvatarUrl(BUCKET.AVATARS, u.avatar_id) : (u.avatar || ''),
        role: u.role || 'USER',
        status: isBanned ? 'banned' : 'suspended',
        warningCount: Number(u.warning_count || 0),
        joinDate: u.join_date || u.$createdAt,
        banReason: u.ban_reason || latestBanRecord?.reason || 'Policy violation',
        banNote: latestBanRecord?.note || '',
        bannedAt: u.banned_at || (isBanned ? latestBanRecord?.created_at || latestBanRecord?.$createdAt : null),
        bannedByName: actorInfo.reviewedByName,
        bannedByUsername: actorInfo.reviewedByUsername,
        suspendedUntil: u.suspended_until || null,
        suspendedAt: u.suspended_at || (isCurrentlySuspended ? latestBanRecord?.created_at || latestBanRecord?.$createdAt : null),
        suspendedByName: !isBanned ? actorInfo.reviewedByName : null,
        suspendedByUsername: !isBanned ? actorInfo.reviewedByUsername : null,
        records: records.map((r: any) => ({
          $id: r.$id,
          reason: r.reason || '',
          note: r.note || '',
          isPermanent: Boolean(r.is_permanent),
          status: r.status || (r.is_permanent ? 'ACTIVE' : 'SUSPENDED'),
          adminName: r.banned_by_name || r.admin_name || r.banned_by || '',
          adminUsername: r.banned_by || '',
          createdAt: r.created_at || r.$createdAt,
          restoredByName: r.restored_by_name || r.restored_by || null,
          restoredAt: r.restored_at || null,
        })),
      });
    }

    const restoredHistory = banDocs
      .filter((b: any) => b.status === 'RESTORED')
      .slice(0, 50)
      .map((b: any) => {
        const u = userById.get(b.user_id);
        return {
          $id: b.$id,
          userId: b.user_id,
          username: b.username || u?.username || b.user_id,
          userName: u?.name || u?.display_name || b.username || 'User',
          userAvatar: u?.avatar_id ? getAvatarUrl(BUCKET.AVATARS, u.avatar_id) : '',
          reason: b.reason || '',
          note: b.note || '',
          wasPermanent: Boolean(b.is_permanent),
          actionByName: b.banned_by_name || b.admin_name || b.banned_by || 'Admin',
          actionByUsername: b.banned_by || '',
          restoredByName: b.restored_by_name || b.restored_by || 'Super Admin',
          restoredByUsername: b.restored_by || '',
          restoredAt: b.restored_at || b.$updatedAt,
        };
      });

    return NextResponse.json({
      payments,
      withdrawals,
      restrictedUsers,
      restoredHistory,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to load super oversight data' }, { status: 500 });
  }
}
