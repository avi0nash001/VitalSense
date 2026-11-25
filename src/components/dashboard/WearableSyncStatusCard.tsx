import { useEffect, useState } from 'react';
import { RefreshCw, Watch } from 'lucide-react';
import {
  deriveSyncStatusSummary,
  useWearableSyncService,
} from '../../services/wearableSyncService';
import { formatDateTime, SurfaceCard } from '../ui/Primitives';

interface WearableSyncStatusCardProps {
  deviceName: string;
  initialLastSyncedAt: string | null;
  apiFetch: <T>(url: string, init?: RequestInit) => Promise<T>;
  onSyncComplete: () => void;
}

export function WearableSyncStatusCard({
  deviceName,
  initialLastSyncedAt,
  apiFetch,
  onSyncComplete,
}: WearableSyncStatusCardProps) {
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const sync = useWearableSyncService({
    deviceName,
    initialLastSyncedAt,
    apiFetch,
    onSyncComplete,
    pollIntervalMs: 15000,
  });

  useEffect(() => {
    const ticker = window.setInterval(() => {
      setNowMs(Date.now());
    }, 5000);
    return () => window.clearInterval(ticker);
  }, []);

  const summary = deriveSyncStatusSummary({
    isRefreshingNow: sync.isRefreshingNow,
    lastSyncedAt: sync.lastSyncedAt,
    lastError: sync.lastError,
    nowMs,
  });

  const isHealthy = sync.status === 'syncing';

  return (
    <SurfaceCard className="p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start sm:items-center gap-3.5 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--vs-border)] bg-[var(--vs-accent-soft)]/70 text-[var(--vs-accent)]">
            <Watch className="h-4.5 w-4.5" />
          </div>

          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <span
                className="inline-flex items-center gap-2 rounded-full border border-[var(--vs-border)] bg-[var(--vs-surface-muted)] px-2.5 py-0.5 text-xs font-semibold text-[var(--vs-text)]"
                data-testid="wearable-sync-status"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-3.5 w-3.5 shrink-0 overflow-visible"
                  aria-hidden="true"
                  data-testid="wearable-sync-svg"
                >
                  {isHealthy && (
                    <circle
                      cx="12"
                      cy="12"
                      r="5.5"
                      fill="none"
                      stroke="var(--vs-accent)"
                      strokeWidth="2"
                      className="animate-ping opacity-75"
                      style={{ transformOrigin: '12px 12px' }}
                    />
                  )}
                  <circle
                    cx="12"
                    cy="12"
                    r="4.2"
                    fill={isHealthy ? 'var(--vs-accent)' : 'var(--vs-warning)'}
                  />
                </svg>
                <span>{summary.badgeText}</span>
              </span>

              <span className="text-xs font-semibold text-[var(--vs-text)] truncate">
                {sync.deviceName}
              </span>
            </div>

            <p className="text-xs text-[var(--vs-text-secondary)]">
              <span className="font-medium text-[var(--vs-text)]">Last successful sync:</span>{' '}
              <span className="font-mono-num" data-testid="wearable-last-sync-time">
                {sync.lastSyncedAt ? formatDateTime(sync.lastSyncedAt) : 'Syncing initial log...'}
              </span>{' '}
              <span className="text-[var(--vs-text-muted)]">({summary.relativeTime})</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
          <span className="hidden md:inline text-xs text-[var(--vs-text-muted)]">
            {summary.statusDetail}
          </span>
          <button
            type="button"
            onClick={() => {
              void sync.triggerManualSync();
            }}
            disabled={sync.isRefreshingNow}
            className="vs-btn-secondary inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium whitespace-nowrap disabled:opacity-60"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${sync.isRefreshingNow ? 'animate-spin text-[var(--vs-accent)]' : ''}`}
            />
            {sync.isRefreshingNow ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>
      </div>
    </SurfaceCard>
  );
}
