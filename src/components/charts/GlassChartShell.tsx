import React from 'react';
import {
  CurvePointerOverlay,
  type ChartAnnotationHandlers,
  type ScrubberSeriesConfig,
} from './CurvePointerOverlay';

interface GlassRechartsFrameProps {
  children: React.ReactNode;
  accentColor?: string;
  secondaryColor?: string;
  height?: number;
  compact?: boolean;
  className?: string;
  headerLeft?: React.ReactNode;
  headerRight?: React.ReactNode;
  enableMovingPointer?: boolean;
  scrubberSeries?: ScrubberSeriesConfig;
  annotationHandlers?: ChartAnnotationHandlers;
}

export function StreamingWaveBackdrop(_props: {
  accentColor?: string;
  secondaryColor?: string;
  compact?: boolean;
}) {
  return null;
}

export function GlassRechartsFrame({
  children,
  accentColor,
  height,
  className = '',
  headerLeft,
  headerRight,
  enableMovingPointer = true,
  scrubberSeries,
  annotationHandlers,
}: GlassRechartsFrameProps) {
  return (
    <div
      data-testid="glass-recharts-frame"
      className={`vs-glass-chart-pane vs-recharts-glass relative overflow-visible rounded-xl p-3 sm:p-3.5 ${className}`}
    >
      {(headerLeft || headerRight) && (
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 px-1 text-xs">
          <div className="min-w-0 font-medium text-[var(--vs-text-secondary)]">
            {headerLeft}
          </div>
          {headerRight && (
            <div className="shrink-0 font-mono-num text-[11px] text-[var(--vs-text-muted)]">
              {headerRight}
            </div>
          )}
        </div>
      )}

      <div
        className="w-full select-none"
        style={height ? { height } : undefined}
      >
        <CurvePointerOverlay
          accentColor={accentColor}
          enabled={enableMovingPointer}
          scrubberSeries={scrubberSeries}
          annotationHandlers={annotationHandlers}
        >
          {children}
        </CurvePointerOverlay>
      </div>
    </div>
  );
}

export interface GlassTooltipItem {
  label: string;
  value: string | number;
  unit?: string;
  color?: string;
}

interface GlassChartTooltipProps {
  title: string;
  meta?: string;
  items: GlassTooltipItem[];
  footnote?: string | null;
}

export function GlassChartTooltip({
  title,
  meta,
  items,
  footnote,
}: GlassChartTooltipProps) {
  return (
    <div className="min-w-[168px] rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface)] px-3.5 py-2.5 shadow-sm">
      <p className="font-mono-num text-[11px] text-[var(--vs-text-muted)]">
        {title}
        {meta ? ` · ${meta}` : ''}
      </p>
      <div className="mt-1.5 space-y-1">
        {items.map((item) => (
          <div key={item.label} className="flex items-baseline justify-between gap-4">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--vs-text-secondary)]">
              {item.color && (
                <span
                  className="inline-block h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: item.color }}
                />
              )}
              {item.label}
            </span>
            <span className="vs-kpi-num text-sm font-bold text-[var(--vs-text)]">
              {item.value}
              {item.unit ? (
                <span className="ml-1 text-[11px] font-normal text-[var(--vs-text-muted)]">
                  {item.unit}
                </span>
              ) : null}
            </span>
          </div>
        ))}
      </div>
      {footnote && (
        <p className="mt-1.5 border-t border-[var(--vs-border)] pt-1 font-mono-num text-[11px] font-medium text-[var(--vs-text-secondary)]">
          {footnote}
        </p>
      )}
    </div>
  );
}
