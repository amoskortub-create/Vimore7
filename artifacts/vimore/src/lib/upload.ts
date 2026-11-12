/** Browser-only Appwrite Storage upload helpers. */

import { client, ID, storage, BUCKET, getFileUrl } from './appwrite';
import { authFetch } from './auth-fetch';

function normalizeUploadFile(file: File, fallbackName: string): File {
  // Capacitor/WebView can return a File-like object from a different realm,
  // making `instanceof File` unreliable. Re-wrap it in the current realm.
  if (typeof File !== 'undefined' && file instanceof File) return file;
  if (typeof Blob !== 'undefined' && file instanceof Blob) {
    return new File([file], fallbackName, { type: file.type || 'application/octet-stream' });
  }
  throw new Error('A browser File is required for upload');
}

function formatFileSize(size: number): string {
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

function uploadError(error: unknown, file: File, bucketId: string): Error {
  const appwriteError = error as { message?: string; code?: number | string; type?: string };
  const message = appwriteError?.message || String(error);
  const code = appwriteError?.code;
  const numericCode = Number(code);
  const type = appwriteError?.type || '';
  const detail = `${message} (Appwrite code: ${code ?? 'unknown'}; file size: ${formatFileSize(file.size)}; bucketId: ${bucketId})`;
  const errorType = `${type} ${message}`.toLowerCase();

  if (numericCode === 404 || errorType.includes('storage_bucket_not_found')) {
    return new Error(`Storage bucket not found for bucket ${bucketId}. ${detail}`);
  }
  if (numericCode === 401 || numericCode === 403 || /permission|unauthorized|forbidden/.test(errorType)) {
    return new Error(`Storage permission denied for bucket ${bucketId}. ${detail}`);
  }
  if (numericCode === 413 || /too.?large|file.?size/.test(errorType)) {
    const maxMegabytes = message.match(/(\d+(?:\.\d+)?)\s*(?:mb|mib)/i)?.[1];
    const maxBytes = message.match(/([\d,]+(?:\.\d+)?)\s*(?:bytes|b)\b/i)?.[1];
    const maxSize = maxMegabytes
      ? `${maxMegabytes} MB`
      : maxBytes
        ? formatFileSize(Number(maxBytes.replace(/,/g, '')))
        : 'configured bucket limit';
    return new Error(`File too large - max ${maxSize} for bucket ${bucketId}. ${detail}`);
  }
  return new Error(`Upload failed for bucket ${bucketId}. ${detail}`);
}

async function getBucketMaxFileSize(bucketId: string): Promise<number | null> {
  try {
    const bucket = await client.call(
      'get',
      new URL(`${client.config.endpoint}/storage/buckets/${encodeURIComponent(bucketId)}`),
      { 'content-type': 'application/json' },
    );
    return bucket.maximumFileSize ?? null;
  } catch (error) {
    const appwriteError = error as { code?: number | string; message?: string };
    console.warn(`[upload] Could not read file-size limit for bucket ${bucketId}; attempting direct upload.`, {
      code: appwriteError?.code,
      message: appwriteError?.message || String(error),
    });
    return null;
  }
}

async function createFile(file: File, bucketId: string, fileId?: string) {
  const maxFileSize = await getBucketMaxFileSize(bucketId);
  if (maxFileSize !== null && file.size > maxFileSize) {
    throw new Error(`File too large - max ${formatFileSize(maxFileSize)} for bucket ${bucketId}. Your file is ${formatFileSize(file.size)}.`);
  }

  try {
    return await storage.createFile(bucketId, fileId || ID.unique(), file);
  } catch (error) {
    throw uploadError(error, file, bucketId);
  }
}

/**
 * Upload a file directly from the browser through the Appwrite Web SDK.
 *
 * The Appwrite project must include the current browser origin as a Web
 * platform. The API key must never be used in this client-side function.
 *
 * @param file     The File object to upload.
 * @param bucketId The Appwrite storage bucket ID (use BUCKET.* constants).
 * @param fileId   Optional desired file ID; auto-generated if omitted.
 * @returns        The Appwrite fileId (use getFileUrl() to build a URL from it).
 */
export async function uploadViaClient(
  file: File,
  bucketId: string,
  fileId?: string,
): Promise<string> {
  const normalizedFile = normalizeUploadFile(file, 'upload.bin');
  const uploaded = await createFile(normalizedFile, bucketId, fileId);
  return uploaded.$id;
}

export interface ClientUploadOptions {
  onProgress?: (pct: number) => void;
  signal?: AbortSignal;
  timeoutMs?: number;
}

/**
 * Upload a file through the browser SDK. Appwrite handles the multipart
 * request; the optional progress callback is completed when the request
 * finishes. Abort is checked before starting because the SDK request itself
 * does not expose a cancellation signal.
 *
 * @param file     The File object to upload.
 * @param bucketId The Appwrite storage bucket ID (use BUCKET.* constants).
 * @param fileId   The Appwrite file ID for this upload session.
 * @param options  Progress callback and AbortSignal.
 * @returns        The Appwrite fileId.
 */
export async function uploadLargeViaClient(
  file: File,
  bucketId: string,
  fileId: string | undefined,
  options: ClientUploadOptions = {},
): Promise<string> {
  if (options.signal?.aborted) throw new Error('Upload cancelled');
  const normalizedFile = normalizeUploadFile(file, 'upload.bin');
  const maxFileSize = await getBucketMaxFileSize(bucketId);
  if (maxFileSize !== null && normalizedFile.size > maxFileSize) {
    throw new Error(`File too large - max ${formatFileSize(maxFileSize)} for bucket ${bucketId}. Your file is ${formatFileSize(normalizedFile.size)}.`);
  }
  const timeoutMs = options.timeoutMs ?? 180_000;
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error('Upload timed out. Please check your connection and try again.')), timeoutMs);
  });
  try {
    const uploaded = await Promise.race([
      storage.createFile(bucketId, fileId || ID.unique(), normalizedFile)
        .catch(error => { throw uploadError(error, normalizedFile, bucketId); }),
      timeout,
    ]);
    options.onProgress?.(1);
    return uploaded.$id;
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

/**
 * Upload voice recordings through the same-origin server route. This avoids
 * Appwrite CORS and cross-realm File issues in Capacitor Android WebViews.
 */
export async function uploadVoiceViaServer(file: File): Promise<{ fileId: string; mediaUrl: string }> {
  const normalizedFile = normalizeUploadFile(file, 'voice.webm');
  const formData = new FormData();
  formData.append('file', normalizedFile, normalizedFile.name || 'voice.webm');

  const response = await authFetch('/api/upload/voice', {
    method: 'POST',
    body: formData,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.fileId) {
    throw new Error(data?.error || 'Could not save the voice message.');
  }
  return {
    fileId: data.fileId,
    mediaUrl: data.mediaUrl || getFileUrl(BUCKET.VOICE_MESSAGES, data.fileId),
  };
}
