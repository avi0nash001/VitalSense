import { Eye, EyeOff, SlidersHorizontal } from 'lucide-react';
import type { CalibrationBandMode, ThirtyDayCalibrationBand } from '../../lib/baselineCalibration';

interface BaselineCalibrationWidgetProps {
  band: ThirtyDayCalibrationBand;
  mode: CalibrationBandMode;
  onModeChange: (mode: CalibrationBandMode) => void;
  showBand: boolean;
  onToggleBand: () => void;
  compact?: boolean;
}

export function BaselineCalibrationWidget({
  band,
  mode,
  onModeChange,
  showBand,
  onToggleBand,
  compact = false,
}: BaselineCalibrationWidgetProps) {
  const statusTone =
    band.currentStatus === 'within_range'
      ? 'border-[var(--vs-success)]/30 bg-[var(--vs-success-soft)] text-[var(--vs-success)]'
      : band.currentStatus === 'above_range'
        ? 'border-[var(--vs-warning)]/35 bg-[var(--vs-warning-soft)] text-[var(--vs-warning)]'
        : band.currentStatus === 'below_range'
          ? 'border-[var(--vs-accent)]/35 bg-[var(--vs-accent-soft)] text-[var(--vs-accent-soft-text)]'
          : 'border-[var(--vs-border)] bg-[var(--vs-surface)] text-[var(--vs-text-muted)]';

  const markerTone =
    band.currentStatus === 'within_range'
      ? 'bg-[var(--vs-success)]'
      : band.currentStatus === 'above_range'
        ? 'bg-[var(--vs-warning)]'
        : band.currentStatus === 'below_range'
          ? 'bg-[var(--vs-accent)]'
          : 'bg-[var(--vs-text-muted)]';

  const hasRange = band.activeLow !== null && band.activeHigh !== null;
  const bandWidthPct = Math.max(6, band.bandEndPct - band.bandStartPct);

  return (
    <div
      data-testid="baseline-calibration-widget"
      className={`vs-glass-subcard rounded-xl ${compact ? 'p-3.5 space-y-2.5' : 'p-4 space-y-3'}`}
    >
      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[var(--vs-border)] bg-[var(--vs-surface)] text-[var(--vs-accent)]">
            <SlidersHorizontal className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display text-xs font-semibold text-[var(--vs-text)]">
                Baseline Calibration
              </h3>
              <span className="font-mono-num text-[11px] text-[var(--vs-text-muted)]">
                30-Day Historical Range · {band.shortLabel}
              </span>
            </div>
          </div>
          <span
            data-testid="calibration-status-badge"
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusTone}`}
          >
            {band.statusLabel}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <div
            className="inline-flex rounded-lg border border-[var(--vs-border)] bg-[var(--vs-surface)] p-0.5"
            role="group"
            aria-label="30-day calibration range mode"
          >
            <button
              type="button"
              data-testid="calibration-mode-typical"
              onClick={() => onModeChange('typical')}
              className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
                mode === 'typical'
                  ? 'bg-[var(--vs-accent-soft)] text-[var(--vs-accent-soft-text)]'
                  : 'text-[var(--vs-text-secondary)] hover:text-[var(--vs-text)]'
              }`}
            >
              Typical (±1 SD)
            </button>
            <button
              type="button"
              data-testid="calibration-mode-full"
              onClick={() => onModeChange('full_range')}
              className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
                mode === 'full_range'
                  ? 'bg-[var(--vs-accent-soft)] text-[var(--vs-accent-soft-text)]'
                  : 'text-[var(--vs-text-secondary)] hover:text-[var(--vs-text)]'
              }`}
            >
              30-Day Min–Max
            </button>
          </div>

          <button
            type="button"
            data-testid="calibration-toggle-band"
            aria-pressed={showBand}
            onClick={onToggleBand}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
              showBand
                ? 'border-[var(--vs-accent)] bg-[var(--vs-accent-soft)] text-[var(--vs-accent-soft-text)]'
                : 'border-[var(--vs-border)] bg-[var(--vs-surface)] text-[var(--vs-text-secondary)] hover:text-[var(--vs-text)]'
            }`}
          >
            {showBand ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            {showBand ? 'Shaded Band: On' : 'Shaded Band: Off'}
          </button>
        </div>
      </div>

      {/* Numeric Readouts */}
      <div
        className={`grid gap-2.5 ${
          compact ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-4'
        }`}
      >
        <div className="rounded-lg border border-[var(--vs-border)] bg-[var(--vs-surface)] px-3 py-2">
          <p className="text-[11px] text-[var(--vs-text-muted)]">30-Day Shaded Range</p>
          <p
            data-testid="calibration-range-value"
            className="mt-0.5 font-mono-num text-xs sm:text-sm font-semibold text-[var(--vs-text)]"
          >
            {hasRange ? `${band.activeLow} – ${band.activeHigh} ${band.unit}` : '—'}
          </p>
        </div>

        <div className="rounded-lg border border-[var(--vs-border)] bg-[var(--vs-surface)] px-3 py-2">
          <p className="text-[11px] text-[var(--vs-text-muted)]">30-Day Average</p>
          <p className="mt-0.5 font-mono-num text-xs sm:text-sm font-semibold text-[var(--vs-text)]">
            {band.mean !== null ? `${band.mean} ${band.unit}` : '—'}
          </p>
        </div>

        <div className="rounded-lg border border-[var(--vs-border)] bg-[var(--vs-surface)] px-3 py-2">
          <p className="text-[11px] text-[var(--vs-text-muted)]">Current Reading</p>
          <p className="mt-0.5 font-mono-num text-xs sm:text-sm font-semibold text-[var(--vs-text)]">
            {band.currentValue !== null ? `${band.currentValue} ${band.unit}` : '—'}
            {band.deltaFromMean !== null && (
              <span className="ml-1.5 text-[11px] font-medium text-[var(--vs-text-muted)]">
                ({band.deltaFromMean > 0 ? `+${band.deltaFromMean}` : band.deltaFromMean})
              </span>
            )}
          </p>
        </div>

        {!compact && (
          <div className="rounded-lg border border-[var(--vs-border)] bg-[var(--vs-surface)] px-3 py-2">
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="text-[var(--vs-text-muted)] truncate">History</span>
              <span className="font-mono-num font-semibold text-[var(--vs-accent)] whitespace-nowrap shrink-0">
                {band.dayCount} / 30d
              </span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--vs-surface-muted)]">
              <div
                className="h-full rounded-full bg-[var(--vs-accent)] transition-all duration-300"
                style={{ width: `${band.coveragePct}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Horizontal 30-Day Position Track */}
      <div className="space-y-1">
        <div
          data-testid="calibration-range-track"
          className="relative h-3 w-full rounded-full border border-[var(--vs-border)] bg-[var(--vs-surface)]"
          aria-label={`Current ${band.shortLabel} reading relative to 30-day shaded range`}
        >
          {hasRange && (
            <div
              className="absolute top-0 bottom-0 rounded-full transition-all duration-300"
              style={{
                left: `${band.bandStartPct}%`,
                width: `${bandWidthPct}%`,
                backgroundColor: showBand ? 'var(--vs-chart-band)' : 'transparent',
                opacity: showBand ? 0.24 : 0.6,
                border: showBand
                  ? '1px solid var(--vs-chart-band)'
                  : '1px dashed var(--vs-border-strong)',
              }}
            />
          )}
          {band.currentValue !== null && (
            <div
              className={`absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--vs-surface)] shadow-xs transition-all duration-300 ${markerTone}`}
              style={{ left: `${band.markerPositionPct}%` }}
              title={`Current: ${band.currentValue} ${band.unit}`}
            />
          )}
        </div>

        <div className="flex items-center justify-between font-mono-num text-[10.5px] text-[var(--vs-text-muted)]">
          <span>
            Low: {hasRange ? `${band.activeLow} ${band.unit}` : '—'}
          </span>
          <span>
            {compact ? `${band.dayCount}/30d window` : `30-day avg: ${band.mean ?? '—'} ${band.unit}`}
          </span>
          <span>
            High: {hasRange ? `${band.activeHigh} ${band.unit}` : '—'}
          </span>
        </div>
      </div>
    </div>
  );
}
