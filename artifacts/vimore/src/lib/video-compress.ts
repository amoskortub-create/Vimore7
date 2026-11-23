'use client';

export interface VideoCompressionOptions {
  maxDurationSec?: number;
  targetVideoBitrate?: number;
  targetAudioBitrate?: number;
  maxWidth?: number;
  maxHeight?: number;
  onProgress?: (pct: number, label: string) => void;
}

export interface VideoCompressionResult {
  file: File;
  duration: number;
}

async function readVideoDuration(file: File): Promise<number> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return 0;
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    const cleanup = () => {
      try { URL.revokeObjectURL(url); } catch {}
    };
    video.onloadedmetadata = () => {
      const dur = Number.isFinite(video.duration) ? video.duration : 0;
      cleanup();
      resolve(dur);
    };
    video.onerror = () => {
      cleanup();
      resolve(0);
    };
    video.src = url;
  });
}

export async function validateAndCompressVideo(
  file: File,
  opts: VideoCompressionOptions = {}
): Promise<VideoCompressionResult> {
  opts.onProgress?.(0.25, 'Validating video…');
  const duration = await readVideoDuration(file);

  if (opts.maxDurationSec && duration > opts.maxDurationSec) {
    throw new Error(`Video exceeds maximum allowed duration of ${Math.round(opts.maxDurationSec / 60)} minutes.`);
  }

  opts.onProgress?.(1, 'Ready to upload');
  return { file, duration };
}
