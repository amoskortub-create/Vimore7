'use client';

import { account } from './appwrite';
import { authFetch, getSessionFromStorage } from './auth-fetch';

const ENDPOINT = (
  process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://appwrite.mediatechliberia.online/v1'
).replace(/\/$/, '');

const PROJECT_ID = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || 'vimore123';

// Keep every chunk strictly below nginx's 1 MB client_max_body_size (even with multipart headers)
export const UPLOAD_CHUNK_SIZE = 700 * 1024; // 700 KB per chunk

// ── JWT cache ──────────────────────────────────────────────────────────────
let cachedJwt = '';
let jwtExpiresAt = 0;
let cachedJwtUserId = '';

async function tryGetDirectAuth(): Promise<{ mode: 'jwt'; token: string } | { mode: 'server' }> {
  const session = getSessionFromStorage();
  try {
    const user = await account.get();
    if (cachedJwtUserId && cachedJwtUserId !== user.$id) {
      cachedJwt = '';
      jwtExpiresAt = 0;
    }
    if (cachedJwtUserId === user.$id && Date.now() < jwtExpiresAt - 60_000 && cachedJwt) {
      return { mode: 'jwt', token: cachedJwt };
    }
    const { jwt } = await account.createJWT();
    cachedJwt = jwt;
    cachedJwtUserId = user.$id;
    jwtExpiresAt = Date.now() + 14 * 60 * 1000;
    return { mode: 'jwt', token: jwt };
  } catch {
    // Client-SDK account ops fail on unregistered domains or when session was restored via cookie/header.
    // Fall back to same-origin server chunk upload using authFetch + X-Appwrite-Session.
    if (session || typeof window !== 'undefined') {
      return { mode: 'server' };
    }
    return { mode: 'server' };
  }
}

function safeFilePart(chunk: Blob, file: File): File {
  const name = file.name && file.name.trim() ? file.name : 'upload.bin';
  const type = file.type && file.type.trim() ? file.type : 'application/octet-stream';
  return new File([chunk], name, { type });
}

// ── Types ──────────────────────────────────────────────────────────────────
export interface ChunkUploadOptions {
  bucketId: string;
  fileId: string;
  file: File;
  chunkSize?: number;
  maxRetries?: number;
  onProgress?: (pct: number) => void;
  signal?: AbortSignal;
}

// ── Main upload ────────────────────────────────────────────────────────────
export async function chunkedUploadToAppwrite(
  opts: ChunkUploadOptions
): Promise<{ $id: string }> {
  const {
    bucketId,
    fileId,
    file,
    chunkSize = UPLOAD_CHUNK_SIZE,
    maxRetries = 3,
    onProgress,
    signal,
  } = opts;

  const effectiveChunkSize = Math.min(chunkSize, UPLOAD_CHUNK_SIZE);
  const totalSize = file.size;

  if (totalSize <= effectiveChunkSize) {
    return uploadSingleChunk({
      bucketId,
      fileId,
      file,
      onProgress,
      maxRetries,
      signal,
    });
  }

  let auth = await tryGetDirectAuth();
  let resolvedFileId = fileId;
  let offset = 0;

  while (offset < totalSize) {
    if (signal?.aborted) throw new Error('Upload cancelled');

    const chunkEnd = Math.min(offset + effectiveChunkSize, totalSize);
    const chunkFile = safeFilePart(file.slice(offset, chunkEnd), file);

    let attempt = 0;
    let lastErr: Error | null = null;

    while (attempt < maxRetries) {
      if (signal?.aborted) throw new Error('Upload cancelled');
      try {
        let res: Response;
        const contentRange = `bytes ${offset}-${chunkEnd - 1}/${totalSize}`;

        if (auth.mode === 'jwt') {
          const formData = new FormData();
          formData.append('fileId', resolvedFileId);
          formData.append('file', chunkFile);

          const headers: Record<string, string> = {
            'x-appwrite-project': PROJECT_ID,
            'x-appwrite-jwt': auth.token,
            'content-range': contentRange,
          };
          if (offset > 0) headers['x-appwrite-id'] = resolvedFileId;

          try {
            res = await fetch(`${ENDPOINT}/storage/buckets/${encodeURIComponent(bucketId)}/files`, {
              method: 'POST',
              credentials: 'include',
              headers,
              body: formData,
              signal,
            });
          } catch {
            // CORS/network block on direct Appwrite upload — seamlessly switch to server proxy
            auth = { mode: 'server' };
            res = await uploadChunkViaServer({
              bucketId,
              fileId: resolvedFileId,
              chunkFile,
              contentRange,
              includeAppwriteId: offset > 0,
              signal,
            });
          }
        } else {
          res = await uploadChunkViaServer({
            bucketId,
            fileId: resolvedFileId,
            chunkFile,
            contentRange,
            includeAppwriteId: offset > 0,
            signal,
          });
        }

        if (res.status === 201 || res.status === 200 || res.status === 204) {
          const body = await res.json().catch(() => ({}));
          if (body?.$id) resolvedFileId = body.$id;
          lastErr = null;
          break;
        }

        // If direct Appwrite rejected auth/scope/413, switch to server proxy and retry immediately
        if (auth.mode === 'jwt' && (res.status === 401 || res.status === 403 || res.status === 413)) {
          auth = { mode: 'server' };
          continue;
        }

        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || body.message || `HTTP ${res.status}`);
      } catch (e: any) {
        if (signal?.aborted || e?.name === 'AbortError') throw new Error('Upload cancelled');
        lastErr = e instanceof Error ? e : new Error(String(e));
        attempt++;
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 1000 * attempt));
        }
      }
    }

    if (lastErr) throw lastErr;

    offset = chunkEnd;
    onProgress?.(offset / totalSize);
  }

  return { $id: resolvedFileId };
}

async function uploadChunkViaServer({
  bucketId,
  fileId,
  chunkFile,
  contentRange,
  includeAppwriteId,
  signal,
}: {
  bucketId: string;
  fileId: string;
  chunkFile: File;
  contentRange?: string;
  includeAppwriteId?: boolean;
  signal?: AbortSignal;
}): Promise<Response> {
  const formData = new FormData();
  formData.append('bucketId', bucketId);
  formData.append('fileId', fileId);
  formData.append('file', chunkFile);
  if (contentRange) formData.append('contentRange', contentRange);
  if (includeAppwriteId) formData.append('appwriteId', fileId);

  return authFetch('/api/upload/chunk', {
    method: 'POST',
    body: formData,
    signal,
  });
}

// ── Single-chunk helper (≤ 700 KB) ─────────────────────────────────────────
async function uploadSingleChunk({
  bucketId,
  fileId,
  file,
  onProgress,
  maxRetries = 3,
  signal,
}: {
  bucketId: string;
  fileId: string;
  file: File;
  onProgress?: (pct: number) => void;
  maxRetries?: number;
  signal?: AbortSignal;
}): Promise<{ $id: string }> {
  let auth = await tryGetDirectAuth();
  const safeFile = safeFilePart(file, file);

  let attempt = 0;
  let lastErr: Error | null = null;

  while (attempt < maxRetries) {
    if (signal?.aborted) throw new Error('Upload cancelled');
    try {
      let res: Response;
      if (auth.mode === 'jwt') {
        const formData = new FormData();
        formData.append('fileId', fileId);
        formData.append('file', safeFile);

        try {
          res = await fetch(`${ENDPOINT}/storage/buckets/${encodeURIComponent(bucketId)}/files`, {
            method: 'POST',
            credentials: 'include',
            headers: {
              'x-appwrite-project': PROJECT_ID,
              'x-appwrite-jwt': auth.token,
            },
            body: formData,
            signal,
          });
        } catch {
          auth = { mode: 'server' };
          res = await uploadChunkViaServer({
            bucketId,
            fileId,
            chunkFile: safeFile,
            signal,
          });
        }
      } else {
        res = await uploadChunkViaServer({
          bucketId,
          fileId,
          chunkFile: safeFile,
          signal,
        });
      }

      if (res.ok) {
        const body = await res.json().catch(() => ({}));
        onProgress?.(1);
        return { $id: body?.$id || fileId };
      }

      if (auth.mode === 'jwt' && (res.status === 401 || res.status === 403 || res.status === 413)) {
        auth = { mode: 'server' };
        continue;
      }

      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || body.message || `HTTP ${res.status}`);
    } catch (e: any) {
      if (signal?.aborted || e?.name === 'AbortError') throw new Error('Upload cancelled');
      lastErr = e instanceof Error ? e : new Error(String(e));
      attempt++;
      if (attempt < maxRetries) await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }

  throw lastErr ?? new Error('Upload failed');
}
