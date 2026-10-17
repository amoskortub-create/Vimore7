import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    { error: 'Password recovery by security answer is disabled. Contact ViMore support.' },
    { status: 410 },
  );
}
