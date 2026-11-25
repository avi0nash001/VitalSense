import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  ArrowRight,
  Bell,
  Clock,
  FlaskConical,
  Footprints,
  HeartPulse,
  Moon,
  ShieldCheck,
  Smile,
  Sparkles,
  TrendingUp,
  UserCheck,
  Users,
  Wind,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  DEMO_PERSONA_LIST,
  getDemoPersona,
  type DemoPersonaId,
} from '../lib/demoPersonas';
import type {
  AIInsight,
  AlertRecord,
  LatestMetricSnapshot,
  MetricBaseline,
  MetricKey,
  TimelineEvent,
  VitalReading,
} from '../lib/types';
import { METRIC_DEFINITIONS } from '../lib/vitalsEngine';
import {
  buildThirtyDayCalibrationBand,
  type CalibrationBandMode,
} from '../lib/baselineCalibration';
import { DailyStepsBarChart, SleepPatternChart } from '../components/charts/HealthMetricsCharts';
import { VitalTrendChart } from '../components/charts/VitalTrendChart';
import { LiveWaveformCanvas } from '../components/landing/LiveWaveformCanvas';
import { BaselineCalibrationWidget } from '../components/dashboard/BaselineCalibrationWidget';
import { WearableSyncStatusCard } from '../components/dashboard/WearableSyncStatusCard';
import { WeeklySummaryCard } from '../components/dashboard/WeeklySummaryCard';
import {
  AvatarImage,
  DashboardSkeleton,
  formatDateTime,
  PageHeader,
  SourceAttribution,
  StateNotice,
  SurfaceCard,
  TrendStatusLabel,
} from '../components/ui/Primitives';

interface WorkspaceOverviewResponse {
  memberProfile: {
    name: string;
    avatarUrl: string;
    wearableDeviceName: string;
  };
  activeScenario: string;
  lastUpdated: string;
  baselineSummary: {
    overallPct: number;
    statusLabel: string;
    establishedCount: number;
    learningCount: number;
    totalMetrics: number;
    coverageDaysMax: number;
    totalReadings: number;
  } | null;
  baselines: Record<MetricKey, MetricBaseline> | null;
  latestSnapshots: LatestMetricSnapshot[];
  readings: VitalReading[];
  recentChanges: TimelineEvent[];
  recentInsights: AIInsight[];
  recentAlerts: AlertRecord[];
}

export function DashboardPage() {
  const { user, apiFetch } = useAuth();
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>('heartRate');
  const [selectedPersonaMode, setSelectedPersonaMode] = useState<'auto' | DemoPersonaId | 'live'>('auto');
  const [bandMode, setBandMode] = useState<CalibrationBandMode>('typical');
  const [showCalibrationBand, setShowCalibrationBand] = useState<boolean>(true);

  const { data, isLoading, error, refetch } = useQuery<WorkspaceOverviewResponse>({
    queryKey: ['workspace-overview'],
    queryFn: () => apiFetch<WorkspaceOverviewResponse>('/api/workspace/overview'),
  });

  if (isLoading) return <DashboardSkeleton />;

  if (error || !data) {
    return (
      <StateNotice
        variant="error"
        title="Unable to load your health overview"
        message={error instanceof Error ? error.message : 'Please try again.'}
        action={
          <button
            type="button"
            onClick={() => refetch()}
            className="vs-btn-primary rounded-lg px-3.5 py-2 text-xs font-medium"
          >
            Try Again
          </button>
        }
      />
    );
  }

  const dominantLiveSource = data.readings[data.readings.length - 1]?.source ?? null;
  const hasCustomLiveData =
    dominantLiveSource === 'real_csv' || dominantLiveSource === 'synthetic';

  const resolvedMode: DemoPersonaId | 'live' =
    selectedPersonaMode === 'auto'
      ? hasCustomLiveData
        ? 'live'
        : 'elena'
      : selectedPersonaMode;

  const activeDemo = resolvedMode === 'live' ? null : getDemoPersona(resolvedMode);

  // Resolve unified view values cleanly between demonstration personas and custom live workspace data
  const displayName = activeDemo
    ? activeDemo.name
    : user?.name ?? data.memberProfile.name;
  const firstName = displayName.split(' ')[0];
  const deviceLabel = activeDemo ? activeDemo.deviceName : data.memberProfile.wearableDeviceName;
  const displayReadings = activeDemo ? activeDemo.readings : data.readings;
  const displayBaselines = activeDemo ? activeDemo.baselines : data.baselines;
  const displaySnapshots = activeDemo ? activeDemo.latestSnapshots : data.latestSnapshots;
  const displayChanges = activeDemo ? activeDemo.recentChanges : data.recentChanges;
  const displayAlerts = activeDemo ? activeDemo.recentAlerts : data.recentAlerts;
  const displayInsights = activeDemo ? activeDemo.recentInsights : data.recentInsights;
  const displayBaselineSummary = activeDemo ? activeDemo.baselineSummary : data.baselineSummary;
  const displayDominantSource = activeDemo ? 'baseline_demo' : dominantLiveSource;

  const activeMetricBaseline = displayBaselines?.[selectedMetric] ?? null;
  const activeSnapshot = displaySnapshots.find((s) => s.metric === selectedMetric);
  const calibrationBand = buildThirtyDayCalibrationBand({
    readings: displayReadings,
    metric: selectedMetric,
    mode: bandMode,
    fallbackBaseline: activeMetricBaseline,
    liveCurrentValue: activeSnapshot?.latestValue ?? null,
  });
  const hrSnapshot = displaySnapshots.find((s) => s.metric === 'heartRate');
  const spo2Snapshot = displaySnapshots.find((s) => s.metric === 'spo2');
  const latestReading = displayReadings[displayReadings.length - 1];
  const latestSleep =
    typeof latestReading?.sleepHours === 'number'
      ? Number(latestReading.sleepHours.toFixed(1))
      : activeDemo?.sleepHours ?? 6.8;
  const latestSteps =
    typeof latestReading?.steps === 'number'
      ? Math.round(latestReading.steps)
      : activeDemo?.dailyActivitySteps ?? 6420;

  const openAlertsCount = displayAlerts.filter((a) => a.status === 'open').length;
  const avgQuality =
    activeDemo?.dataQualityPct ??
    (displayReadings.length > 0
      ? Math.round(
          displayReadings.reduce((sum, r) => sum + (r.qualityScore ?? 92), 0) /
            displayReadings.length
        )
      : 94);
  const reliabilityLabel =
    avgQuality >= 85
      ? 'Good coverage'
      : avgQuality >= 65
        ? 'Moderate coverage'
        : 'Limited coverage';

  const headerSummary = activeDemo
    ? activeDemo.summaryHeadline
    : displayChanges.some((c) => c.status !== 'resolved')
      ? 'A gradual pattern change is highlighted against your personal normal range.'
      : 'All your tracked health readings remain calm and inside your usual range.';

  const firstDetectedSteps = activeDemo
    ? activeDemo.firstDetectedSteps
    : displayChanges.length > 0
      ? [
          {
            day: 'Baseline',
            title: 'Normal pattern.',
            readingText: `${displayChanges[0].previousBaseline} ${displayChanges[0].unit}`,
            detail: 'Built from your earlier resting readings.',
            state: 'normal' as const,
          },
          {
            day: formatDateTime(displayChanges[0].firstDetectedAt),
            title: 'First unusual reading.',
            readingText: `${displayChanges[0].currentObserved} ${displayChanges[0].unit}`,
            detail: 'First stepped outside your normal range.',
            state: 'first_shift' as const,
          },
          {
            day: `${displayChanges[0].durationDays} days`,
            title: 'Sustained change detected.',
            readingText: displayChanges[0].deltaText,
            detail: displayChanges[0].supportingEvidence.summary,
            state: 'detected' as const,
          },
        ]
      : [
          {
            day: 'Recent week',
            title: 'Steady personal pattern.',
            readingText: hrSnapshot?.latestValue ? `${hrSnapshot.latestValue} bpm` : 'Steady',
            detail: 'All recent readings remained close to your personal baseline.',
            state: 'normal' as const,
          },
        ];

  return (
    <div className="space-y-6">
      <PageHeader
        kicker={`${deviceLabel} · Updated ${formatDateTime(data.lastUpdated)}`}
        title={`Good morning, ${firstName}`}
        description={headerSummary}
        actions={
          <>
            <Link
              to="/app/timeline"
              className="vs-btn-secondary inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-medium whitespace-nowrap"
            >
              <Clock className="h-3.5 w-3.5 text-[var(--vs-text-muted)]" />
              Health Timeline
            </Link>
            <Link
              to="/app/data-lab"
              className="vs-btn-primary inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-medium whitespace-nowrap"
            >
              <FlaskConical className="h-3.5 w-3.5" />
              Devices &amp; Data
            </Link>
          </>
        }
      />

      {/* Real-Time Wearable Sync Service Status */}
      <WearableSyncStatusCard
        deviceName={deviceLabel}
        initialLastSyncedAt={data.lastUpdated}
        apiFetch={apiFetch}
        onSyncComplete={() => {
          void refetch();
        }}
      />

      {/* Multi-Patient Demonstration Switcher */}
      <SurfaceCard className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <UserCheck className="h-4 w-4 text-[var(--vs-accent)] shrink-0" />
            <div>
              <p className="text-xs font-semibold text-[var(--vs-text)]">
                Demonstration Profiles · Sample Wearable Data
              </p>
              <p className="text-xs text-[var(--vs-text-muted)]">
                Switch between independent sample profiles to see how personal baselines adapt to each person.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Demonstration profile switcher">
            {DEMO_PERSONA_LIST.map((persona) => {
              const selected = resolvedMode === persona.id;
              return (
                <button
                  key={persona.id}
                  type="button"
                  data-testid={`persona-switch-${persona.id}`}
                  onClick={() => setSelectedPersonaMode(persona.id)}
                  className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                    selected
                      ? 'border-[var(--vs-accent)] bg-[var(--vs-accent-soft)] text-[var(--vs-accent-soft-text)]'
                      : 'border-[var(--vs-border)] bg-[var(--vs-bg)] text-[var(--vs-text-secondary)] hover:text-[var(--vs-text)]'
                  }`}
                >
                  <AvatarImage
                    src={persona.avatarUrl}
                    alt={persona.name}
                    name={persona.name}
                    sizeClass="h-5 w-5"
                  />
                  <span>{persona.name}</span>
                </button>
              );
            })}

            <button
              type="button"
              data-testid="persona-switch-live"
              onClick={() => setSelectedPersonaMode('live')}
              className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                resolvedMode === 'live'
                  ? 'border-[var(--vs-accent)] bg-[var(--vs-accent-soft)] text-[var(--vs-accent-soft-text)]'
                  : 'border-[var(--vs-border)] bg-[var(--vs-bg)] text-[var(--vs-text-secondary)] hover:text-[var(--vs-text)]'
              }`}
            >
              My Account Data
            </button>
          </div>
        </div>
      </SurfaceCard>

      {displayDominantSource === 'synthetic' && (
        <StateNotice
          variant="warning"
          title="Viewing synthetic test data"
          message="These readings were generated in Devices & Data for testing and do not represent real wearable measurements."
          action={
            <Link
              to="/app/data-lab"
              className="vs-btn-secondary inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap"
            >
              Manage in Devices &amp; Data
            </Link>
          }
        />
      )}

      {/* Top Plain-English Status + Baseline + Data Reliability Strip */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SurfaceCard className="p-5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-[var(--vs-text-muted)]">Today&apos;s Status</p>
            <SourceAttribution source={displayDominantSource} />
          </div>
          <p className="mt-2 font-display text-lg font-semibold text-[var(--vs-text)]">
            {displayChanges.some((c) => c.status !== 'resolved')
              ? 'Change worth noticing'
              : 'Everything looks steady'}
          </p>
          <p className="mt-1 text-xs text-[var(--vs-text-secondary)]">
            {openAlertsCount > 0
              ? `${openAlertsCount} alert awaiting caregiver check-in`
              : displayAlerts.length > 0
                ? 'Caregiver already checked in on latest notice'
                : 'No unusual multi-day changes right now'}
          </p>
        </SurfaceCard>

        <SurfaceCard className="p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-[var(--vs-text-muted)]">Personal Baseline</p>
            <Link
              to="/app/baseline"
              className="text-xs font-medium text-[var(--vs-accent)] hover:underline"
            >
              View Baseline →
            </Link>
          </div>
          {displayBaselineSummary ? (
            <>
              <div className="mt-2 flex items-baseline justify-between">
                <p className="font-display text-lg font-semibold text-[var(--vs-text)]">
                  {displayBaselineSummary.overallPct >= 100
                    ? 'Personal baseline ready'
                    : displayBaselineSummary.statusLabel}
                </p>
                <span className="font-mono-num text-sm font-semibold text-[var(--vs-accent)]">
                  {displayBaselineSummary.overallPct}%
                </span>
              </div>
              <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-[var(--vs-surface-muted)]">
                <div
                  className="h-full rounded-full bg-[var(--vs-accent)] transition-all duration-300"
                  style={{ width: `${displayBaselineSummary.overallPct}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-[var(--vs-text-muted)]">
                Built from {displayBaselineSummary.totalReadings} of {firstName}&apos;s historical readings
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-[var(--vs-text-muted)]">
              Baseline summary hidden by your privacy settings.
            </p>
          )}
        </SurfaceCard>

        <SurfaceCard className="p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-[var(--vs-text-muted)]">
              How reliable is this data?
            </p>
            <ShieldCheck className="h-4 w-4 text-[var(--vs-success)]" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <p className="font-display text-lg font-semibold text-[var(--vs-text)]">
              {reliabilityLabel}
            </p>
            <span className="font-mono-num text-sm font-semibold text-[var(--vs-success)]">
              {avgQuality}%
            </span>
          </div>
          <p className="mt-2 text-xs text-[var(--vs-text-secondary)]">
            Consistent wearable readings across recent nights so trends stay dependable.
          </p>
        </SurfaceCard>
      </div>

      {/* Primary Everyday Health Metrics: Heart rate, Daily activity, Sleep, SpO2 */}
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-sm font-semibold text-[var(--vs-text)]">
            Health Overview
          </h2>
          <p className="text-xs text-[var(--vs-text-muted)]">
            Heart rate, activity, sleep, and SpO₂ where supported
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="vs-glass-card p-5">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-[var(--vs-text-secondary)]">Heart rate</span>
              <HeartPulse className="h-4 w-4 text-[var(--vs-accent)]" />
            </div>
            <p className="mt-2 vs-kpi-num text-[28px] leading-tight font-bold text-[var(--vs-text)]">
              {hrSnapshot?.latestValue ?? '—'}{' '}
              <span className="text-xs font-medium text-[var(--vs-text-muted)]">bpm</span>
            </p>
            <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--vs-border)]">
              <div className="h-full rounded-full bg-amber-500" style={{ width: '78%' }} />
            </div>
            <p className="mt-2 text-xs text-[var(--vs-text-secondary)]">
              Usual average: {hrSnapshot?.baselineMean ?? '—'} bpm
            </p>
          </div>

          <div className="vs-glass-card p-5">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-[var(--vs-text-secondary)]">
                Daily steps
              </span>
              <Footprints className="h-4 w-4 text-[var(--vs-accent)]" />
            </div>
            <p className="mt-2 vs-kpi-num text-[28px] leading-tight font-bold text-[var(--vs-text)]">
              {latestSteps.toLocaleString()}{' '}
              <span className="text-xs font-medium text-[var(--vs-text-muted)]">steps</span>
            </p>
            <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--vs-border)]">
              <div
                className="h-full rounded-full bg-[var(--vs-accent)]"
                style={{ width: `${Math.min(100, Math.round((latestSteps / 9000) * 100))}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-[var(--vs-text-secondary)]">
              Daily wearable step count
            </p>
          </div>

          <div className="vs-glass-card p-5">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-[var(--vs-text-secondary)]">Sleep</span>
              <Moon className="h-4 w-4 text-[var(--vs-accent)]" />
            </div>
            <p className="mt-2 vs-kpi-num text-[28px] leading-tight font-bold text-[var(--vs-text)]">
              {latestSleep}{' '}
              <span className="text-xs font-medium text-[var(--vs-text-muted)]">hrs</span>
            </p>
            <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--vs-border)]">
              <div
                className="h-full rounded-full bg-[var(--vs-accent)]"
                style={{ width: `${Math.min(100, Math.round((latestSleep / 8.5) * 100))}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-[var(--vs-text-secondary)]">
              {latestSleep >= 7.0
                ? 'Restful overnight sleep'
                : 'Slightly shorter sleep recently'}
            </p>
          </div>

          <div className="vs-glass-card p-5">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-[var(--vs-text-secondary)]">
                SpO₂ (Blood Oxygen)
              </span>
              <Wind className="h-4 w-4 text-[var(--vs-accent)]" />
            </div>
            <p className="mt-2 vs-kpi-num text-[28px] leading-tight font-bold text-[var(--vs-text)]">
              {spo2Snapshot?.latestValue ?? '97.8'}{' '}
              <span className="text-xs font-medium text-[var(--vs-text-muted)]">%</span>
            </p>
            <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--vs-border)]">
              <div className="h-full rounded-full bg-[var(--vs-success)]" style={{ width: '95%' }} />
            </div>
            <p className="mt-2 text-xs text-[var(--vs-text-secondary)]">
              Usual average: {spo2Snapshot?.baselineMean ?? '97.9'}%
            </p>
          </div>
        </div>
      </div>

      {/* 7-Day Caregiver-Ready AI Weekly Summary */}
      <WeeklySummaryCard
        personaId={resolvedMode}
        memberName={displayName}
        readings={displayReadings}
        baselines={displayBaselines}
        alerts={displayAlerts}
        apiFetch={apiFetch}
      />

      {/* Detailed Tracked Channel Selector + Trajectory Chart & First-Detected Timeline */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <SurfaceCard className="lg:col-span-8 p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--vs-border)] pb-4">
            <div>
              <p className="text-xs font-medium text-[var(--vs-accent)]">
                Personal Baseline Comparison
              </p>
              <h2 className="mt-0.5 font-display text-lg font-semibold text-[var(--vs-text)]">
                {METRIC_DEFINITIONS[selectedMetric].label} Over Time
              </h2>
              <p className="mt-0.5 text-xs text-[var(--vs-text-muted)]">
                Shaded band shows what is normal for {firstName}.
              </p>
            </div>

            {activeMetricBaseline && activeMetricBaseline.mean !== null && (
              <div className="text-right">
                <p className="text-xs text-[var(--vs-text-muted)]">Personal normal</p>
                <p className="font-mono-num text-sm font-semibold text-[var(--vs-text)]">
                  {activeMetricBaseline.mean} {activeMetricBaseline.unit}
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {displaySnapshots.map((snap) => {
              const active = snap.metric === selectedMetric;
              return (
                <button
                  key={snap.metric}
                  type="button"
                  onClick={() => setSelectedMetric(snap.metric)}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors ${
                    active
                      ? 'border-[var(--vs-accent)] bg-[var(--vs-accent-soft)] text-[var(--vs-accent-soft-text)]'
                      : 'border-[var(--vs-border)] bg-[var(--vs-bg)] text-[var(--vs-text-secondary)] hover:text-[var(--vs-text)]'
                  }`}
                >
                  {METRIC_DEFINITIONS[snap.metric].shortLabel}:{' '}
                  <span className="font-mono-num font-semibold">
                    {snap.latestValue ?? '—'} {snap.unit}
                  </span>
                </button>
              );
            })}
          </div>

          <LiveWaveformCanvas
            heartRateBpm={hrSnapshot?.latestValue ?? 69.7}
            spo2Pct={spo2Snapshot?.latestValue ?? 97.8}
            sourceLabel={deviceLabel}
            isSimulated={displayDominantSource !== 'real_csv'}
            height={112}
          />

          <BaselineCalibrationWidget
            band={calibrationBand}
            mode={bandMode}
            onModeChange={setBandMode}
            showBand={showCalibrationBand}
            onToggleBand={() => setShowCalibrationBand((prev) => !prev)}
          />

          <VitalTrendChart
            readings={displayReadings}
            metric={selectedMetric}
            baselineMean={activeSnapshot?.baselineMean ?? activeMetricBaseline?.mean ?? null}
            baselineStdDev={activeMetricBaseline?.stdDev ?? null}
            calibrationBand={{
              low: calibrationBand.activeLow,
              high: calibrationBand.activeHigh,
              mean: calibrationBand.mean,
              modeLabel: bandMode === 'full_range' ? '30-Day Min–Max' : '30-Day Typical Range',
            }}
            showCalibrationBand={showCalibrationBand}
            height={275}
          />

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--vs-border)] pt-3 text-xs">
            <TrendStatusLabel status={activeSnapshot?.trendStatus ?? 'within_baseline'} />
            <span className="text-[var(--vs-text-secondary)]">
              {activeSnapshot?.trendSummary ?? 'Tracking personal pattern.'}
            </span>
          </div>
        </SurfaceCard>

        {/* First-Detected Health Timeline Card */}
        <SurfaceCard className="lg:col-span-4 p-5 sm:p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-[var(--vs-border)] pb-3.5">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-[var(--vs-accent)]" />
                <h2 className="font-display text-base font-semibold text-[var(--vs-text)]">
                  First-Detected Timeline
                </h2>
              </div>
              <Link
                to="/app/timeline"
                className="text-xs font-medium text-[var(--vs-accent)] hover:underline"
              >
                Full Timeline
              </Link>
            </div>

            <ol className="mt-4 space-y-3">
              {firstDetectedSteps.map((step) => (
                <li
                  key={step.day + step.title}
                  className="vs-glass-subcard rounded-xl p-3.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono-num text-xs font-semibold text-[var(--vs-accent)]">
                      {step.day}
                    </span>
                    <span className="font-mono-num text-xs font-semibold text-[var(--vs-text)]">
                      {step.readingText}
                    </span>
                  </div>
                  <p className="mt-1 text-xs font-semibold text-[var(--vs-text)]">{step.title}</p>
                  <p className="mt-0.5 text-xs text-[var(--vs-text-secondary)]">{step.detail}</p>
                </li>
              ))}
            </ol>
          </div>

          <Link
            to="/app/timeline"
            className="mt-4 inline-flex items-center justify-between rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface-muted)] px-3.5 py-2.5 text-xs font-medium text-[var(--vs-text)] hover:bg-[var(--vs-hover)] transition-colors"
          >
            <span>See full change progression</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </SurfaceCard>
      </div>

      {/* Bottom Row: Plain-English AI Summary & Recent Alert History */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SurfaceCard className="p-5 sm:p-6">
          <div className="flex items-center justify-between border-b border-[var(--vs-border)] pb-3.5">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[var(--vs-accent)]" />
              <h2 className="font-display text-base font-semibold text-[var(--vs-text)]">
                Plain-English AI Summary
              </h2>
            </div>
            <Link
              to="/app/insights"
              className="text-xs font-medium text-[var(--vs-accent)] hover:underline"
            >
              View All
            </Link>
          </div>

          {displayInsights.length === 0 ? (
            <p className="py-8 text-sm text-[var(--vs-text-muted)]">
              No pattern notes generated for this period.
            </p>
          ) : (
            <div className="divide-y divide-[var(--vs-border)]">
              {displayInsights.map((ins) => (
                <div key={ins.id} className="py-4 space-y-1.5">
                  <p className="text-xs text-[var(--vs-text-muted)]">
                    {ins.metricLabel} · {ins.durationAndTrend}
                  </p>
                  <h3 className="font-display text-sm font-semibold text-[var(--vs-text)]">
                    {ins.title}
                  </h3>
                  <p className="text-xs leading-relaxed text-[var(--vs-text-secondary)]">
                    {ins.geminiAnalysis?.summary ?? ins.whatChanged}
                  </p>
                  {ins.geminiAnalysis?.disclaimer && (
                    <p className="text-[11px] text-[var(--vs-text-muted)]">
                      {ins.geminiAnalysis.disclaimer}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </SurfaceCard>

        <SurfaceCard className="p-5 sm:p-6">
          <div className="flex items-center justify-between border-b border-[var(--vs-border)] pb-3.5">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-[var(--vs-accent)]" />
              <h2 className="font-display text-base font-semibold text-[var(--vs-text)]">
                Recent Alerts
              </h2>
            </div>
            <Link
              to="/app/alerts"
              className="text-xs font-medium text-[var(--vs-accent)] hover:underline"
            >
              Manage Alerts
            </Link>
          </div>

          {displayAlerts.length === 0 ? (
            <div className="py-8 space-y-1">
              <p className="text-sm font-medium text-[var(--vs-text)]">No alerts triggered</p>
              <p className="text-xs text-[var(--vs-text-muted)]">
                {firstName}&apos;s wearable measurements have stayed inside his personal normal range.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--vs-border)]">
              {displayAlerts.map((alert) => (
                <div key={alert.id} className="py-4 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--vs-text)]">{alert.title}</p>
                    <p className="mt-0.5 text-xs text-[var(--vs-text-secondary)]">
                      {alert.evidenceSummary}
                    </p>
                    <p className="mt-1 font-mono-num text-[11px] text-[var(--vs-text-muted)]">
                      First noticed {formatDateTime(alert.detectedAt)}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 text-xs font-medium capitalize ${
                      alert.status === 'resolved'
                        ? 'text-[var(--vs-success)]'
                        : alert.status === 'acknowledged'
                          ? 'text-[var(--vs-accent)]'
                          : 'text-[var(--vs-warning)]'
                    }`}
                  >
                    {alert.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </SurfaceCard>
      </div>

      {/* Sleep & Daily Steps Dedicated 2D Recharts Panels */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SurfaceCard className="p-5 sm:p-6 space-y-3">
          <div className="flex items-center justify-between border-b border-[var(--vs-border)] pb-3">
            <div>
              <p className="text-xs font-medium text-[var(--vs-accent)]">Overnight Recovery</p>
              <h2 className="mt-0.5 font-display text-base font-semibold text-[var(--vs-text)]">
                Sleep Duration (Hours)
              </h2>
            </div>
            <span className="font-mono-num text-sm font-semibold text-[var(--vs-text)]">
              {latestSleep} hrs latest
            </span>
          </div>
          <SleepPatternChart readings={displayReadings} height={225} />
        </SurfaceCard>

        <SurfaceCard className="p-5 sm:p-6 space-y-3">
          <div className="flex items-center justify-between border-b border-[var(--vs-border)] pb-3">
            <div>
              <p className="text-xs font-medium text-[var(--vs-accent)]">Daily Movement</p>
              <h2 className="mt-0.5 font-display text-base font-semibold text-[var(--vs-text)]">
                Daily Steps
              </h2>
            </div>
            <span className="font-mono-num text-sm font-semibold text-[var(--vs-text)]">
              {latestSteps.toLocaleString()} steps latest
            </span>
          </div>
          <DailyStepsBarChart readings={displayReadings} height={225} />
        </SurfaceCard>
      </div>

      {/* Additional Workspace Modules */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <SurfaceCard className="p-4 flex items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-semibold text-[var(--vs-accent)]">
              <Activity className="h-3.5 w-3.5" />
              Live Readings &amp; Camera Check
            </div>
            <p className="text-xs text-[var(--vs-text-secondary)]">
              Live wearable waveform preview and optional camera pulse check.
            </p>
          </div>
          <Link
            to="/app/live-vitals"
            className="vs-btn-secondary shrink-0 rounded-xl px-3 py-2 text-xs font-semibold whitespace-nowrap"
          >
            Open →
          </Link>
        </SurfaceCard>

        <SurfaceCard className="p-4 flex items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-semibold text-[var(--vs-accent)]">
              <Smile className="h-3.5 w-3.5" />
              Sleep &amp; Wellbeing Check-In
            </div>
            <p className="text-xs text-[var(--vs-text-secondary)]">
              Log daily energy, rest, and personal notes alongside wearable trends.
            </p>
          </div>
          <Link
            to="/app/wellbeing"
            className="vs-btn-secondary shrink-0 rounded-xl px-3 py-2 text-xs font-semibold whitespace-nowrap"
          >
            Check In →
          </Link>
        </SurfaceCard>

        <SurfaceCard className="p-4 flex items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-semibold text-[var(--vs-accent)]">
              <Users className="h-3.5 w-3.5" />
              Caregiver Sharing &amp; Alerts
            </div>
            <p className="text-xs text-[var(--vs-text-secondary)]">
              Choose which family members receive summaries and check alert status.
            </p>
          </div>
          <Link
            to="/app/caregiver-network"
            className="vs-btn-secondary shrink-0 rounded-xl px-3 py-2 text-xs font-semibold whitespace-nowrap"
          >
            Manage →
          </Link>
        </SurfaceCard>
      </div>
    </div>
  );
}
