'use client';

import { ID, BUCKET, getFileUrl } from './appwrite';
import { chunkedUploadToAppwrite, UPLOAD_CHUNK_SIZE } from './chunked-upload';

export interface LargeUploadOptions {
  signal?: AbortSignal;
  onProgress?: (pct: number) => void;
  timeoutMs?: number;
  chunkSize?: number;
}

export async function optimizeAndBufferImage(
  file: File,
  opts?: { maxEdge?: number; quality?: number }
): Promise<File> {
  if (typeof window === 'undefined' || !file.type.startsWith('image/')) {
    return file;
  }

  const maxEdge = opts?.maxEdge ?? 1600;
  const quality = opts?.quality ?? 0.85;
  const baseName = (file.name || 'image').replace(/\.[^.]+$/, '') || 'image';

  if (file.type === 'image/gif' || file.type === 'image/svg+xml') {
    const buf = await file.arrayBuffer();
    return new File([buf], file.name || `${baseName}.gif`, { type: file.type });
  }

  try {
    const tempUrl = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = reject;
        el.src = tempUrl;
      });

      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      const longest = Math.max(w, h);

      if (file.size <= 380 * 1024 && longest <= maxEdge) {
        const buf = await file.arrayBuffer();
        return new File([buf], file.name || `${baseName}.jpg`, { type: file.type || 'image/jpeg' });
      }

      const scale = longest > maxEdge ? maxEdge / longest : 1;
      const outW = Math.max(1, Math.round(w * scale));
      const outH = Math.max(1, Math.round(h * scale));
      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('No 2d context');
      ctx.drawImage(img, 0, 0, outW, outH);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/jpeg', quality)
      );
      if (!blob) throw new Error('Canvas encoding failed');
      return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
    } finally {
      URL.revokeObjectURL(tempUrl);
    }
  } catch {
    const buf = await file.arrayBuffer();
    return new File([buf], file.name || `${baseName}.jpg`, { type: file.type || 'image/jpeg' });
  }
}

export async function uploadViaClient(
  file: File,
  bucketId: string,
  customFileId?: string
): Promise<string> {
  return uploadLargeViaClient(file, bucketId, customFileId, {
    chunkSize: UPLOAD_CHUNK_SIZE,
    timeoutMs: 240_000,
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
    const preparedFile = file.type.startsWith('image/')
      ? await optimizeAndBufferImage(file)
      : file;

    const res = await chunkedUploadToAppwrite({
      bucketId,
      fileId,
      file: preparedFile,
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
