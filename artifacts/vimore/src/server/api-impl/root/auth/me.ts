import { NextRequest, NextResponse } from 'next/server';
import { getRawAuthenticatedProfile, isAccountDeleted } from '@/lib/server-helpers';

export async function GET(req: NextRequest) {
  const session = await getRawAuthenticatedProfile(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (isAccountDeleted(session.profileDoc)) {
    return NextResponse.json(
      {
        error: 'This account has been deleted and is scheduled for permanent data deletion after 90 days.',
        deleted: true,
        scheduledDeletionAt: session.profileDoc?.scheduled_deletion_at || null,
      },
      { status: 403 }
    );
  }

  let safeProfile = session.profileDoc;
  let hasSecurityPin = false;
  if (safeProfile) {
    const { biometric_pin_hash, security_answer: _sa, ...rest } = safeProfile;
    hasSecurityPin = Boolean(biometric_pin_hash);
    safeProfile = { ...rest, has_security_pin: hasSecurityPin };
  }

  return NextResponse.json({
    authUser: session.authUser,
    profileDoc: safeProfile,
    hasSecurityPin,
  });
}
