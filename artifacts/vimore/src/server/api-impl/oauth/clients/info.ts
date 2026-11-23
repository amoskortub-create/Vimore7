import { NextRequest, NextResponse } from 'next/server';
import { getOAuthClient } from '@/lib/oauth-server';

export async function GET(req: NextRequest) {
  try {
    const clientId = req.nextUrl.searchParams.get('client_id') || '';
    if (!clientId) {
      return NextResponse.json({ error: 'client_id is required' }, { status: 400 });
    }

    const client: any = await getOAuthClient(clientId);
    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    return NextResponse.json({
      client_id: client.client_id || client.$id,
      name: client.name || '',
      description: client.description || '',
      logo_url: client.logo_url || '',
      website_url: client.website_url || '',
      redirect_uris: Array.isArray(client.redirect_uris) ? client.redirect_uris : [],
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to fetch client info' }, { status: 500 });
  }
}
