import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { Query } from 'node-appwrite';
import { DATABASE_ID, getAdminDatabases } from '@/lib/appwrite-server';
import { COL } from '@/lib/appwrite';
import { getAuthenticatedProfile } from '@/lib/server-helpers';

function getFirebaseMessaging() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (!projectId || !clientEmail || !rawPrivateKey) return null;

  const privateKey = rawPrivateKey.replace(/\\n/g, '\n');
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
  }
  return getMessaging();
}

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthenticatedProfile(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const userIds: string[] = Array.isArray(body.userIds) ? body.userIds : [];
    const payload = body.payload || {};

    if (userIds.length === 0) {
      return NextResponse.json({ ok: true, sent: 0 });
    }

    const vapidPublic = process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
    const vapidPrivate = process.env.VAPID_PRIVATE_KEY || '';
    const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:support@vimore.cfd';

    const hasWebPush = Boolean(vapidPublic && vapidPrivate);
    if (hasWebPush) {
      webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
    }

    const fcm = getFirebaseMessaging();
    if (!hasWebPush && !fcm) {
      return NextResponse.json({ ok: true, sent: 0, configured: false });
    }

    const db = getAdminDatabases();
    const users = await db.listDocuments(DATABASE_ID, COL.USERS, [
      Query.equal('$id', userIds.slice(0, 50)),
      Query.limit(50),
    ]);

    let sent = 0;
    const serializedPayload = JSON.stringify(payload);

    for (const u of users.documents) {
      if (u.push_enabled === false) continue;

      if (hasWebPush && u.push_subscription) {
        try {
          const sub =
            typeof u.push_subscription === 'string'
              ? JSON.parse(u.push_subscription)
              : u.push_subscription;
          if (sub?.endpoint) {
            await webpush.sendNotification(sub, serializedPayload);
            sent += 1;
          }
        } catch {
          // Ignore expired/invalid subscription
        }
      }

      const fcmToken = String(u.fcm_token || u.push_token || '').trim();
      if (fcm && fcmToken) {
        try {
          await fcm.send({
            token: fcmToken,
            notification: {
              title: String(payload.title || 'ViMore'),
              body: String(payload.body || ''),
            },
            data: Object.fromEntries(
              Object.entries(payload.data || {}).map(([k, v]) => [k, String(v ?? '')])
            ),
          });
          sent += 1;
        } catch {
          // Ignore invalid/expired FCM token
        }
      }
    }

    return NextResponse.json({ ok: true, sent });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Push send failed' }, { status: 500 });
  }
}
