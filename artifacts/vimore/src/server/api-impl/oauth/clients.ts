import { NextRequest, NextResponse } from 'next/server';
import {
  createOAuthClient,
  deleteOAuthClient,
  getOAuthClient,
  listOAuthClients,
} from '@/lib/oauth-server';

export async function GET(req: NextRequest) {
  try {
    const ownerId = req.nextUrl.searchParams.get('owner_id') || '';
    const clientId = req.nextUrl.searchParams.get('client_id') || '';

    if (ownerId === '_lookup_' && clientId) {
      const client: any = await getOAuthClient(clientId);
      if (!client) return NextResponse.json({ client: null }, { status: 404 });
      const { client_secret: _secret, ...safe } = client;
      return NextResponse.json({ client: safe });
    }

    if (!ownerId) {
      return NextResponse.json({ error: 'owner_id is required' }, { status: 400 });
    }

    const clients = await listOAuthClients(ownerId);
    const sanitized = clients.map(({ client_secret: _secret, ...rest }: any) => rest);
    return NextResponse.json({ clients: sanitized });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to load clients' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const name = String(body.name || '').trim();
    const owner_id = String(body.owner_id || '').trim();
    const redirect_uris = Array.isArray(body.redirect_uris)
      ? body.redirect_uris.map((u: any) => String(u).trim()).filter(Boolean)
      : [];

    if (!name || !owner_id || !redirect_uris.length) {
      return NextResponse.json(
        { error: 'name, owner_id, and at least one redirect_uri are required' },
        { status: 400 }
      );
    }

    const result = await createOAuthClient({
      name,
      description: String(body.description || ''),
      logo_url: String(body.logo_url || ''),
      website_url: String(body.website_url || ''),
      redirect_uris,
      owner_id,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to create client' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const docId = String(body.doc_id || body.client_id || '').trim();
    const ownerId = String(body.owner_id || '').trim();

    if (!docId || !ownerId) {
      return NextResponse.json({ error: 'doc_id and owner_id are required' }, { status: 400 });
    }

    await deleteOAuthClient(docId, ownerId);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    const status = err?.message === 'Unauthorized' ? 403 : 500;
    return NextResponse.json({ error: err?.message || 'Delete failed' }, { status });
  }
}
