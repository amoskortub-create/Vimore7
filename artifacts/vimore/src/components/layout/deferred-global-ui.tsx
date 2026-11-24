"use client";

import dynamic from "next/dynamic";
import { usePosts } from "@/context/PostContext";

const CallExperience = dynamic(
  () => import("@/components/calls/CallExperience").then((m) => m.CallExperience),
  { ssr: false }
);
const MusicPlayer = dynamic(
  () => import("@/components/music/music-player").then((m) => m.MusicPlayer),
  { ssr: false }
);
const AlbumDetail = dynamic(
  () => import("@/components/music/album-detail").then((m) => m.AlbumDetail),
  { ssr: false }
);
const PlaylistDetail = dynamic(
  () => import("@/components/music/playlist-detail").then((m) => m.PlaylistDetail),
  { ssr: false }
);
const AdPortal = dynamic(
  () => import("@/components/ad/ad-portal").then((m) => m.AdPortal),
  { ssr: false }
);
const MusicAdPortal = dynamic(
  () => import("@/components/music/interstitial-portal").then((m) => m.MusicAdPortal),
  { ssr: false }
);
const PostPortal = dynamic(
  () => import("@/components/post/post-portal").then((m) => m.PostPortal),
  { ssr: false }
);
const ImageViewerPortal = dynamic(
  () => import("@/components/layout/image-viewer-portal").then((m) => m.ImageViewerPortal),
  { ssr: false }
);
const VideoViewerPortal = dynamic(
  () => import("@/components/layout/video-viewer-portal").then((m) => m.VideoViewerPortal),
  { ssr: false }
);
const SearchPortal = dynamic(
  () => import("@/components/layout/search-portal").then((m) => m.SearchPortal),
  { ssr: false }
);
const CommentHub = dynamic(
  () => import("@/components/post/comment-hub").then((m) => m.CommentHub),
  { ssr: false }
);
const GiftHub = dynamic(
  () => import("@/components/post/gift-hub").then((m) => m.GiftHub),
  { ssr: false }
);
const SwUpdateNotifier = dynamic(
  () => import("@/components/layout/sw-update-notifier").then((m) => m.SwUpdateNotifier),
  { ssr: false }
);
const ReelUploadBanner = dynamic(
  () => import("@/components/reels/reel-upload-banner").then((m) => m.ReelUploadBanner),
  { ssr: false }
);
const PwaInstallPrompt = dynamic(
  () => import("@/components/layout/pwa-install-prompt").then((m) => m.PwaInstallPrompt),
  { ssr: false }
);

const GlobalRealtimeListener = dynamic(
  () => import("@/components/layout/global-realtime").then((m) => m.GlobalRealtimeListener),
  { ssr: false }
);
const OutboxRetry = dynamic(
  () => import("@/components/layout/outbox-retry").then((m) => m.OutboxRetry),
  { ssr: false }
);
const NotificationScheduler = dynamic(
  () => import("@/components/layout/notification-scheduler").then((m) => m.NotificationScheduler),
  { ssr: false }
);
const AppBadgeSync = dynamic(
  () => import("@/components/layout/app-badge-sync").then((m) => m.AppBadgeSync),
  { ssr: false }
);
const PushAutoSubscribe = dynamic(
  () => import("@/components/layout/push-auto-subscribe").then((m) => m.PushAutoSubscribe),
  { ssr: false }
);
const NativePushAutoSubscribe = dynamic(
  () => import("@/components/layout/native-push-auto-subscribe").then((m) => m.NativePushAutoSubscribe),
  { ssr: false }
);
const ActivityTracker = dynamic(
  () => import("@/components/layout/ActivityTracker").then((m) => m.ActivityTracker),
  { ssr: false }
);
const ExpiryCleanup = dynamic(
  () => import("@/components/layout/expiry-cleanup").then((m) => m.ExpiryCleanup),
  { ssr: false }
);

export function DeferredAuthListeners() {
  const { currentUser } = usePosts();
  if (!currentUser) return null;

  return (
    <>
      <GlobalRealtimeListener />
      <CallExperience />
      <OutboxRetry />
      <NotificationScheduler />
      <AppBadgeSync />
      <PushAutoSubscribe />
      <NativePushAutoSubscribe />
      <ActivityTracker />
      <ExpiryCleanup />
    </>
  );
}

export function DeferredGlobalPortals() {
  const { currentUser } = usePosts();
  return (
    <>
      <PwaInstallPrompt />
      <SwUpdateNotifier />
      <MusicPlayer />
      <AlbumDetail />
      <PlaylistDetail />
      <AdPortal />
      <MusicAdPortal />
      <PostPortal />
      <ImageViewerPortal />
      <VideoViewerPortal />
      <SearchPortal />
      <CommentHub />
      <GiftHub />
      {currentUser && <ReelUploadBanner />}
    </>
  );
}
