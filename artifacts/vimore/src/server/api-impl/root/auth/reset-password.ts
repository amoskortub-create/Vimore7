import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    {
      error:
        'Password recovery via security questions is disabled. Please contact ViMore Support or an administrator for account recovery.',
    },
    { status: 403 }
  );
}
