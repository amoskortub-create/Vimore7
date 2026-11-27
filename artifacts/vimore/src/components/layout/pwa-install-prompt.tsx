'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Download, ExternalLink, Share, X } from 'lucide-react';
import { getAndroidBrowserIntentUrl, getApkDownloadUrl } from '@/lib/apk';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

type InstallMode = 'pwa' | 'apk' | 'ios';

const DISMISS_KEY = 'vimore-install-dismissed-at';
const DISMISS_COOLDOWN_MS = 1000 * 60 * 60 * 24 * 7;

export function PwaInstallPrompt() {
  const pathname = usePathname();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [mode, setMode] = useState<InstallMode | null>(null);
  const [visible, setVisible] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [isInApp, setIsInApp] = useState(false);
  const [apkDownloading, setApkDownloading] = useState(false);
  const [intentUrl, setIntentUrl] = useState<string | null>(null);
  const downloadFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const apkUrl = getApkDownloadUrl();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (window.navigator as { standalone?: boolean }).standalone === true;
    const isNativeApp =
      Boolean(
        (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()
      ) || document.referrer.startsWith('android-app://cfd.mediatech.vimore');

    if (standalone || isNativeApp) {
      setInstalled(true);
      return;
    }

    try {
      const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0);
      if (dismissedAt && Date.now() - dismissedAt < DISMISS_COOLDOWN_MS) return;
    } catch {
      // Ignore storage access errors in restricted WebViews
    }

    const ua = window.navigator.userAgent || '';
    const facebookBrowser = /FBAN|FBAV|FB_IAB|FB4A|FBIOS|FBMD|FBDV|FBSV|FBSS/i.test(ua);
    const inAppBrowser =
      facebookBrowser ||
      /Instagram|Messenger|WhatsApp|Line\/|TikTok|BytedanceWebview|Twitter|LinkedInApp|Snapchat|MicroMessenger/i.test(
        ua
      );
    const iosDevice =
      /iPhone|iPad|iPod/i.test(ua) ||
      (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);
    const androidDevice = /Android/i.test(ua);

    setIsAndroid(androidDevice);
    setIsInApp(inAppBrowser);
    if (androidDevice && inAppBrowser) {
      setIntentUrl(getAndroidBrowserIntentUrl(apkUrl));
    }

    let promptReceived = false;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      promptReceived = true;
      if (fallbackTimer) {
        clearTimeout(fallbackTimer);
        fallbackTimer = null;
      }

      // Inside Facebook / in-app browsers, prefer direct APK download when not on iOS
      if (inAppBrowser && !iosDevice) {
        setMode('apk');
        setVisible(true);
        return;
      }

      setDeferred(e as BeforeInstallPromptEvent);
      setMode('pwa');
      setVisible(true);
    };

    const onInstalled = () => {
      setInstalled(true);
      setVisible(false);
      setDeferred(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);

    if (inAppBrowser && !iosDevice) {
      fallbackTimer = setTimeout(() => {
        if (!promptReceived) {
          setMode('apk');
          setVisible(true);
        }
      }, 450);
    } else if (iosDevice) {
      fallbackTimer = setTimeout(() => {
        if (!promptReceived) {
          setMode('ios');
          setVisible(true);
        }
      }, 1200);
    } else if (androidDevice) {
      fallbackTimer = setTimeout(() => {
        if (!promptReceived) {
          setMode('apk');
          setVisible(true);
        }
      }, 1500);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
      if (fallbackTimer) clearTimeout(fallbackTimer);
      if (downloadFeedbackTimer.current) clearTimeout(downloadFeedbackTimer.current);
    };
  }, [apkUrl]);

  const handlePwaInstall = async () => {
    if (!deferred) return;
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === 'dismissed') {
        try {
          localStorage.setItem(DISMISS_KEY, String(Date.now()));
        } catch {}
      }
    } finally {
      setDeferred(null);
      setVisible(false);
    }
  };

  const handleApkInstallClick = () => {
    if (downloadFeedbackTimer.current) {
      clearTimeout(downloadFeedbackTimer.current);
    }
    // Defer UI swap slightly so native <a download> click is never interrupted by unmounting
    downloadFeedbackTimer.current = setTimeout(() => {
      setApkDownloading(true);
    }, 150);
  };

  const handleDismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {}
    setVisible(false);
  };

  if (installed || !visible || !mode || pathname === '/downloads') return null;
  if (mode === 'pwa' && !deferred) return null;

  const browserFallbackHref = intentUrl || apkUrl;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Install ViMore"
      className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-[9999] -translate-x-1/2 w-[calc(100%-1.5rem)] max-w-sm rounded-2xl border border-white/15 bg-[#1a0b2e]/95 backdrop-blur-xl shadow-2xl px-4 py-3 flex items-center gap-3 animate-in slide-in-from-bottom-4 fade-in duration-300"
    >
      <div className="flex-shrink-0 h-10 w-10 rounded-xl bg-[#6200ea] flex items-center justify-center">
        {mode === 'ios' ? (
          <Share className="h-5 w-5 text-white" />
        ) : (
          <Download className="h-5 w-5 text-white" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-white font-semibold text-sm leading-tight">
          {apkDownloading ? 'Downloading ViMore APK...' : 'Install ViMore'}
        </p>
        {mode === 'apk' && !apkDownloading && (
          <p className="text-white/75 text-xs leading-tight mt-0.5">
            Get the official ViMore Android app for faster access.
          </p>
        )}
        {mode === 'apk' && apkDownloading && (
          <p className="text-white/75 text-xs leading-tight mt-0.5">
            Tap the downloaded file in your notifications to install.
          </p>
        )}
        {mode === 'pwa' && (
          <p className="text-white/75 text-xs leading-tight mt-0.5">
            Add to your home screen for the full app experience.
            {isAndroid && (
              <>
                {' '}
                <a
                  href={apkUrl}
                  download="vimore.apk"
                  onClick={() => {
                    setMode('apk');
                    handleApkInstallClick();
                  }}
                  className="underline text-purple-300 hover:text-white"
                >
                  Or get APK
                </a>
              </>
            )}
          </p>
        )}
        {mode === 'ios' && (
          <p className="text-white/75 text-xs leading-tight mt-0.5">
            {isInApp
              ? 'Open in Safari, then tap Share and Add to Home Screen.'
              : 'Tap Share in Safari, then choose Add to Home Screen.'}
          </p>
        )}
      </div>

      {mode === 'pwa' && (
        <button
          type="button"
          onClick={handlePwaInstall}
          className="flex-shrink-0 bg-[#9940E5] hover:bg-[#8233cc] text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
        >
          Install
        </button>
      )}

      {mode === 'apk' && !apkDownloading && (
        <a
          href={apkUrl}
          download="vimore.apk"
          onClick={handleApkInstallClick}
          className="flex-shrink-0 bg-[#9940E5] hover:bg-[#8233cc] text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
        >
          Install
        </a>
      )}

      {mode === 'apk' && apkDownloading && (
        <a
          href={browserFallbackHref}
          target={intentUrl ? undefined : '_blank'}
          rel={intentUrl ? undefined : 'noopener noreferrer'}
          className="flex-shrink-0 inline-flex items-center gap-1 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold px-2.5 py-2 rounded-lg transition-colors"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open
        </a>
      )}

      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss install prompt"
        className="flex-shrink-0 text-white/60 hover:text-white p-1 rounded-md transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
