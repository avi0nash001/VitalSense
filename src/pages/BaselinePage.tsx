import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Clock, Info } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type {
  MetricBaseline,
  MetricKey,
  MonitoringPreferences,
  VitalReading,
} from '../lib/types';
import { ALL_METRIC_KEYS, METRIC_DEFINITIONS } from '../lib/vitalsEngine';
import {
  buildThirtyDayCalibrationBand,
  type CalibrationBandMode,
} from '../lib/baselineCalibration';
import { DailyStepsBarChart, SleepPatternChart } from '../components/charts/HealthMetricsCharts';
import { VitalTrendChart } from '../components/charts/VitalTrendChart';
import { BaselineCalibrationWidget } from '../components/dashboard/BaselineCalibrationWidget';
import {
  DashboardSkeleton,
  formatDateTime,
  PageHeader,
  StateNotice,
  SurfaceCard,
} from '../components/ui/Primitives';

interface BaselineResponse {
  restrictedByConsent: boolean;
  baselines: Record<MetricKey, MetricBaseline> | null;
  summary: {
    overallPct: number;
    statusLabel: string;
    establishedCount: number;
    learningCount: number;
    totalMetrics: number;
    coverageDaysMax: number;
    totalReadings: number;
  } | null;
  readings: VitalReading[];
  preferences?: MonitoringPreferences;
}

export function BaselinePage() {
  const { apiFetch } = useAuth();
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>('heartRate');
  const [bandMode, setBandMode] = useState<CalibrationBandMode>('typical');
  const [showCalibrationBand, setShowCalibrationBand] = useState<boolean>(true);

  const { data, isLoading, error, refetch } = useQuery<BaselineResponse>({
    queryKey: ['baseline'],
    queryFn: () => apiFetch<BaselineResponse>('/api/baseline'),
  });

  if (isLoading) return <DashboardSkeleton />;

  if (error || !data) {
    return (
      <StateNotice
        variant="error"
        title="Unable to load personal baseline"
        message={error instanceof Error ? error.message : 'Please try again.'}
        action={
          <button
            type="button"
            onClick={() => refetch()}
            className="vs-btn-primary rounded-lg px-3.5 py-2 text-xs font-medium"
          >
            Retry
          </button>
        }
      />
    );
  }

  if (data.restrictedByConsent || !data.baselines || !data.summary) {
    return (
      <div className="space-y-6">
        <PageHeader
          kicker="Personal Calibration"
          title="Personalized Baseline Learning"
        />
        <StateNotice
          variant="warning"
          title="Baseline progress restricted by member consent"
          message="The monitored member has chosen to keep personal baseline calibration private."
        />
      </div>
    );
  }

  const insufficientMetrics = ALL_METRIC_KEYS.filter(
    (k) => data.baselines![k].confidenceStatus === 'insufficient'
  );
  const selectedBaseline = data.baselines[selectedMetric];
  const calibrationBand = buildThirtyDayCalibrationBand({
    readings: data.readings,
    metric: selectedMetric,
    mode: bandMode,
    fallbackBaseline:
      selectedBaseline.confidenceStatus === 'insufficient' ? null : selectedBaseline,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Personal Reference Range"
        title="Personal Baseline"
        description="VITALSENSE learns what is normal for you over multiple days instead of using generic limits, and lets you know clearly when more days are needed."
        actions={
          <Link
            to="/app/data-lab"
            className="vs-btn-primary rounded-xl px-4 py-2 text-xs font-medium whitespace-nowrap"
          >
            Upload or Manage Data
          </Link>
        }
      />

      {insufficientMetrics.length > 0 && (
        <StateNotice
          variant="info"
          title="More days needed to learn your full baseline"
          message={`${insufficientMetrics.map((m) => METRIC_DEFINITIONS[m].shortLabel).join(', ')} currently have fewer than 5 days of readings. VITALSENSE waits until enough history is collected before locking your usual range.`}
        />
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SurfaceCard className="p-5">
          <p className="text-xs font-medium text-[var(--vs-text-muted)]">Baseline Readiness</p>
          <p className="mt-2 font-mono-num text-2xl font-semibold text-[var(--vs-text)]">
            {data.summary.overallPct}%
          </p>
          <p className="mt-1 text-xs text-[var(--vs-text-secondary)]">
            {data.summary.statusLabel}
          </p>
        </SurfaceCard>

        <SurfaceCard className="p-5">
          <p className="text-xs font-medium text-[var(--vs-text-muted)]">Days Recorded</p>
          <p className="mt-2 font-mono-num text-2xl font-semibold text-[var(--vs-text)]">
            {data.summary.coverageDaysMax} / {data.preferences?.baselineWindowDays ?? 14} days
          </p>
          <p className="mt-1 text-xs text-[var(--vs-text-secondary)]">Personal learning window</p>
        </SurfaceCard>

        <SurfaceCard className="p-5">
          <p className="text-xs font-medium text-[var(--vs-text-muted)]">Readings Checked</p>
          <p className="mt-2 font-mono-num text-2xl font-semibold text-[var(--vs-text)]">
            {data.summary.totalReadings}
          </p>
          <p className="mt-1 text-xs text-[var(--vs-text-secondary)]">Quality-checked samples</p>
        </SurfaceCard>

        <SurfaceCard className="p-5">
          <p className="text-xs font-medium text-[var(--vs-text-muted)]">Signals Ready</p>
          <p className="mt-2 font-mono-num text-2xl font-semibold text-[var(--vs-text)]">
            {data.summary.establishedCount} / {data.summary.totalMetrics}
          </p>
          <p className="mt-1 text-xs text-[var(--vs-text-secondary)]">
            {data.summary.learningCount} still learning
          </p>
        </SurfaceCard>
      </div>

      <SurfaceCard className="overflow-hidden">
        <div className="border-b border-[var(--vs-border)] px-5 py-4">
          <h2 className="font-display text-base font-semibold text-[var(--vs-text)]">
            Your Usual Range by Health Signal
          </h2>
          <p className="mt-0.5 text-xs text-[var(--vs-text-muted)]">
            Click any row to compare your recent readings against your personal usual range.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--vs-border)] bg-[var(--vs-table-head)] text-xs font-medium text-[var(--vs-text-muted)]">
              <tr>
                <th className="px-5 py-3">Signal</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Usual Average</th>
                <th className="px-4 py-3 text-right">Observed Range</th>
                <th className="px-4 py-3 text-right">Days Covered</th>
                <th className="px-5 py-3 text-right">Last Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--vs-border)]">
              {ALL_METRIC_KEYS.map((key) => {
                const b = data.baselines![key];
                const isSelected = key === selectedMetric;
                return (
                  <tr
                    key={key}
                    onClick={() => setSelectedMetric(key)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-[var(--vs-accent-soft)]/50'
                        : 'hover:bg-[var(--vs-hover)]'
                    }`}
                  >
                    <td className="px-5 py-3.5 font-medium text-[var(--vs-text)]">
                      {b.label}
                    </td>
                    <td className="px-4 py-3.5">
                      {b.confidenceStatus === 'established' && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--vs-success)]">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Established
                        </span>
                      )}
                      {b.confidenceStatus === 'learning' && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--vs-accent)]">
                          <Clock className="h-3.5 w-3.5" />
                          Learning ({b.progressPct}%)
                        </span>
                      )}
                      {b.confidenceStatus === 'insufficient' && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--vs-warning)]">
                          <Info className="h-3.5 w-3.5" />
                          Insufficient data ({b.coverageDays}/{b.targetDays}d)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono-num text-[var(--vs-text)]">
                      {b.mean !== null
                        ? `${b.mean} ± ${b.stdDev ?? 0} ${b.unit}`
                        : '—'}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono-num text-[var(--vs-text-secondary)]">
                      {b.min !== null && b.max !== null
                        ? `${b.min} – ${b.max} ${b.unit}`
                        : '—'}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono-num text-[var(--vs-text-secondary)]">
                      {b.coverageDays}d · {b.readingCount} readings
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono-num text-xs text-[var(--vs-text-muted)]">
                      {formatDateTime(b.lastUpdated)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SurfaceCard>

      <SurfaceCard className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--vs-border)] pb-4">
          <div>
            <h2 className="font-display text-base font-semibold text-[var(--vs-text)]">
              Readings Over Time: {selectedBaseline.label}
            </h2>
            <p className="mt-0.5 text-xs text-[var(--vs-text-muted)]">
              {selectedBaseline.confidenceStatus === 'insufficient'
                ? 'Not enough days yet to lock a personal range; showing recorded readings.'
                : `Shaded band shows your typical variation around ${selectedBaseline.mean} ${selectedBaseline.unit}.`}
            </p>
          </div>
          <div className="flex flex-wrap gap-1 rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface-muted)] p-1">
            {ALL_METRIC_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedMetric(key)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                  selectedMetric === key
                    ? 'bg-[var(--vs-surface)] text-[var(--vs-text)] shadow-xs'
                    : 'text-[var(--vs-text-secondary)] hover:text-[var(--vs-text)]'
                }`}
              >
                {METRIC_DEFINITIONS[key].shortLabel}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 space-y-4">
          <BaselineCalibrationWidget
            band={calibrationBand}
            mode={bandMode}
            onModeChange={setBandMode}
            showBand={showCalibrationBand}
            onToggleBand={() => setShowCalibrationBand((prev) => !prev)}
          />

          <VitalTrendChart
            readings={data.readings}
            metric={selectedMetric}
            baselineMean={
              selectedBaseline.confidenceStatus === 'insufficient'
                ? null
                : selectedBaseline.mean
            }
            baselineStdDev={
              selectedBaseline.confidenceStatus === 'insufficient'
                ? null
                : selectedBaseline.stdDev
            }
            calibrationBand={{
              low: calibrationBand.activeLow,
              high: calibrationBand.activeHigh,
              mean: calibrationBand.mean,
              modeLabel: bandMode === 'full_range' ? '30-Day Min–Max' : '30-Day Typical Range',
            }}
            showCalibrationBand={showCalibrationBand}
            height={280}
          />
        </div>
      </SurfaceCard>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SurfaceCard className="p-5 sm:p-6 space-y-3">
          <h2 className="font-display text-base font-semibold text-[var(--vs-text)]">
            Sleep Duration Pattern
          </h2>
          <SleepPatternChart readings={data.readings} height={220} />
        </SurfaceCard>
        <SurfaceCard className="p-5 sm:p-6 space-y-3">
          <h2 className="font-display text-base font-semibold text-[var(--vs-text)]">
            Daily Steps Pattern
          </h2>
          <DailyStepsBarChart readings={data.readings} height={220} />
        </SurfaceCard>
      </div>
    </div>
  );
}
