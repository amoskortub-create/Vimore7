'use client';

import { ID, BUCKET, getFileUrl } from './appwrite';
import { chunkedUploadToAppwrite, UPLOAD_CHUNK_SIZE } from './chunked-upload';

export interface LargeUploadOptions {
  signal?: AbortSignal;
  onProgress?: (pct: number) => void;
  timeoutMs?: number;
  chunkSize?: number;
}

export async function uploadViaClient(
  file: File,
  bucketId: string,
  customFileId?: string
): Promise<string> {
  return uploadLargeViaClient(file, bucketId, customFileId, {
    chunkSize: UPLOAD_CHUNK_SIZE,
  });
}

export async function uploadLargeViaClient(
  file: File,
  bucketId: string,
  customFileId?: string,
  opts?: LargeUploadOptions
): Promise<string> {
  const fileId = customFileId || ID.unique();
  const controller = opts?.timeoutMs ? new AbortController() : null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  if (controller && opts?.timeoutMs) {
    timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  }

  const signal = opts?.signal ?? controller?.signal;

  try {
    const res = await chunkedUploadToAppwrite({
      bucketId,
      fileId,
      file,
      chunkSize: opts?.chunkSize ?? UPLOAD_CHUNK_SIZE,
      onProgress: opts?.onProgress,
      signal,
    });
    return res.$id;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function uploadVoiceViaServer(
  file: File
): Promise<{ fileId: string; mediaUrl: string }> {
  const fileId = await uploadViaClient(file, BUCKET.VOICE_MESSAGES);
  return {
    fileId,
    mediaUrl: getFileUrl(BUCKET.VOICE_MESSAGES, fileId),
  };
}
