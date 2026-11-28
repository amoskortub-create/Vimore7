import { NextRequest, NextResponse } from 'next/server';
import { Query } from 'node-appwrite';
import { DATABASE_ID, getAdminDatabases } from '@/lib/appwrite-server';
import { BUCKET, COL, getFileUrl } from '@/lib/appwrite';
import { listAllDocuments, requireAdminUser } from '@/lib/server-helpers';

function sanitizeUserDoc(doc: any) {
  const {
    biometric_pin_hash: _b,
    security_answer: _sa,
    security_question: _sq,
    push_subscription: _ps,
    fcm_token: _ft,
    push_token: _pt,
    ...rest
  } = doc;
  return rest;
}

export async function GET(req: NextRequest) {
  const admin = await requireAdminUser(req);
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const db = getAdminDatabases();

    const [
      reportsRes,
      ticketsRes,
      campaignsRes,
      payReqRes,
      wdRes,
      logsRes,
      staffRes,
      broadcastsRes,
      shieldRes,
      allUsersDocs,
    ] = await Promise.all([
      db.listDocuments(DATABASE_ID, COL.REPORTS, [Query.orderDesc('$createdAt'), Query.limit(100)]).catch(() => ({ documents: [] })),
      db.listDocuments(DATABASE_ID, COL.SUPPORT_TICKETS, [Query.orderDesc('$createdAt'), Query.limit(100)]).catch(() => ({ documents: [] })),
      db.listDocuments(DATABASE_ID, COL.AD_CAMPAIGNS, [Query.orderDesc('$createdAt'), Query.limit(100)]).catch(() => ({ documents: [] })),
      db.listDocuments(DATABASE_ID, COL.PAYMENT_REQUESTS, [Query.orderDesc('$createdAt'), Query.limit(150)]).catch(() => ({ documents: [] })),
      db.listDocuments(DATABASE_ID, COL.WITHDRAWAL_REQUESTS, [Query.orderDesc('$createdAt'), Query.limit(150)]).catch(() => ({ documents: [] })),
      db.listDocuments(DATABASE_ID, COL.AUDIT_LOGS, [Query.orderDesc('$createdAt'), Query.limit(150)]).catch(() => ({ documents: [] })),
      db.listDocuments(DATABASE_ID, COL.USERS, [Query.notEqual('role', 'USER'), Query.limit(100)]).catch(() => ({ documents: [] })),
      db.listDocuments(DATABASE_ID, COL.ADMIN_NOTIFICATIONS, [Query.orderDesc('$createdAt'), Query.limit(50)]).catch(() => ({ documents: [] })),
      db.listDocuments(DATABASE_ID, COL.ADMIN_REPORTS, [Query.equal('status', 'open'), Query.limit(1)]).catch(() => ({ total: 0 })),
      listAllDocuments(db, COL.USERS, [Query.orderDesc('$createdAt')], 1000).catch(() => []),
    ]);

    const userMap = new Map<string, any>();
    for (const u of allUsersDocs) {
      userMap.set(u.$id, u);
    }

    const paymentRequests = (payReqRes.documents || []).map((doc: any) => ({
      ...doc,
      packageName: doc.package_name || doc.message || 'Package',
      screenshot: doc.screenshot_id ? getFileUrl(BUCKET.PAYMENT_SCREENSHOTS, doc.screenshot_id) : '',
    }));

    const withdrawalHistory = (wdRes.documents || []).map((doc: any) => ({
      ...doc,
      username: doc.username || '',
      accountName: doc.account_name || doc.accountName || '',
      payoutAmount: doc.payout_amount ?? doc.payoutAmount ?? 0,
      payoutCurrency: doc.payout_currency || doc.payoutCurrency || 'USD',
      method: doc.method || doc.payment_method || '',
      amount: doc.amount ?? 0,
      currency: doc.currency || '',
    }));

    const supportTickets = (ticketsRes.documents || []).map((t: any) => {
      const u = userMap.get(t.user_id);
      return {
        ...t,
        username: t.username || u?.username || 'user',
        avatar: u?.avatar_id ? getFileUrl(BUCKET.AVATARS, u.avatar_id) : '',
        category: t.category || 'GENERAL',
        priority: t.priority || 'MEDIUM',
      };
    });

    const reports = (reportsRes.documents || []).map((r: any) => {
      const reporter = userMap.get(r.reporter_id);
      const reported = userMap.get(r.target_id);
      return {
        ...r,
        reporterUsername: r.reporter_username || reporter?.username || '',
        reportedUsername: r.reported_username || reported?.username || '',
      };
    });

    const broadcastHistory = (broadcastsRes.documents || []).map((b: any) => ({
      ...b,
      target_type: b.target_type || 'ALL',
      recipient_count: typeof b.recipient_count === 'number' ? b.recipient_count : 0,
      sent_at: b.sent_at || b.$createdAt,
    }));

    return NextResponse.json({
      reports,
      tickets: supportTickets,
      campaigns: campaignsRes.documents || [],
      paymentRequests,
      withdrawalHistory,
      auditLogs: logsRes.documents || [],
      staff: (staffRes.documents || []).map(sanitizeUserDoc),
      allUsers: allUsersDocs.map(sanitizeUserDoc),
      broadcastHistory,
      aiShieldCount: Number((shieldRes as any).total || 0),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to load dashboard data' }, { status: 500 });
  }
}
