import { NextRequest, NextResponse } from 'next/server';
import { getOAuthClient } from '@/lib/oauth-server';

export async function GET(req: NextRequest) {
  try {
    const clientId = req.nextUrl.searchParams.get('client_id') || '';
    const redirectUri = req.nextUrl.searchParams.get('redirect_uri') || '';
    if (!clientId) {
      return NextResponse.json({ error: 'client_id is required' }, { status: 400 });
    }

    const client: any = await getOAuthClient(clientId);
    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    const redirectUris: string[] = Array.isArray(client.redirect_uris) ? client.redirect_uris : [];
    if (redirectUri && !redirectUris.includes(redirectUri)) {
      return NextResponse.json(
        { error: 'Redirect URI does not match any registered URI for this app.' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      client_id: client.client_id || client.$id,
      name: client.name || '',
      description: client.description || '',
      logo_url: client.logo_url || '',
      website_url: client.website_url || '',
      redirect_uris: redirectUris,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to fetch client info' }, { status: 500 });
  }
}
