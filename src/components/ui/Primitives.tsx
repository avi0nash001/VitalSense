import React, { useState } from 'react';
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  FlaskConical,
  Info,
  Minus,
  ShieldAlert,
} from 'lucide-react';
import type { DataSourceKind, LatestMetricSnapshot } from '../../lib/types';

export function SurfaceCard({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`vs-surface-card ${className}`}>
      {children}
    </section>
  );
}

export function PageHeader({
  kicker,
  title,
  description,
  actions,
}: {
  kicker?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-[var(--vs-border)] pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {kicker && (
          <p className="text-xs font-medium text-[var(--vs-accent)]">{kicker}</p>
        )}
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-[var(--vs-text)] sm:text-[26px] text-balance">
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-[var(--vs-text-secondary)]">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2.5">{actions}</div>
      )}
    </header>
  );
}

export function SourceAttribution({ source }: { source: DataSourceKind | null }) {
  if (!source) return null;
  if (source === 'synthetic') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--vs-warning)]">
        <FlaskConical className="h-3.5 w-3.5" />
        Synthetic simulation
      </span>
    );
  }
  if (source === 'real_csv') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--vs-accent-soft-text)]">
        <CheckCircle2 className="h-3.5 w-3.5 text-[var(--vs-accent)]" />
        Uploaded wearable CSV
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--vs-text-muted)]">
      Demo longitudinal log
    </span>
  );
}

export function TrendStatusLabel({
  status,
}: {
  status: LatestMetricSnapshot['trendStatus'];
}) {
  if (status === 'upward_shift') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--vs-warning)]">
        <ArrowUpRight className="h-3.5 w-3.5" />
        Upward shift
      </span>
    );
  }
  if (status === 'downward_shift') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--vs-warning)]">
        <ArrowDownRight className="h-3.5 w-3.5" />
        Downward shift
      </span>
    );
  }
  if (status === 'within_baseline') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--vs-success)]">
        <Minus className="h-3.5 w-3.5" />
        Within baseline
      </span>
    );
  }
  if (status === 'insufficient_baseline') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--vs-text-muted)]">
        <Info className="h-3.5 w-3.5" />
        Learning baseline
      </span>
    );
  }
  return (
    <span className="text-xs font-medium text-[var(--vs-text-muted)]">No readings</span>
  );
}

export function StateNotice({
  variant = 'info',
  title,
  message,
  action,
}: {
  variant?: 'info' | 'warning' | 'error' | 'empty';
  title: string;
  message: string;
  action?: React.ReactNode;
}) {
  const styles = {
    info: 'border-[var(--vs-border)] bg-[var(--vs-surface-muted)] text-[var(--vs-text)]',
    warning: 'border-[var(--vs-warning)]/35 bg-[var(--vs-warning-soft)] text-[var(--vs-text)]',
    error: 'border-[var(--vs-danger)]/35 bg-[var(--vs-danger-soft)] text-[var(--vs-text)]',
    empty: 'border-[var(--vs-border)] bg-[var(--vs-surface)] text-[var(--vs-text)]',
  }[variant];

  const Icon =
    variant === 'error'
      ? AlertCircle
      : variant === 'warning'
        ? ShieldAlert
        : Info;

  const iconColor =
    variant === 'error'
      ? 'text-[var(--vs-danger)]'
      : variant === 'warning'
        ? 'text-[var(--vs-warning)]'
        : 'text-[var(--vs-accent)]';

  return (
    <div className={`rounded-2xl border p-5 ${styles}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${iconColor}`} />
          <div>
            <h3 className="font-display text-sm font-semibold text-[var(--vs-text)]">
              {title}
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-[var(--vs-text-secondary)]">
              {message}
            </p>
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  );
}

export function SkeletonBlock({ className = 'h-4 w-full' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-[var(--vs-border)] ${className}`}
      aria-hidden="true"
    />
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-label="Loading workspace data">
      <div className="space-y-2 border-b border-[var(--vs-border)] pb-5">
        <SkeletonBlock className="h-3 w-32" />
        <SkeletonBlock className="h-7 w-72" />
        <SkeletonBlock className="h-4 w-96" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="vs-surface-card p-4 space-y-3">
            <SkeletonBlock className="h-3.5 w-24" />
            <SkeletonBlock className="h-8 w-20" />
            <SkeletonBlock className="h-3 w-32" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 vs-surface-card p-5 space-y-4">
          <SkeletonBlock className="h-5 w-48" />
          <SkeletonBlock className="h-64 w-full" />
        </div>
        <div className="vs-surface-card p-5 space-y-4">
          <SkeletonBlock className="h-5 w-40" />
          <SkeletonBlock className="h-16 w-full" />
          <SkeletonBlock className="h-16 w-full" />
          <SkeletonBlock className="h-16 w-full" />
        </div>
      </div>
    </div>
  );
}

export function AvatarImage({
  src,
  alt,
  name,
  sizeClass = 'h-9 w-9',
}: {
  src: string;
  alt: string;
  name: string;
  sizeClass?: string;
}) {
  const [failed, setFailed] = useState(false);
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  if (failed || !src) {
    return (
      <div
        className={`${sizeClass} flex shrink-0 items-center justify-center rounded-full bg-[var(--vs-accent)] text-xs font-semibold text-[var(--vs-accent-contrast)]`}
        aria-label={alt}
      >
        {initials}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${sizeClass} shrink-0 rounded-full object-cover border border-[var(--vs-border)]`}
    />
  );
}

export function formatShortDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
