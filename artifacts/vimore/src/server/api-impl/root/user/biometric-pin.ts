import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { DATABASE_ID, getAdminDatabases } from '@/lib/appwrite-server';
import { COL } from '@/lib/appwrite';
import { getAuthenticatedProfile, verifyUserPassword } from '@/lib/server-helpers';

function hashPin(pin: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(pin, salt, 32).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPinHash(pin: string, stored: string): boolean {
  const parts = String(stored || '').split(':');
  if (parts.length !== 2) return false;
  const [salt, expectedHex] = parts;
  if (!salt || !expectedHex) return false;
  try {
    const derived = crypto.scryptSync(pin, salt, 32);
    const expected = Buffer.from(expectedHex, 'hex');
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthenticatedProfile(req);
    if (!session?.profileDoc) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '').toLowerCase();
    const doc = session.profileDoc;
    const db = getAdminDatabases();
    const email = String(session.authUser.email || doc.email || '').trim().toLowerCase();

    if (action === 'status') {
      return NextResponse.json({
        ok: true,
        hasPin: Boolean(doc.biometric_pin_hash),
      });
    }

    if (action === 'set') {
      const pin = String(body.pin || '').trim();
      const currentPinOrPassword = String(body.currentCredential || '');
      if (!/^\d{4,8}$/.test(pin)) {
        return NextResponse.json(
          { error: 'Security PIN must be 4 to 8 digits.' },
          { status: 400 }
        );
      }

      if (doc.biometric_pin_hash) {
        const pinOk = currentPinOrPassword ? verifyPinHash(currentPinOrPassword, doc.biometric_pin_hash) : false;
        const pwOk = !pinOk && currentPinOrPassword && email
          ? await verifyUserPassword(email, currentPinOrPassword)
          : false;
        if (!pinOk && !pwOk) {
          return NextResponse.json(
            { error: 'Enter your current PIN or account password to update your Security PIN.' },
            { status: 403 }
          );
        }
      }

      const pinHash = hashPin(pin);
      await db.updateDocument(DATABASE_ID, COL.USERS, session.authUser.$id, {
        biometric_pin_hash: pinHash,
      });

      return NextResponse.json({ ok: true, hasPin: true });
    }

    if (action === 'remove') {
      const credential = String(body.credential || '');
      if (doc.biometric_pin_hash) {
        const pinOk = credential ? verifyPinHash(credential, doc.biometric_pin_hash) : false;
        const pwOk = !pinOk && credential && email
          ? await verifyUserPassword(email, credential)
          : false;
        if (!pinOk && !pwOk) {
          return NextResponse.json(
            { error: 'Enter your current PIN or account password to remove the Security PIN.' },
            { status: 403 }
          );
        }
      }
      await db.updateDocument(DATABASE_ID, COL.USERS, session.authUser.$id, {
        biometric_pin_hash: '',
      });
      return NextResponse.json({ ok: true, hasPin: false });
    }

    if (action === 'verify') {
      const pin = String(body.pin || '').trim();
      const password = String(body.password || '');

      if (pin) {
        if (!doc.biometric_pin_hash) {
          return NextResponse.json({ error: 'No Security PIN has been configured.' }, { status: 400 });
        }
        if (!verifyPinHash(pin, doc.biometric_pin_hash)) {
          return NextResponse.json({ error: 'Incorrect Security PIN.' }, { status: 403 });
        }
        return NextResponse.json({ ok: true, method: 'pin' });
      }

      if (password) {
        const valid = await verifyUserPassword(email, password);
        if (!valid) {
          return NextResponse.json({ error: 'Incorrect account password.' }, { status: 403 });
        }
        return NextResponse.json({ ok: true, method: 'password' });
      }

      return NextResponse.json({ error: 'PIN or password is required.' }, { status: 400 });
    }

    return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Security PIN operation failed.' },
      { status: 500 }
    );
  }
}
