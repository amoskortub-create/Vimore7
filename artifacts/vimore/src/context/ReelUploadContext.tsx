'use client';
import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { account, databases, DATABASE_ID, COL, BUCKET, ID } from '@/lib/appwrite';
import { uploadLargeViaClient, uploadViaClient } from '@/lib/upload';
import { validateAndCompressVideo } from '@/lib/video-compress';

export type UploadStatus = 'compressing' | 'uploading' | 'done' | 'error';

export type ReelUploadJob = {
  id: string;
  progress: number;
  label: string;
  status: UploadStatus;
  error?: string;
  retryable?: boolean;
};

type SelectedSound = {
  id: string;
  title: string;
  artist: string;
  startTime: number;
  fileId: string;
};

export type ReelUploadPayload = {
  clips: Blob[];
  totalDuration: number;
  effect: string;
  caption: string;
  visibility: 'public' | 'friends' | 'private';
  allowComments: boolean;
  allowDuet: boolean;
  allowDownloads: boolean;
  selectedSound: SelectedSound | null;
  userId: string;
  username: string;
  coverBlob: Blob | null;
  skipCompression?: boolean; // set true for camera-recorded clips (already compressed)
};

type CtxValue = {
  job: ReelUploadJob | null;
  startUpload: (payload: ReelUploadPayload) => void;
  retryUpload: () => void;
  dismissJob: () => void;
};

const Ctx = createContext<CtxValue>({
  job: null,
  startUpload: () => {},
  retryUpload: () => {},
  dismissJob: () => {},
});

export function ReelUploadProvider({ children }: { children: React.ReactNode }) {
  const [job, setJob] = useState<ReelUploadJob | null>(null);

  // Keep last payload so retry can replay it
  const lastPayloadRef = useRef<ReelUploadPayload | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const runUpload = useCallback(async (payload: ReelUploadPayload) => {
    const id = `reel-${Date.now()}`;
    abortRef.current = new AbortController();
    const { signal } = abortRef.current;

    setJob({ id, progress: 0, label: 'Preparing…', status: 'compressing' });

    try {
      // ── STEP 1: Combine clips ──────────────────────────────────────────
      const actualType = payload.clips[0]?.type || 'video/webm';
      const ext = actualType.includes('mp4') ? 'mp4' : 'webm';
      const combinedBlob = new Blob(payload.clips, { type: actualType });
      const rawFile = new File([combinedBlob], `reel_${Date.now()}.${ext}`, { type: actualType });

      let videoFile = rawFile;
      let videoDuration = payload.totalDuration;

      // ── STEP 2: Compress (skip for camera-recorded clips) ─────────────
      if (!payload.skipCompression) {
        setJob(j => j ? { ...j, status: 'compressing', progress: 2, label: 'Checking video…' } : j);
        try {
          const result = await validateAndCompressVideo(rawFile, {
            maxDurationSec: 900, // 15 minutes hard limit
            targetVideoBitrate: 2_000_000,
            targetAudioBitrate: 96_000,
            maxWidth: 1920,
            maxHeight: 1080,
            onProgress: (pct, label) => {
              setJob(j => j ? { ...j, progress: Math.round(2 + pct * 18), label } : j);
            },
          });
          videoFile = result.file;
          videoDuration = result.duration || payload.totalDuration;
        } catch (compressErr: any) {
          // Compression failed — fall back to raw file but warn
          console.warn('Compression skipped:', compressErr.message);
          videoFile = rawFile;
        }
      }

      if (signal.aborted) throw new Error('Upload cancelled');

      // ── STEP 3: Client-side Appwrite video upload ──────────────────────
      setJob(j => j ? { ...j, status: 'uploading', progress: 20, label: 'Uploading video…' } : j);

      if (signal.aborted) throw new Error('Upload cancelled');

      const videoFileId = ID.unique();
      await uploadLargeViaClient(videoFile, BUCKET.REEL_MEDIA, videoFileId, {
        signal,
        onProgress: (pct) => {
          const display = Math.round(20 + pct * 58);
          setJob(j => j ? { ...j, progress: display, label: `Uploading… ${display}%` } : j);
        },
      });

      if (signal.aborted) throw new Error('Upload cancelled');

      // ── STEP 4: Cover image (non-critical, tiny file) ─────────────────
      let coverFileId: string | null = null;
      if (payload.coverBlob) {
        try {
          const coverFile = new File([payload.coverBlob], `cover_${Date.now()}.jpg`, { type: 'image/jpeg' });
          const coverId = ID.unique();
          await uploadViaClient(coverFile, BUCKET.REEL_MEDIA, coverId);
          coverFileId = coverId;
        } catch { /* non-critical */ }
      }

      setJob(j => j ? { ...j, progress: 82, label: 'Saving post…' } : j);

      // ── STEP 5: Create the post through the authenticated client SDK ───
      const signedInUser = await account.get();
      if (signedInUser.$id !== payload.userId) throw new Error('The active account changed during reel upload.');
      const durationInt = Math.round(videoDuration || 0);
      let resolvedSoundId: string | undefined;
      let resolvedSoundTitle: string | undefined;
      let resolvedSoundArtist: string | undefined;
      let resolvedSoundStartTime = 0;
      if (payload.selectedSound?.id) {
        resolvedSoundId = payload.selectedSound.id;
        resolvedSoundTitle = payload.selectedSound.title || 'Sound';
        resolvedSoundArtist = payload.selectedSound.artist || payload.username || 'Creator';
        resolvedSoundStartTime = payload.selectedSound.startTime || 0;
        try {
          const sound = await databases.getDocument(DATABASE_ID, COL.SOUNDS, payload.selectedSound.id);
          await databases.updateDocument(DATABASE_ID, COL.SOUNDS, payload.selectedSound.id, {
            use_count: (Number(sound.use_count) || 0) + 1,
          });
        } catch (error) {
          console.warn('Could not update reel sound usage count:', error);
        }
      } else {
        const title = payload.caption.trim().split(' ').slice(0, 4).join(' ') || 'Original Sound';
        try {
          const sound = await databases.createDocument(DATABASE_ID, COL.SOUNDS, ID.unique(), {
            title: title.slice(0, 80),
            artist: payload.username || 'Creator',
            file_id: `reel_media:${videoFileId}`,
            duration: durationInt || 30,
            use_count: 1,
            is_active: true,
          });
          resolvedSoundId = sound.$id;
          resolvedSoundTitle = title;
          resolvedSoundArtist = payload.username || 'Creator';
        } catch (error) {
          console.warn('Could not create original reel sound:', error);
        }
      }

      const postData: Record<string, string | number | string[]> = {
        user_id: signedInUser.$id,
        content: payload.caption.trim(),
        type: 'reel',
        media_url: videoFileId,
        likes_count: 0,
        unlikes_count: 0,
        comments_count: 0,
        shares_count: 0,
        views_count: 0,
      };
      if (coverFileId) postData.reel_cover_file_id = coverFileId;
      if (durationInt > 0) postData.duration = durationInt;
      if (payload.effect && payload.effect !== 'none') postData.effects_applied = [payload.effect];
      if (resolvedSoundId) {
        postData.sound_id = resolvedSoundId;
        postData.sound_title = resolvedSoundTitle || '';
        postData.sound_artist = resolvedSoundArtist || '';
        postData.sound_start_time = resolvedSoundStartTime;
      }
      await databases.createDocument(DATABASE_ID, COL.POSTS, ID.unique(), postData);

      setJob(j => j ? { ...j, progress: 95, label: 'Publishing…' } : j);
      await new Promise(r => setTimeout(r, 400));
      setJob(j => j ? { ...j, progress: 100, label: 'Posted!', status: 'done' } : j);
      setTimeout(() => setJob(null), 4000);

    } catch (e: unknown) {
      if (e instanceof Error && e.message === 'Upload cancelled') {
        setJob(null);
        return;
      }
      const msg = e instanceof Error ? e.message : 'Upload failed.';
      setJob(j => j ? { ...j, status: 'error', error: msg, label: 'Upload failed', retryable: true } : j);
      throw e;
    }
  }, []);

  const startUpload = useCallback((payload: ReelUploadPayload) => {
    lastPayloadRef.current = payload;
    runUpload(payload);
  }, [runUpload]);

  const retryUpload = useCallback(() => {
    const payload = lastPayloadRef.current;
    if (!payload) return;
    runUpload(payload);
  }, [runUpload]);

  const dismissJob = useCallback(() => {
    abortRef.current?.abort();
    setJob(null);
  }, []);

  return (
    <Ctx.Provider value={{ job, startUpload, retryUpload, dismissJob }}>
      {children}
    </Ctx.Provider>
  );
}

export const useReelUpload = () => useContext(Ctx);
