import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    { error: 'Direct Orange Money creator earnings updates have been removed. Credits are credited automatically at 80%.' },
    { status: 410 }
  );
}
