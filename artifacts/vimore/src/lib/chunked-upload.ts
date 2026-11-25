'use client';

import { account } from './appwrite';
import { authFetch, getSessionFromStorage } from './auth-fetch';

const ENDPOINT = (
  process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://appwrite.mediatechliberia.online/v1'
).replace(/\/$/, '');

const PROJECT_ID = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || 'vimore123';

// Keep every chunk strictly below nginx's 1 MB client_max_body_size and reverse-proxy limits
export const UPLOAD_CHUNK_SIZE = 450 * 1024; // 450 KB per chunk

// ── JWT cache ──────────────────────────────────────────────────────────────
let cachedJwt = '';
let jwtExpiresAt = 0;
let cachedJwtUserId = '';

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Auth lookup timed out')), ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

async function tryGetDirectAuth(): Promise<{ mode: 'jwt'; token: string } | { mode: 'server' }> {
  const session = getSessionFromStorage();
  try {
    const user = await withTimeout(account.get(), 4000);
    if (cachedJwtUserId && cachedJwtUserId !== user.$id) {
      cachedJwt = '';
      jwtExpiresAt = 0;
    }
    if (cachedJwtUserId === user.$id && Date.now() < jwtExpiresAt - 60_000 && cachedJwt) {
      return { mode: 'jwt', token: cachedJwt };
    }
    const { jwt } = await withTimeout(account.createJWT(), 4000);
    cachedJwt = jwt;
    cachedJwtUserId = user.$id;
    jwtExpiresAt = Date.now() + 14 * 60 * 1000;
    return { mode: 'jwt', token: jwt };
  } catch {
    if (session || typeof window !== 'undefined') {
      return { mode: 'server' };
    }
    return { mode: 'server' };
  }
}

async function safeFilePart(chunk: Blob, file: File): Promise<File> {
  const name = file.name && file.name.trim() ? file.name : 'upload.bin';
  const type = file.type && file.type.trim() ? file.type : 'application/octet-stream';
  try {
    const buffer = await chunk.arrayBuffer();
    return new File([buffer], name, { type });
  } catch {
    throw new Error('Could not read the selected file from your device. Please pick it again.');
  }
}

function normalizeUploadError(err: unknown): Error {
  const msg = err instanceof Error ? err.message : String(err || 'Upload failed');
  if (/failed to fetch|networkerror|load failed/i.test(msg)) {
    return new Error('Network connection interrupted during upload. Please check your signal and try again.');
  }
  return err instanceof Error ? err : new Error(msg);
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
    maxRetries = 4,
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

  let auth: { mode: 'jwt'; token: string } | { mode: 'server' } =
    typeof window !== 'undefined' ? { mode: 'server' } : await tryGetDirectAuth();
  let resolvedFileId = fileId;
  let offset = 0;

  while (offset < totalSize) {
    if (signal?.aborted) throw new Error('Upload cancelled');

    const chunkEnd = Math.min(offset + effectiveChunkSize, totalSize);
    const chunkFile = await safeFilePart(file.slice(offset, chunkEnd), file);

    let attempt = 0;
    let lastErr: Error | null = null;
    let switchedFallback = false;

    while (attempt < maxRetries) {
      if (signal?.aborted) throw new Error('Upload cancelled');
      try {
        let res: Response;
        const contentRange = `bytes ${offset}-${chunkEnd - 1}/${totalSize}`;

        if (auth.mode === 'server') {
          try {
            res = await uploadChunkViaServer({
              bucketId,
              fileId: resolvedFileId,
              chunkFile,
              contentRange,
              includeAppwriteId: offset > 0,
              jwt: cachedJwt && Date.now() < jwtExpiresAt ? cachedJwt : undefined,
              signal,
            });
            if (!res.ok && !switchedFallback && (res.status === 404 || res.status === 413 || res.status >= 500)) {
              const direct = await tryGetDirectAuth();
              if (direct.mode === 'jwt') {
                switchedFallback = true;
                auth = direct;
                continue;
              }
            }
          } catch (serverErr) {
            if (!switchedFallback) {
              const direct = await tryGetDirectAuth();
              if (direct.mode === 'jwt') {
                switchedFallback = true;
                auth = direct;
                continue;
              }
            }
            throw serverErr;
          }
        } else {
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
            auth = { mode: 'server' };
            res = await uploadChunkViaServer({
              bucketId,
              fileId: resolvedFileId,
              chunkFile,
              contentRange,
              includeAppwriteId: offset > 0,
              jwt: auth.mode === 'server' ? (cachedJwt || undefined) : undefined,
              signal,
            });
          }
        }

        if (res.status === 201 || res.status === 200 || res.status === 204) {
          const body = await res.json().catch(() => ({}));
          if (body?.$id) resolvedFileId = body.$id;
          lastErr = null;
          break;
        }

        if (auth.mode === 'jwt' && (res.status === 401 || res.status === 403 || res.status === 413)) {
          auth = { mode: 'server' };
          continue;
        }

        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || body.message || `HTTP ${res.status}`);
      } catch (e: any) {
        if (signal?.aborted || e?.name === 'AbortError') throw new Error('Upload cancelled');
        lastErr = normalizeUploadError(e);
        attempt++;
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 800 * attempt));
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
  jwt,
  signal,
}: {
  bucketId: string;
  fileId: string;
  chunkFile: File;
  contentRange?: string;
  includeAppwriteId?: boolean;
  jwt?: string;
  signal?: AbortSignal;
}): Promise<Response> {
  const formData = new FormData();
  formData.append('bucketId', bucketId);
  formData.append('fileId', fileId);
  formData.append('file', chunkFile);
  if (contentRange) formData.append('contentRange', contentRange);
  if (includeAppwriteId) formData.append('appwriteId', fileId);

  const headers: Record<string, string> = {};
  if (jwt) headers['Authorization'] = `Bearer ${jwt}`;

  return authFetch('/api/upload/chunk', {
    method: 'POST',
    headers,
    body: formData,
    signal,
  });
}

// ── Single-chunk helper (≤ 450 KB) ─────────────────────────────────────────
async function uploadSingleChunk({
  bucketId,
  fileId,
  file,
  onProgress,
  maxRetries = 4,
  signal,
}: {
  bucketId: string;
  fileId: string;
  file: File;
  onProgress?: (pct: number) => void;
  maxRetries?: number;
  signal?: AbortSignal;
}): Promise<{ $id: string }> {
  let auth: { mode: 'jwt'; token: string } | { mode: 'server' } =
    typeof window !== 'undefined' ? { mode: 'server' } : await tryGetDirectAuth();
  const safeFile = await safeFilePart(file, file);

  let attempt = 0;
  let lastErr: Error | null = null;
  let switchedFallback = false;

  while (attempt < maxRetries) {
    if (signal?.aborted) throw new Error('Upload cancelled');
    try {
      let res: Response;
      if (auth.mode === 'server') {
        try {
          res = await uploadChunkViaServer({
            bucketId,
            fileId,
            chunkFile: safeFile,
            jwt: cachedJwt && Date.now() < jwtExpiresAt ? cachedJwt : undefined,
            signal,
          });
          if (!res.ok && !switchedFallback && (res.status === 404 || res.status === 413 || res.status >= 500)) {
            const direct = await tryGetDirectAuth();
            if (direct.mode === 'jwt') {
              switchedFallback = true;
              auth = direct;
              continue;
            }
          }
        } catch (serverErr) {
          if (!switchedFallback) {
            const direct = await tryGetDirectAuth();
            if (direct.mode === 'jwt') {
              switchedFallback = true;
              auth = direct;
              continue;
            }
          }
          throw serverErr;
        }
      } else {
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
            jwt: cachedJwt || undefined,
            signal,
          });
        }
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
      lastErr = normalizeUploadError(e);
      attempt++;
      if (attempt < maxRetries) await new Promise(r => setTimeout(r, 800 * attempt));
    }
  }

  throw lastErr ?? new Error('Upload failed');
}
