import { useCallback, useEffect, useRef, useState } from 'react';

export interface WearableSyncSnapshot {
  status: 'syncing' | 'error';
  isRefreshingNow: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
  deviceName: string;
  connectionState: string;
  sampleCount: number;
}

export function formatRelativeSyncTime(isoTimestamp: string | null, nowMs = Date.now()): string {
  if (!isoTimestamp) return 'Waiting for first sync';
  const parsed = Date.parse(isoTimestamp);
  if (Number.isNaN(parsed)) return 'Recently';

  const diffSec = Math.max(0, Math.round((nowMs - parsed) / 1000));
  if (diffSec < 10) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;

  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;

  const diffDays = Math.round(diffHr / 24);
  return `${diffDays}d ago`;
}

export function deriveSyncStatusSummary(params: {
  isRefreshingNow: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
  nowMs?: number;
}): {
  badgeText: 'Syncing' | 'Sync paused';
  relativeTime: string;
  statusDetail: string;
} {
  if (params.lastError) {
    return {
      badgeText: 'Sync paused',
      relativeTime: formatRelativeSyncTime(params.lastSyncedAt, params.nowMs),
      statusDetail: params.lastError,
    };
  }

  const relativeTime = formatRelativeSyncTime(params.lastSyncedAt, params.nowMs);
  return {
    badgeText: 'Syncing',
    relativeTime,
    statusDetail: params.isRefreshingNow
      ? 'Receiving latest wearable readings now...'
      : `Real-time wearable stream active · ${relativeTime}`,
  };
}

interface UseWearableSyncServiceOptions {
  deviceName: string;
  initialLastSyncedAt: string | null;
  apiFetch: <T>(url: string, init?: RequestInit) => Promise<T>;
  onSyncComplete?: () => void;
  pollIntervalMs?: number;
}

interface LiveStatusApiResponse {
  restrictedByConsent: boolean;
  activeSession: {
    deviceName: string;
    connectionStatus: string;
    sampleCount: number;
  } | null;
  recentSamples: { timestamp: string }[];
}

export function useWearableSyncService({
  deviceName,
  initialLastSyncedAt,
  apiFetch,
  onSyncComplete,
  pollIntervalMs = 15000,
}: UseWearableSyncServiceOptions): WearableSyncSnapshot & {
  triggerManualSync: () => Promise<void>;
} {
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(initialLastSyncedAt);
  const [isRefreshingNow, setIsRefreshingNow] = useState<boolean>(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<string>('connected');
  const [sampleCount, setSampleCount] = useState<number>(0);
  const [resolvedDeviceName, setResolvedDeviceName] = useState<string>(deviceName);
  const mountedRef = useRef(true);

  useEffect(() => {
    setResolvedDeviceName(deviceName);
  }, [deviceName]);

  useEffect(() => {
    if (initialLastSyncedAt && !lastSyncedAt) {
      setLastSyncedAt(initialLastSyncedAt);
    }
  }, [initialLastSyncedAt, lastSyncedAt]);

  const performSync = useCallback(
    async (notifyWorkspace: boolean) => {
      if (!mountedRef.current) return;
      setIsRefreshingNow(true);
      setLastError(null);
      try {
        const live = await apiFetch<LiveStatusApiResponse>('/api/live/status');
        if (!mountedRef.current) return;
        const nowIso = new Date().toISOString();
        const latestSampleTs =
          live.recentSamples?.[live.recentSamples.length - 1]?.timestamp ?? null;
        // Record the synchronization completion time when live wearable status succeeds
        setLastSyncedAt(nowIso || latestSampleTs);
        if (live.activeSession) {
          setConnectionState(live.activeSession.connectionStatus || 'connected');
          setSampleCount(live.activeSession.sampleCount ?? live.recentSamples.length);
          if (live.activeSession.deviceName) {
            setResolvedDeviceName(live.activeSession.deviceName);
          }
        } else {
          setSampleCount(live.recentSamples?.length ?? 0);
        }
        if (notifyWorkspace && onSyncComplete) {
          onSyncComplete();
        }
      } catch (err) {
        if (!mountedRef.current) return;
        setLastError(
          err instanceof Error ? err.message : 'Unable to reach wearable sync service.'
        );
      } finally {
        if (mountedRef.current) {
          setIsRefreshingNow(false);
        }
      }
    },
    [apiFetch, onSyncComplete]
  );

  useEffect(() => {
    mountedRef.current = true;
    void performSync(false);

    const timer = window.setInterval(() => {
      void performSync(false);
    }, pollIntervalMs);

    return () => {
      mountedRef.current = false;
      window.clearInterval(timer);
    };
  }, [performSync, pollIntervalMs]);

  const triggerManualSync = useCallback(async () => {
    await performSync(true);
  }, [performSync]);

  return {
    status: lastError ? 'error' : 'syncing',
    isRefreshingNow,
    lastSyncedAt,
    lastError,
    deviceName: resolvedDeviceName,
    connectionState,
    sampleCount,
    triggerManualSync,
  };
}
