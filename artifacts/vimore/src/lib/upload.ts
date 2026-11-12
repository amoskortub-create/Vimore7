/** Browser-only Appwrite Storage upload helpers. */

import { account, client, ID, Permission, Role, storage, BUCKET, getFileUrl } from './appwrite';

const UPLOADABLE_MIME_TYPES = new Set([
  'application/pdf',
  'image/avif',
  'image/gif',
  'image/heic',
  'image/heif',
  'image/jpeg',
  'image/png',
  'image/webp',
  'audio/aac',
  'audio/mpeg',
  'audio/mp4',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
  'audio/x-wav',
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-m4v',
]);

function validateUploadFile(file: File | null | undefined): asserts file is File {
  if (!file || typeof file.size !== 'number' || file.size <= 0 ||
      typeof file.type !== 'string' || !UPLOADABLE_MIME_TYPES.has(file.type.toLowerCase())) {
    throw new Error('Invalid file');
  }
}

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
  const appwriteError = error as { message?: string; code?: number | string; status?: number | string; type?: string };
  const message = appwriteError?.message || String(error);
  const code = appwriteError?.code ?? appwriteError?.status;
  const numericCode = Number(code);
  const type = appwriteError?.type || '';
  const detail = `${message} (Appwrite code: ${code ?? 'unknown'}; file size: ${formatFileSize(file.size)}; bucketId: ${bucketId})`;
  const errorType = `${type} ${message}`.toLowerCase();

  if (numericCode === 500) {
    return new Error(`Upload failed for bucket ${bucketId}. Appwrite code: 500; message: ${message}`);
  }
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

async function filePermissions(bucketId: string, permissions?: string[]): Promise<string[]> {
  if (permissions) return permissions;
  if (bucketId === BUCKET.PAYMENT_SCREENSHOTS) {
    const user = await account.get();
    return [Permission.read(Role.user(user.$id))];
  }
  return [Permission.read(Role.any())];
}

function isAppwrite500(error: unknown): boolean {
  const appwriteError = error as { code?: number | string; status?: number | string };
  return Number(appwriteError?.code ?? appwriteError?.status) === 500;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function createFileWithRetry(file: File, bucketId: string, fileId: string, permissions: string[]) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await storage.createFile(bucketId, fileId, file, permissions);
    } catch (error) {
      if (attempt > 0 || !isAppwrite500(error)) throw uploadError(error, file, bucketId);
      await delay(2000);
    }
  }
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

async function createFile(file: File, bucketId: string, fileId?: string, permissions?: string[]) {
  const maxFileSize = await getBucketMaxFileSize(bucketId);
  if (maxFileSize !== null && file.size > maxFileSize) {
    throw new Error(`File too large - max ${formatFileSize(maxFileSize)} for bucket ${bucketId}. Your file is ${formatFileSize(file.size)}.`);
  }
  return createFileWithRetry(file, bucketId, fileId || ID.unique(), await filePermissions(bucketId, permissions));
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
  file: File | null | undefined,
  bucketId: string,
  fileId?: string,
  permissions?: string[],
): Promise<string> {
  validateUploadFile(file);
  const normalizedFile = normalizeUploadFile(file, 'upload.bin');
  const uploaded = await createFile(normalizedFile, bucketId, fileId, permissions);
  return uploaded.$id;
}

export interface ClientUploadOptions {
  onProgress?: (pct: number) => void;
  signal?: AbortSignal;
  timeoutMs?: number;
  permissions?: string[];
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
  file: File | null | undefined,
  bucketId: string,
  fileId: string | undefined,
  options: ClientUploadOptions = {},
): Promise<string> {
  if (options.signal?.aborted) throw new Error('Upload cancelled');
  validateUploadFile(file);
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
      createFileWithRetry(
        normalizedFile,
        bucketId,
        fileId || ID.unique(),
        await filePermissions(bucketId, options.permissions),
      ),
      timeout,
    ]);
    options.onProgress?.(1);
    return uploaded.$id;
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

/**
 * Upload voice recordings directly through the Appwrite Web SDK.
 */
export async function uploadVoiceViaClient(file: File): Promise<{ fileId: string; mediaUrl: string }> {
  const normalizedFile = normalizeUploadFile(file, 'voice.webm');
  const fileId = await uploadViaClient(normalizedFile, BUCKET.VOICE_MESSAGES);
  return {
    fileId,
    mediaUrl: getFileUrl(BUCKET.VOICE_MESSAGES, fileId),
  };
}
