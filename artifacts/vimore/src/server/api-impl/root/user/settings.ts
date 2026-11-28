import { NextRequest, NextResponse } from 'next/server';
import { DATABASE_ID, getAdminDatabases } from '@/lib/appwrite-server';
import { COL } from '@/lib/appwrite';
import { getAuthenticatedProfile } from '@/lib/server-helpers';

const ALLOWED_SETTINGS_KEYS = new Set([
  'theme',
  'hapticIntensity',
  'isGhostMode',
  'playbackQuality',
  'fontScale',
  'isAutoFollowEnabled',
  'activeSoundSet',
  'isBiometricActive',
  'isHardwareEnrolled',
  'biometricProtectedAreas',
  'taggingPrivacy',
  'discoveryVisibility',
  'showReadReceipts',
  'legacyContact',
  'isSilenceActive',
  'silenceStart',
  'silenceEnd',
  'defaultStream',
  'isMusicEnabled',
  'isFreeMode',
  'isGiftingEnabled',
  'isAiVerificationActive',
  'isSensitivityFilterActive',
  'autoTranslate',
  'pushSocialAlerts',
  'pushMessageAlerts',
  'isPrivateAccount',
]);

function parseSettingsJson(raw: any): Record<string, any> {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

export async function GET(req: NextRequest) {
  try {
    const session = await getAuthenticatedProfile(req);
    if (!session?.profileDoc) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const doc = session.profileDoc;
    const saved = parseSettingsJson(doc.settings_json);

    return NextResponse.json({
      ok: true,
      settings: {
        ...saved,
        isPrivateAccount: typeof doc.is_private === 'boolean' ? doc.is_private : Boolean(saved.isPrivateAccount),
      },
      hasSecurityPin: Boolean(doc.biometric_pin_hash),
      pushEnabled: Boolean(doc.push_enabled),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to load settings' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthenticatedProfile(req);
    if (!session?.profileDoc) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const incoming = body.settings && typeof body.settings === 'object' ? body.settings : body;

    const existing = parseSettingsJson(session.profileDoc.settings_json);
    const merged: Record<string, any> = { ...existing };

    for (const [k, v] of Object.entries(incoming || {})) {
      if (ALLOWED_SETTINGS_KEYS.has(k) && v !== undefined) {
        merged[k] = v;
      }
    }

    const serialized = JSON.stringify(merged);
    if (serialized.length > 3950) {
      return NextResponse.json({ error: 'Settings payload too large' }, { status: 400 });
    }

    const docUpdates: Record<string, any> = {
      settings_json: serialized,
    };

    if (typeof merged.isGhostMode === 'boolean') {
      docUpdates.show_activity = !merged.isGhostMode;
      if (merged.isGhostMode) {
        docUpdates.is_online = false;
      }
    }
    if (typeof merged.isPrivateAccount === 'boolean') {
      docUpdates.is_private = merged.isPrivateAccount;
    }
    if (typeof body.pushEnabled === 'boolean') {
      docUpdates.push_enabled = body.pushEnabled;
    }

    const db = getAdminDatabases();
    await db.updateDocument(DATABASE_ID, COL.USERS, session.authUser.$id, docUpdates);

    return NextResponse.json({
      ok: true,
      settings: merged,
      hasSecurityPin: Boolean(session.profileDoc.biometric_pin_hash),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to save settings' }, { status: 500 });
  }
}
