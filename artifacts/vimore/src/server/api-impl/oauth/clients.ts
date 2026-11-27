import { NextRequest, NextResponse } from 'next/server';
import {
  createOAuthClient,
  deleteOAuthClient,
  getOAuthClient,
  isSafeHttpUrl,
  isValidRedirectUri,
  listOAuthClients,
} from '@/lib/oauth-server';
import { getAuthenticatedProfile } from '@/lib/server-helpers';

export async function GET(req: NextRequest) {
  try {
    const ownerId = req.nextUrl.searchParams.get('owner_id') || '';
    const clientId = req.nextUrl.searchParams.get('client_id') || '';

    if (ownerId === '_lookup_' && clientId) {
      const client: any = await getOAuthClient(clientId);
      if (!client) return NextResponse.json({ client: null }, { status: 404 });
      return NextResponse.json({
        client: {
          client_id: client.client_id || client.$id,
          name: client.name || '',
          description: client.description || '',
          logo_url: client.logo_url || '',
          website_url: client.website_url || '',
          redirect_uris: Array.isArray(client.redirect_uris) ? client.redirect_uris : [],
        },
      });
    }

    const session = await getAuthenticatedProfile(req);
    if (!session) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const authenticatedUserId = session.profileDoc?.$id || session.authUser.$id;

    const clients = await listOAuthClients(authenticatedUserId);
    const sanitized = clients.map(({ client_secret: _secret, ...rest }: any) => rest);
    return NextResponse.json({ clients: sanitized });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to load clients' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthenticatedProfile(req);
    if (!session) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const authenticatedUserId = session.profileDoc?.$id || session.authUser.$id;

    const body = await req.json().catch(() => ({}));
    const name = String(body.name || '').trim().slice(0, 100);
    const description = String(body.description || '').trim().slice(0, 500);
    const logo_url = String(body.logo_url || '').trim().slice(0, 500);
    const website_url = String(body.website_url || '').trim().slice(0, 500);
    const redirect_uris: string[] = Array.isArray(body.redirect_uris)
      ? Array.from(new Set<string>(body.redirect_uris.map((u: unknown) => String(u).trim()).filter(Boolean)))
      : [];

    if (!name || !redirect_uris.length) {
      return NextResponse.json(
        { error: 'App name and at least one redirect URI are required' },
        { status: 400 }
      );
    }

    const invalidUri = redirect_uris.find((u: string) => !isValidRedirectUri(u));
    if (invalidUri) {
      return NextResponse.json(
        { error: `Invalid redirect URI: ${invalidUri}. Must be an http:// or https:// URL without fragments.` },
        { status: 400 }
      );
    }

    if (!isSafeHttpUrl(website_url) || !isSafeHttpUrl(logo_url)) {
      return NextResponse.json(
        { error: 'Website URL and Logo URL must use http:// or https://' },
        { status: 400 }
      );
    }

    const result = await createOAuthClient({
      name,
      description,
      logo_url,
      website_url,
      redirect_uris,
      owner_id: authenticatedUserId,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to create client' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getAuthenticatedProfile(req);
    if (!session) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const authenticatedUserId = session.profileDoc?.$id || session.authUser.$id;

    const body = await req.json().catch(() => ({}));
    const docId = String(body.doc_id || body.client_id || '').trim();

    if (!docId) {
      return NextResponse.json({ error: 'doc_id is required' }, { status: 400 });
    }

    await deleteOAuthClient(docId, authenticatedUserId);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    const status = err?.message === 'Unauthorized' ? 403 : 500;
    return NextResponse.json({ error: err?.message || 'Delete failed' }, { status });
  }
}
