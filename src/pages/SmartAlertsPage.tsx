import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BellRing,
  CheckCircle2,
  HeartPulse,
  ShieldAlert,
  SlidersHorizontal,
  Users,
  Wind,
  Zap,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { DEFAULT_SMART_ALERT_THRESHOLDS } from '../lib/smartAlertEngine';
import type {
  ConsentSettings,
  MetricBaseline,
  RealtimeDeviationEvent,
  SafetyContact,
  SmartAlertThresholds,
} from '../lib/types';
import {
  DashboardSkeleton,
  formatDateTime,
  PageHeader,
  StateNotice,
  SurfaceCard,
} from '../components/ui/Primitives';

interface SmartAlertsResponse {
  thresholds: SmartAlertThresholds;
  baselines: {
    heartRate: MetricBaseline;
    spo2: MetricBaseline;
  };
  contacts: SafetyContact[];
  consent: ConsentSettings;
  recentDeviations: RealtimeDeviationEvent[];
}

export function SmartAlertsPage() {
  const { apiFetch } = useAuth();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery<SmartAlertsResponse>({
    queryKey: ['smart-alert-thresholds'],
    queryFn: () => apiFetch<SmartAlertsResponse>('/api/smart-alerts/thresholds'),
  });

  const [form, setForm] = useState<SmartAlertThresholds>(DEFAULT_SMART_ALERT_THRESHOLDS);
  const [testHr, setTestHr] = useState<string>('92');
  const [testSpo2, setTestSpo2] = useState<string>('92.5');

  useEffect(() => {
    if (data?.thresholds) {
      setForm(data.thresholds);
    }
  }, [data?.thresholds]);

  const saveMutation = useMutation({
    mutationFn: (payload: Partial<SmartAlertThresholds>) =>
      apiFetch<{ thresholds: SmartAlertThresholds }>('/api/smart-alerts/thresholds', {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['smart-alert-thresholds'] });
      queryClient.invalidateQueries({ queryKey: ['workspace-overview'] });
      pushToast({
        title: 'Smart alert thresholds saved',
        description: 'Live monitoring and caregiver alert rules are now updated.',
        variant: 'success',
      });
    },
    onError: (err) => {
      pushToast({
        title: 'Unable to save alert thresholds',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    },
  });

  const evaluateMutation = useMutation({
    mutationFn: (payload: { heartRate: number | null; spo2: number | null }) =>
      apiFetch<{ breached: boolean; deviations: RealtimeDeviationEvent[] }>(
        '/api/smart-alerts/evaluate',
        {
          method: 'POST',
          body: JSON.stringify({ ...payload, ignoreCooldown: true }),
        }
      ),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['smart-alert-thresholds'] });
      queryClient.invalidateQueries({ queryKey: ['realtime-deviations'] });
      queryClient.invalidateQueries({ queryKey: ['workspace-overview'] });
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      if (res.breached && res.deviations.length > 0) {
        pushToast({
          title: res.deviations[0].title,
          description: res.deviations[0].caregiverNotified
            ? `Notified: ${res.deviations[0].notifiedRecipients.join(', ')}`
            : res.deviations[0].plainEnglishReason,
          variant: 'error',
        });
      } else {
        pushToast({
          title: 'Readings are within your limits',
          description: 'No personal alert rules were crossed for those numbers.',
          variant: 'success',
        });
      }
    },
    onError: (err) => {
      pushToast({
        title: 'Unable to evaluate test reading',
        description: err instanceof Error ? err.message : 'Please check your numbers.',
        variant: 'error',
      });
    },
  });

  const ackMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/smart-alerts/deviations/${id}/acknowledge`, {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['smart-alert-thresholds'] });
      queryClient.invalidateQueries({ queryKey: ['realtime-deviations'] });
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      pushToast({
        title: 'Alert marked as seen',
        description: 'Caregiver and member alert logs are synced.',
        variant: 'info',
      });
    },
  });

  if (isLoading) return <DashboardSkeleton />;

  if (error || !data) {
    return (
      <StateNotice
        variant="error"
        title="Unable to load Smart Alert Thresholds"
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

  const hrBase = data.baselines.heartRate.mean;
  const spo2Base = data.baselines.spo2.mean;
  const hrUpperTrigger =
    hrBase !== null ? Number((hrBase + form.heartRateAboveBaselineBpm).toFixed(1)) : null;
  const hrLowerTrigger =
    hrBase !== null ? Number((hrBase - form.heartRateBelowBaselineBpm).toFixed(1)) : null;
  const spo2DropTrigger =
    spo2Base !== null ? Number((spo2Base - form.spo2DropBelowBaselinePct).toFixed(1)) : null;

  const caregiverConsentBlocked = !data.consent.notifyCaregiverOnAlerts;

  return (
    <div className="space-y-7">
      <PageHeader
        kicker="Smart Alert Thresholds · Personalized Early Warning"
        title="Smart Alert Thresholds"
        description="Choose how far your heart rate or blood oxygen (SpO₂) can move from your normal range before VitalSense alerts you and your connected caregivers."
        actions={
          <Link
            to="/app/alerts"
            className="vs-btn-secondary inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold whitespace-nowrap"
          >
            <BellRing className="h-3.5 w-3.5 text-[var(--vs-accent)]" />
            View Alert History
          </Link>
        }
      />

      {caregiverConsentBlocked && (
        <StateNotice
          variant="warning"
          title="Caregiver alert sharing is currently paused"
          message="Your alerts will still show here for you, but caregiver notifications are paused in your privacy settings."
          action={
            <Link
              to="/app/settings"
              className="vs-btn-secondary rounded-lg px-3 py-1.5 text-xs font-semibold"
            >
              Review Privacy Settings
            </Link>
          }
        />
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left 7 cols: Personalized Threshold Editor */}
        <SurfaceCard className="lg:col-span-7 p-6 sm:p-7 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--vs-border)] pb-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-[var(--vs-accent)]">
              <SlidersHorizontal className="h-4 w-4" />
              Personal Threshold Rules
            </div>
            <span className="font-mono-num text-[11px] text-[var(--vs-text-muted)]">
              Updated {formatDateTime(data.thresholds.updatedAt)}
            </span>
          </div>

          {/* Toggles */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4 rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface-muted)] px-4 py-3">
              <div>
                <p className="text-sm font-medium text-[var(--vs-text)]">
                  Real-time deviation alerts
                </p>
                <p className="text-xs text-[var(--vs-text-secondary)]">
                  Check live heart rate and SpO₂ readings continuously against your thresholds.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={form.enabled}
                aria-label="Enable real-time deviation alerts"
                onClick={() => setForm((f) => ({ ...f, enabled: !f.enabled }))}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
                  form.enabled ? 'bg-[var(--vs-accent)]' : 'bg-[var(--vs-border-strong)]'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition-transform ${
                    form.enabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface-muted)] px-4 py-3">
              <div>
                <p className="text-sm font-medium text-[var(--vs-text)]">
                  Notify connected caregivers
                </p>
                <p className="text-xs text-[var(--vs-text-secondary)]">
                  Send plain-English notices to your approved caregivers when a threshold is crossed.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={form.notifyCaregivers}
                aria-label="Notify connected caregivers"
                onClick={() => setForm((f) => ({ ...f, notifyCaregivers: !f.notifyCaregivers }))}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
                  form.notifyCaregivers ? 'bg-[var(--vs-accent)]' : 'bg-[var(--vs-border-strong)]'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition-transform ${
                    form.notifyCaregivers ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Heart Rate Section */}
          <div className="space-y-4 rounded-2xl border border-[var(--vs-border)] p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <HeartPulse className="h-4 w-4 text-[var(--vs-accent)]" />
                <h2 className="font-display text-base font-semibold text-[var(--vs-text)]">
                  Heart Rate Limits
                </h2>
              </div>
              <span className="font-mono-num text-xs text-[var(--vs-text-secondary)]">
                Your normal average: {hrBase !== null ? `${hrBase} bpm` : 'Learning'}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="hr-above-input"
                  className="block text-xs font-medium text-[var(--vs-text-secondary)]"
                >
                  Alert if above baseline (+ bpm)
                </label>
                <input
                  id="hr-above-input"
                  data-testid="input-hr-above"
                  type="number"
                  min={4}
                  max={35}
                  value={form.heartRateAboveBaselineBpm}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      heartRateAboveBaselineBpm: Number(e.target.value) || 4,
                    }))
                  }
                  className="vs-input mt-1.5 w-full rounded-xl px-3 py-2 font-mono-num text-sm"
                />
                {hrUpperTrigger !== null && (
                  <p className="mt-1 text-[11px] text-[var(--vs-text-muted)]">
                    Triggers around <span className="font-mono-num font-semibold">{hrUpperTrigger} bpm</span> or higher
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="hr-below-input"
                  className="block text-xs font-medium text-[var(--vs-text-secondary)]"
                >
                  Alert if below baseline (- bpm)
                </label>
                <input
                  id="hr-below-input"
                  data-testid="input-hr-below"
                  type="number"
                  min={4}
                  max={30}
                  value={form.heartRateBelowBaselineBpm}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      heartRateBelowBaselineBpm: Number(e.target.value) || 4,
                    }))
                  }
                  className="vs-input mt-1.5 w-full rounded-xl px-3 py-2 font-mono-num text-sm"
                />
                {hrLowerTrigger !== null && (
                  <p className="mt-1 text-[11px] text-[var(--vs-text-muted)]">
                    Triggers around <span className="font-mono-num font-semibold">{hrLowerTrigger} bpm</span> or lower
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="hr-max-input"
                  className="block text-xs font-medium text-[var(--vs-text-secondary)]"
                >
                  Hard upper limit (bpm)
                </label>
                <input
                  id="hr-max-input"
                  type="number"
                  min={75}
                  max={160}
                  value={form.heartRateMaxBpm}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      heartRateMaxBpm: Number(e.target.value) || 96,
                    }))
                  }
                  className="vs-input mt-1.5 w-full rounded-xl px-3 py-2 font-mono-num text-sm"
                />
              </div>

              <div>
                <label
                  htmlFor="hr-min-input"
                  className="block text-xs font-medium text-[var(--vs-text-secondary)]"
                >
                  Hard lower limit (bpm)
                </label>
                <input
                  id="hr-min-input"
                  type="number"
                  min={35}
                  max={65}
                  value={form.heartRateMinBpm}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      heartRateMinBpm: Number(e.target.value) || 46,
                    }))
                  }
                  className="vs-input mt-1.5 w-full rounded-xl px-3 py-2 font-mono-num text-sm"
                />
              </div>
            </div>
          </div>

          {/* SpO2 Section */}
          <div className="space-y-4 rounded-2xl border border-[var(--vs-border)] p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Wind className="h-4 w-4 text-[var(--vs-success)]" />
                <h2 className="font-display text-base font-semibold text-[var(--vs-text)]">
                  Blood Oxygen (SpO₂) Limits
                </h2>
              </div>
              <span className="font-mono-num text-xs text-[var(--vs-text-secondary)]">
                Your normal average: {spo2Base !== null ? `${spo2Base}%` : 'Learning'}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label
                  htmlFor="spo2-drop-input"
                  className="block text-xs font-medium text-[var(--vs-text-secondary)]"
                >
                  Drop below baseline (- %)
                </label>
                <input
                  id="spo2-drop-input"
                  data-testid="input-spo2-drop"
                  type="number"
                  step="0.5"
                  min={1}
                  max={8}
                  value={form.spo2DropBelowBaselinePct}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      spo2DropBelowBaselinePct: Number(e.target.value) || 2.5,
                    }))
                  }
                  className="vs-input mt-1.5 w-full rounded-xl px-3 py-2 font-mono-num text-sm"
                />
                {spo2DropTrigger !== null && (
                  <p className="mt-1 text-[11px] text-[var(--vs-text-muted)]">
                    Triggers at <span className="font-mono-num font-semibold">{spo2DropTrigger}%</span> or lower
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="spo2-min-input"
                  className="block text-xs font-medium text-[var(--vs-text-secondary)]"
                >
                  Minimum SpO₂ floor (%)
                </label>
                <input
                  id="spo2-min-input"
                  data-testid="input-spo2-min"
                  type="number"
                  step="0.5"
                  min={85}
                  max={97}
                  value={form.spo2MinPct}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      spo2MinPct: Number(e.target.value) || 94,
                    }))
                  }
                  className="vs-input mt-1.5 w-full rounded-xl px-3 py-2 font-mono-num text-sm"
                />
              </div>

              <div>
                <label
                  htmlFor="cooldown-input"
                  className="block text-xs font-medium text-[var(--vs-text-secondary)]"
                >
                  Repeat cooldown (mins)
                </label>
                <input
                  id="cooldown-input"
                  type="number"
                  min={1}
                  max={240}
                  value={form.cooldownMinutes}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      cooldownMinutes: Number(e.target.value) || 15,
                    }))
                  }
                  className="vs-input mt-1.5 w-full rounded-xl px-3 py-2 font-mono-num text-sm"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <p className="text-xs text-[var(--vs-text-muted)]">
              VitalSense explains pattern shifts in simple words and never gives medical diagnoses.
            </p>
            <button
              type="button"
              data-testid="save-smart-thresholds-btn"
              disabled={saveMutation.isPending}
              onClick={() => saveMutation.mutate(form)}
              className="vs-btn-primary rounded-xl px-5 py-2.5 text-xs font-semibold disabled:opacity-60"
            >
              {saveMutation.isPending ? 'Saving...' : 'Save Smart Thresholds'}
            </button>
          </div>
        </SurfaceCard>

        {/* Right 5 cols: Connected Caregivers + Test Trigger */}
        <div className="lg:col-span-5 space-y-6">
          <SurfaceCard className="p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--vs-border)] pb-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-[var(--vs-accent)]">
                <Users className="h-4 w-4" />
                Connected Caregivers
              </div>
              <Link
                to="/app/caregiver-network"
                className="text-xs font-medium text-[var(--vs-accent)] hover:underline"
              >
                Manage Contacts
              </Link>
            </div>

            {data.contacts.length === 0 ? (
              <p className="text-xs text-[var(--vs-text-muted)]">
                No caregivers added yet. Add a family member or trusted contact in Caregiver Centre.
              </p>
            ) : (
              <div className="space-y-2.5">
                {data.contacts.map((contact) => (
                  <div
                    key={contact.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface-muted)] px-3.5 py-2.5 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-[var(--vs-text)] truncate">
                        {contact.name}
                      </p>
                      <p className="text-[11px] text-[var(--vs-text-muted)] truncate">
                        {contact.relation} · {contact.channel}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 text-[11px] font-semibold ${
                        form.notifyCaregivers && !caregiverConsentBlocked && contact.consentVerified
                          ? 'text-[var(--vs-success)]'
                          : 'text-[var(--vs-text-muted)]'
                      }`}
                    >
                      {form.notifyCaregivers && !caregiverConsentBlocked && contact.consentVerified
                        ? 'Active'
                        : 'Paused'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </SurfaceCard>

          {/* Interactive Real-Time Threshold Test */}
          <SurfaceCard className="p-6 space-y-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-[var(--vs-accent)]">
              <Zap className="h-4 w-4" />
              Test Real-Time Deviation Alert
            </div>
            <p className="text-xs text-[var(--vs-text-secondary)] leading-relaxed">
              Try a sample live reading to see how VitalSense checks your custom rules, shows a real-time warning, and notifies your caregivers.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="test-hr-input"
                  className="block text-xs font-medium text-[var(--vs-text-secondary)]"
                >
                  Sample Heart Rate (bpm)
                </label>
                <input
                  id="test-hr-input"
                  type="number"
                  value={testHr}
                  onChange={(e) => setTestHr(e.target.value)}
                  className="vs-input mt-1 w-full rounded-xl px-3 py-2 font-mono-num text-sm"
                />
              </div>
              <div>
                <label
                  htmlFor="test-spo2-input"
                  className="block text-xs font-medium text-[var(--vs-text-secondary)]"
                >
                  Sample SpO₂ (%)
                </label>
                <input
                  id="test-spo2-input"
                  type="number"
                  step="0.5"
                  value={testSpo2}
                  onChange={(e) => setTestSpo2(e.target.value)}
                  className="vs-input mt-1 w-full rounded-xl px-3 py-2 font-mono-num text-sm"
                />
              </div>
            </div>

            <button
              type="button"
              data-testid="test-threshold-trigger-btn"
              disabled={evaluateMutation.isPending}
              onClick={() =>
                evaluateMutation.mutate({
                  heartRate: testHr ? Number(testHr) : null,
                  spo2: testSpo2 ? Number(testSpo2) : null,
                })
              }
              className="vs-btn-primary w-full rounded-xl px-4 py-2.5 text-xs font-semibold disabled:opacity-60"
            >
              {evaluateMutation.isPending ? 'Checking...' : 'Check Reading & Test Alert'}
            </button>
          </SurfaceCard>
        </div>
      </div>

      {/* Real-Time Deviation History */}
      <SurfaceCard className="p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-[var(--vs-border)] pb-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-[var(--vs-accent)]" />
            <h2 className="font-display text-base font-semibold text-[var(--vs-text)]">
              Recent Real-Time Deviation Notifications
            </h2>
          </div>
          <span className="font-mono-num text-xs text-[var(--vs-text-muted)]">
            {data.recentDeviations.length} logged
          </span>
        </div>

        {data.recentDeviations.length === 0 ? (
          <p className="py-4 text-sm text-[var(--vs-text-muted)]">
            No real-time threshold crossings recorded yet. Readings inside your limits stay quiet.
          </p>
        ) : (
          <div className="divide-y divide-[var(--vs-border)]">
            {data.recentDeviations.map((dev) => (
              <div
                key={dev.id}
                data-testid="realtime-deviation-row"
                className="py-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`text-xs font-semibold ${
                        dev.severity === 'priority'
                          ? 'text-[var(--vs-danger)]'
                          : 'text-[var(--vs-warning)]'
                      }`}
                    >
                      {dev.metricLabel} · {dev.deltaText}
                    </span>
                    <span className="font-mono-num text-[11px] text-[var(--vs-text-muted)]">
                      {formatDateTime(dev.triggeredAt)}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-[var(--vs-text)]">{dev.title}</p>
                  <p className="text-xs text-[var(--vs-text-secondary)] leading-relaxed">
                    {dev.plainEnglishReason}
                  </p>
                  <p className="text-[11px] text-[var(--vs-text-muted)]">
                    Rule: {dev.thresholdRuleText} ·{' '}
                    {dev.caregiverNotified
                      ? `Caregiver notified (${dev.notifiedRecipients.join(', ')})`
                      : 'Caregiver notification paused'}
                  </p>
                </div>

                {dev.acknowledged ? (
                  <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-[var(--vs-success)]">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Acknowledged
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => ackMutation.mutate(dev.id)}
                    disabled={ackMutation.isPending}
                    className="vs-btn-secondary shrink-0 rounded-xl px-3.5 py-2 text-xs font-semibold"
                  >
                    Mark as Seen
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </SurfaceCard>
    </div>
  );
}
