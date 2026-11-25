import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import type { ConsentSettings, TimelineEvent } from '../lib/types';
import {
  DashboardSkeleton,
  formatShortDate,
  PageHeader,
  SourceAttribution,
  StateNotice,
  SurfaceCard,
} from '../components/ui/Primitives';
import { GlassRechartsFrame } from '../components/charts/GlassChartShell';
import { buildGlassChartTheme } from '../components/charts/streamingChartUtils';

interface TimelineResponse {
  restrictedByConsent: boolean;
  events: TimelineEvent[];
  consent: ConsentSettings;
}

export function TimelinePage() {
  const { apiFetch } = useAuth();
  const { theme } = useTheme();
  const [filter, setFilter] = useState<'all' | 'active' | 'resolved'>('all');
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  const { data, isLoading, error, refetch } = useQuery<TimelineResponse>({
    queryKey: ['timeline'],
    queryFn: () => apiFetch<TimelineResponse>('/api/timeline'),
  });

  if (isLoading) return <DashboardSkeleton />;

  if (error || !data) {
    return (
      <StateNotice
        variant="error"
        title="Unable to load Health Change Timeline"
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

  if (data.restrictedByConsent) {
    return (
      <div className="space-y-6">
        <PageHeader
          kicker="Signature Feature"
          title="Health Change Timeline"
          description="Chronological progression of sustained shifts detected against personal baselines."
        />
        <StateNotice
          variant="warning"
          title="Timeline access restricted by member consent"
          message="The monitored member has currently disabled caregiver access to detailed Health Change Timeline entries. You can still review authorized alert notifications in the Alert Queue."
        />
      </div>
    );
  }

  const filteredEvents = data.events.filter((evt) => {
    if (filter === 'active') return evt.status !== 'resolved';
    if (filter === 'resolved') return evt.status === 'resolved';
    return true;
  });

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => ({
      ...prev,
      [id]: !(prev[id] ?? id === filteredEvents[0]?.id),
    }));
  };

  const glassTheme = buildGlassChartTheme(theme.tokens);
  const { gridColor, strokeColor: lineColor, refColor, tickStyle } = glassTheme;

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Day-by-Day Progression"
        title="Health Timeline"
        description="See how a change first appeared, lasted across multiple days, and when an alert or caregiver check-in happened."
        actions={
          <div className="flex items-center gap-1 rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface-muted)] p-1">
            {(
              [
                { id: 'all', label: 'All Events' },
                { id: 'active', label: 'Active & Monitoring' },
                { id: 'resolved', label: 'Resolved' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  filter === tab.id
                    ? 'bg-[var(--vs-surface)] text-[var(--vs-text)] shadow-xs'
                    : 'text-[var(--vs-text-secondary)] hover:text-[var(--vs-text)]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        }
      />

      {filteredEvents.length === 0 ? (
        <StateNotice
          variant="empty"
          title="No timeline events match this filter"
          message="When sustained multi-day shifts diverge from the learned personal baseline, VITALSENSE records their complete chronological progression here."
          action={
            <Link
              to="/app/data-lab"
              className="vs-btn-primary inline-block rounded-lg px-3.5 py-2 text-xs font-medium"
            >
              Test Scenarios in Data Lab
            </Link>
          }
        />
      ) : (
        <div className="relative pl-6 sm:pl-8 space-y-6 before:absolute before:left-2.5 sm:before:left-3 before:top-3 before:bottom-3 before:w-px before:bg-[var(--vs-border-strong)]">
          {filteredEvents.map((evt, index) => {
            const isExpanded = expandedIds[evt.id] ?? index === 0;
            return (
              <div key={evt.id} className="relative">
                {/* Timeline node marker */}
                <span
                  aria-hidden="true"
                  className={`absolute -left-[19px] sm:-left-[23px] top-6 h-3 w-3 rounded-full border-2 border-[var(--vs-surface)] ring-2 ${
                    evt.status === 'resolved'
                      ? 'bg-[var(--vs-success)] ring-[var(--vs-success)]/30'
                      : evt.severity === 'high'
                        ? 'bg-[var(--vs-danger)] ring-[var(--vs-danger)]/30'
                        : 'bg-[var(--vs-warning)] ring-[var(--vs-warning)]/30'
                  }`}
                />

                <SurfaceCard className="overflow-hidden">
                  <button
                    type="button"
                    aria-expanded={isExpanded}
                    onClick={() => toggleExpand(evt.id)}
                    className="w-full p-5 text-left hover:bg-[var(--vs-hover)]/60 transition-colors"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--vs-text-muted)]">
                          <span className="font-mono-num">
                            First detected {formatShortDate(evt.firstDetectedAt)}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{evt.durationDays}-day progression</span>
                          <span aria-hidden="true">·</span>
                          <SourceAttribution source={evt.source} />
                        </div>

                        <h2 className="font-display text-lg font-semibold text-[var(--vs-text)]">
                          {evt.metricLabel}: {evt.deltaText} from personal baseline
                        </h2>

                        <p className="text-sm text-[var(--vs-text-secondary)]">
                          {evt.supportingEvidence.summary}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-4 self-start">
                        <div className="text-right">
                          <p className="font-mono-num text-sm font-semibold text-[var(--vs-text)]">
                            {evt.previousBaseline} → {evt.currentObserved} {evt.unit}
                          </p>
                          <p
                            className={`text-xs font-medium capitalize ${
                              evt.status === 'resolved'
                                ? 'text-[var(--vs-success)]'
                                : 'text-[var(--vs-warning)]'
                            }`}
                          >
                            {evt.status === 'resolved'
                              ? 'Resolved'
                              : evt.severity === 'high'
                                ? 'Active · Priority'
                                : 'Monitoring'}
                          </p>
                        </div>
                        {isExpanded ? (
                          <ChevronUp className="h-5 w-5 text-[var(--vs-text-muted)]" />
                        ) : (
                          <ChevronDown className="h-5 w-5 text-[var(--vs-text-muted)]" />
                        )}
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-[var(--vs-border)] bg-[var(--vs-surface-muted)] p-5 sm:p-6 space-y-6">
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <div>
                          <p className="text-xs text-[var(--vs-text-muted)]">Your Usual Average</p>
                          <p className="mt-1 font-mono-num text-base font-semibold text-[var(--vs-text)]">
                            {evt.previousBaseline} {evt.unit}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-[var(--vs-text-muted)]">Recent Average</p>
                          <p className="mt-1 font-mono-num text-base font-semibold text-[var(--vs-text)]">
                            {evt.currentObserved} {evt.unit}{' '}
                            <span className="text-xs font-normal text-[var(--vs-warning)]">
                              ({evt.deltaText})
                            </span>
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-[var(--vs-text-muted)]">How It Was Noticed</p>
                          <p className="mt-1 text-sm font-medium text-[var(--vs-text)]">
                            {evt.detectionMethod}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-[var(--vs-text-muted)]">Consistency</p>
                          <p className="mt-1 font-mono-num text-sm font-medium text-[var(--vs-text)]">
                            {evt.supportingEvidence.sampleCount} days ·{' '}
                            {evt.supportingEvidence.consistencyPct}% consistent
                          </p>
                        </div>
                      </div>

                      <div className="border-t border-[var(--vs-border)] pt-5">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                          <h3 className="text-xs font-semibold text-[var(--vs-text)]">
                            Development Over Time (Observed vs. Personal Baseline)
                          </h3>
                          <span className="font-mono-num text-[11px] text-[var(--vs-text-muted)]">
                            Avg Sensor Quality: {evt.supportingEvidence.dataQualityAvg}/100
                          </span>
                        </div>
                        <GlassRechartsFrame
                          accentColor={lineColor}
                          height={205}
                          scrubberSeries={{
                            metricLabel: evt.metricLabel,
                            unit: evt.unit,
                            precision: 1,
                            baselineMean: evt.previousBaseline,
                            points: evt.supportingEvidence.progressionPoints.map((p) => ({
                              label: formatShortDate(p.date),
                              timestamp: p.date,
                              value: p.observed,
                              quality: evt.supportingEvidence.dataQualityAvg,
                            })),
                          }}
                        >
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart
                              data={evt.supportingEvidence.progressionPoints.map((p) => ({
                                ...p,
                                shortDate: formatShortDate(p.date),
                              }))}
                              margin={{ top: 10, right: 22, left: -8, bottom: 4 }}
                            >
                              <CartesianGrid
                                strokeDasharray="3 3"
                                vertical={false}
                                stroke={gridColor}
                              />
                              <XAxis
                                dataKey="shortDate"
                                padding={{ left: 10, right: 16 }}
                                minTickGap={22}
                                tick={tickStyle}
                                tickLine={false}
                                axisLine={{ stroke: gridColor }}
                              />
                              <YAxis
                                domain={['auto', 'auto']}
                                tick={tickStyle}
                                tickLine={false}
                                axisLine={false}
                                width={54}
                              />
                              <Tooltip content={() => null} />
                              <ReferenceLine
                                y={evt.previousBaseline}
                                stroke={refColor}
                                strokeDasharray="4 4"
                                strokeOpacity={0.5}
                              />
                              <Line
                                type="monotone"
                                dataKey="observed"
                                stroke={lineColor}
                                strokeWidth={2.4}
                                dot={(dotProps) => {
                                  const { cx, cy, index } = dotProps;
                                  if (typeof cx !== 'number' || typeof cy !== 'number') return null;
                                  const isLast =
                                    index === evt.supportingEvidence.progressionPoints.length - 1;
                                  return (
                                    <circle
                                      key={`tl-dot-${index}`}
                                      cx={cx}
                                      cy={cy}
                                      r={isLast ? 4.5 : 3}
                                      fill={isLast ? lineColor : glassTheme.surfaceColor}
                                      stroke={lineColor}
                                      strokeWidth={2}
                                    />
                                  );
                                }}
                                isAnimationActive={false}
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        </GlassRechartsFrame>
                      </div>

                      <div className="grid grid-cols-1 gap-6 border-t border-[var(--vs-border)] pt-5 lg:grid-cols-2 lg:divide-x lg:divide-[var(--vs-border)]">
                        <div className="space-y-2.5 lg:pr-6">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-xs font-semibold text-[var(--vs-text)]">
                              <Sparkles className="h-4 w-4 text-[var(--vs-accent)]" />
                              Linked AI Explanation &amp; Alert
                            </div>
                            {evt.aiExplanationId && (
                              <Link
                                to="/app/insights"
                                className="text-xs font-medium text-[var(--vs-accent)] hover:underline"
                              >
                                Open Gemini Insight →
                              </Link>
                            )}
                          </div>
                          <p className="text-xs leading-relaxed text-[var(--vs-text-secondary)]">
                            {evt.aiExplanationId
                              ? 'A structured non-diagnostic Gemini explanation is paired with this progression event, separating measured facts from wellness guidance.'
                              : 'Historical resolved shift retained in chronological audit log.'}
                          </p>
                          {evt.alertId && (
                            <div className="pt-1 flex items-center justify-between text-xs">
                              <span className="text-[var(--vs-text-muted)]">Alert Reference</span>
                              <Link
                                to="/app/alerts"
                                className="font-mono-num font-medium text-[var(--vs-text)] hover:text-[var(--vs-accent)]"
                              >
                                {evt.alertId} →
                              </Link>
                            </div>
                          )}
                        </div>

                        <div className="space-y-2.5 lg:pl-6">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-xs font-semibold text-[var(--vs-text)]">
                              <UserCheck className="h-4 w-4 text-[var(--vs-accent)]" />
                              Caregiver Acknowledgement &amp; Follow-Up
                            </div>
                            {evt.caregiverAck.acknowledged ? (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--vs-success)]">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Acknowledged
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--vs-warning)]">
                                <Clock className="h-3.5 w-3.5" />
                                Pending Review
                              </span>
                            )}
                          </div>

                          {evt.caregiverAck.acknowledged ? (
                            <div className="space-y-1.5 text-xs text-[var(--vs-text-secondary)]">
                              <p>
                                Reviewed by{' '}
                                <span className="font-medium text-[var(--vs-text)]">
                                  {evt.caregiverAck.acknowledgedBy}
                                </span>{' '}
                                on {formatShortDate(evt.caregiverAck.acknowledgedAt ?? null)}
                              </p>
                              <p className="text-[var(--vs-text)]">
                                Follow-up ({evt.caregiverAck.followUpStatus.replace('_', ' ')}):{' '}
                                {evt.caregiverAck.followUpNote || 'No follow-up note recorded yet.'}
                              </p>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-xs text-[var(--vs-text-secondary)]">
                                No caregiver acknowledgement logged yet for this shift.
                              </p>
                              <Link
                                to="/app/alerts"
                                className="vs-btn-secondary shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium"
                              >
                                Review in Alerts
                              </Link>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </SurfaceCard>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
