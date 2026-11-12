'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';

export type NetworkTier = 'lite' | 'standard' | 'rich';
export type EffectiveType = 'slow-2g' | '2g' | '3g' | '4g' | 'unknown';
export type ConnectionStatus = 'checking' | 'online' | 'offline' | 'slow';

export interface NetworkInfo {
  tier: NetworkTier;
  effectiveType: EffectiveType;
  downlink: number;
  rtt: number;
  saveData: boolean;
  isOnline: boolean;
  connectionStatus: ConnectionStatus;
  networkWarning: 'offline' | 'weak' | null;
  forcedTier: NetworkTier | null;
  setForcedTier: (tier: NetworkTier | null) => void;
}

const DEFAULT_INFO: NetworkInfo = {
  tier: 'rich',
  effectiveType: 'unknown',
  downlink: 10,
  rtt: 50,
  saveData: false,
  isOnline: true,
  connectionStatus: 'checking',
  networkWarning: null,
  forcedTier: null,
  setForcedTier: () => {},
};

const NetworkContext = createContext<NetworkInfo>(DEFAULT_INFO);

function classify(effectiveType: string, saveData: boolean): NetworkTier {
  if (saveData) return 'lite';
  if (effectiveType === 'slow-2g' || effectiveType === '2g') return 'lite';
  if (effectiveType === '3g') return 'standard';
  return 'rich';
}

function readConnection(): { effectiveType: EffectiveType; downlink: number; rtt: number; saveData: boolean } {
  if (typeof navigator === 'undefined') {
    return { effectiveType: 'unknown', downlink: 10, rtt: 50, saveData: false };
  }
  const conn: any = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
  if (!conn) {
    return { effectiveType: 'unknown', downlink: 10, rtt: 50, saveData: false };
  }
  return {
    effectiveType: (conn.effectiveType || 'unknown') as EffectiveType,
    downlink: typeof conn.downlink === 'number' ? conn.downlink : 10,
    rtt: typeof conn.rtt === 'number' ? conn.rtt : 50,
    saveData: !!conn.saveData,
  };
}

function publishTierGlobal(tier: NetworkTier) {
  if (typeof window === 'undefined') return;
  (window as any).__vimoreNetTier = tier;
  try {
    document.documentElement.dataset.netTier = tier;
  } catch { /* ignore */ }
}

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [forcedTier, setForcedTierState] = useState<NetworkTier | null>(null);
  const [networkWarning, setNetworkWarning] = useState<'offline' | 'weak' | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(() =>
    typeof navigator === 'undefined' || navigator.onLine ? 'checking' : 'offline'
  );
  const [info, setInfo] = useState(() => {
    const c = readConnection();
    return {
      ...c,
      isOnline: typeof navigator === 'undefined' ? true : navigator.onLine,
    };
  });

  useEffect(() => {
    try {
      const stored = localStorage.getItem('vimore_forced_net_tier');
      if (stored === 'lite' || stored === 'standard' || stored === 'rich') {
        setForcedTierState(stored);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const conn: any = typeof navigator !== 'undefined'
      ? ((navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection)
      : null;

    const update = () => {
      const c = readConnection();
      setInfo(prev => ({
        ...prev,
        ...c,
        isOnline: typeof navigator === 'undefined' ? true : navigator.onLine,
      }));
    };

    if (conn && typeof conn.addEventListener === 'function') {
      conn.addEventListener('change', update);
    }
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      if (conn && typeof conn.removeEventListener === 'function') {
        conn.removeEventListener('change', update);
      }
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  useEffect(() => {
    let active = true;
    let consecutiveFailures = 0;
    let firstFailureAt = 0;
    let lastSuccessfulFetchAt = Date.now();
    let lastSuccessfulMediaAt = 0;
    let lastScrollAt = 0;
    const playingVideos = new Set<HTMLVideoElement>();

    const refreshWarning = () => {
      if (!active) return;
      const now = Date.now();
      const offline = !navigator.onLine;
      const thoroughlyBad = consecutiveFailures >= 3
        && now - firstFailureAt >= 10_000
        && now - lastSuccessfulFetchAt >= 15_000;
      const recentMedia = now - lastSuccessfulMediaAt < 10_000 || playingVideos.size > 0;
      const recentScroll = now - lastScrollAt < 10_000;
      const warning = recentMedia || (thoroughlyBad && recentScroll)
        ? null
        : offline ? 'offline' : thoroughlyBad ? 'weak' : null;
      setNetworkWarning(previous => previous === warning ? previous : warning);
    };

    const markSuccessfulFetch = () => {
      consecutiveFailures = 0;
      firstFailureAt = 0;
      lastSuccessfulFetchAt = Date.now();
      setConnectionStatus('online');
      refreshWarning();
    };

    const isAppwriteOrMediaRequest = (input: RequestInfo | URL): boolean => {
      const rawUrl = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
      try {
        const url = new URL(rawUrl, window.location.href);
        return url.pathname.includes('/v1/')
          || url.pathname.startsWith('/api/file/')
          || url.pathname.includes('/storage/buckets/');
      } catch {
        return false;
      }
    };

    const originalFetch = window.fetch;
    const wrappedFetch: typeof window.fetch = (...args) => originalFetch.apply(window, args).then(response => {
      if (response.ok && isAppwriteOrMediaRequest(args[0])) markSuccessfulFetch();
      return response;
    });
    window.fetch = wrappedFetch;

    const handleMediaSuccess = (event: Event) => {
      const target = event.target;
      if (
        (event.type === 'load' && target instanceof HTMLImageElement && target.naturalWidth > 0)
        || (event.type === 'canplay' && target instanceof HTMLVideoElement)
        || (event.type === 'playing' && target instanceof HTMLVideoElement)
      ) {
        lastSuccessfulMediaAt = Date.now();
        refreshWarning();
      }
      if (event.type === 'playing' && target instanceof HTMLVideoElement) playingVideos.add(target);
      if ((event.type === 'pause' || event.type === 'ended') && target instanceof HTMLVideoElement) playingVideos.delete(target);
    };
    document.addEventListener('load', handleMediaSuccess, true);
    document.addEventListener('canplay', handleMediaSuccess, true);
    document.addEventListener('playing', handleMediaSuccess, true);
    document.addEventListener('pause', handleMediaSuccess, true);
    document.addEventListener('ended', handleMediaSuccess, true);

    const heartbeat = async () => {
      if (!navigator.onLine) {
        setConnectionStatus('offline');
        refreshWarning();
        return;
      }

      try {
        const response = await fetch('https://appwrite.mediatechliberia.online/v1/health', {
          cache: 'no-store',
          signal: AbortSignal.timeout(3000),
        });
        if (!response.ok) throw new Error(`Health check returned ${response.status}`);
        if (active) markSuccessfulFetch();
      } catch {
        if (!active) return;
        consecutiveFailures += 1;
        if (firstFailureAt === 0) firstFailureAt = Date.now();
        setConnectionStatus(consecutiveFailures >= 3 ? 'slow' : 'checking');
        refreshWarning();
      }
    };

    const handleOnline = () => {
      setConnectionStatus('checking');
      void heartbeat();
    };
    const handleOffline = () => setConnectionStatus('offline');
    const handleScroll = () => { lastScrollAt = Date.now(); };

    void heartbeat();
    const timer = window.setInterval(heartbeat, 5_000);
    const warningTimer = window.setInterval(refreshWarning, 1_000);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      active = false;
      window.clearInterval(timer);
      window.clearInterval(warningTimer);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('scroll', handleScroll);
      document.removeEventListener('load', handleMediaSuccess, true);
      document.removeEventListener('canplay', handleMediaSuccess, true);
      document.removeEventListener('playing', handleMediaSuccess, true);
      document.removeEventListener('pause', handleMediaSuccess, true);
      document.removeEventListener('ended', handleMediaSuccess, true);
      if (window.fetch === wrappedFetch) window.fetch = originalFetch;
    };
  }, []);

  const detectedTier = classify(info.effectiveType, info.saveData);
  const tier = forcedTier ?? detectedTier;

  useEffect(() => {
    publishTierGlobal(tier);
  }, [tier]);

  const setForcedTier = useCallback((t: NetworkTier | null) => {
    setForcedTierState(t);
    try {
      if (t) localStorage.setItem('vimore_forced_net_tier', t);
      else localStorage.removeItem('vimore_forced_net_tier');
    } catch { /* ignore */ }
  }, []);

  const value: NetworkInfo = {
    tier,
    effectiveType: info.effectiveType,
    downlink: info.downlink,
    rtt: info.rtt,
    saveData: info.saveData,
    isOnline: info.isOnline,
    connectionStatus,
    networkWarning,
    forcedTier,
    setForcedTier,
  };

  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>;
}

export function useNetwork(): NetworkInfo {
  return useContext(NetworkContext);
}

export function getCurrentNetworkTier(): NetworkTier {
  if (typeof window === 'undefined') return 'rich';
  const t = (window as any).__vimoreNetTier as NetworkTier | undefined;
  return t || 'rich';
}
