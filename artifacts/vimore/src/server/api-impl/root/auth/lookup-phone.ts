import { NextResponse } from 'next/server';

/** Phone resolution now happens inside the credential-checked login handler.
 * This endpoint is retired so it cannot disclose account email addresses.
 */
export async function POST() {
  return NextResponse.json(
    { error: 'Phone lookup is only available during sign in.' },
    { status: 410 },
  );
}
