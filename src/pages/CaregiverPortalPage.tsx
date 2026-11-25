import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  Clock,
  Lock,
  Send,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import type {
  AlertRecord,
  ConsentSettings,
  LatestMetricSnapshot,
} from '../lib/types';
import {
  AvatarImage,
  DashboardSkeleton,
  formatDateTime,
  PageHeader,
  StateNotice,
  SurfaceCard,
  TrendStatusLabel,
} from '../components/ui/Primitives';

interface CaregiverOverviewResponse {
  memberProfile: {
    name: string;
    avatarUrl: string;
    wearableDeviceName: string;
  };
  consent: ConsentSettings;
  baselineSummary: {
    overallPct: number;
    statusLabel: string;
  } | null;
  latestSnapshots: LatestMetricSnapshot[];
  recentAlerts: AlertRecord[];
}

export function CaregiverPortalPage() {
  const { apiFetch } = useAuth();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const [nextStatus, setNextStatus] = useState<'scheduled' | 'completed'>('scheduled');

  const { data, isLoading, error, refetch } = useQuery<CaregiverOverviewResponse>({
    queryKey: ['workspace-overview'],
    queryFn: () => apiFetch<CaregiverOverviewResponse>('/api/workspace/overview'),
  });

  const ackMutation = useMutation({
    mutationFn: (alertId: string) =>
      apiFetch(`/api/alerts/${alertId}/acknowledge`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace-overview'] });
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['timeline'] });
      pushToast({ title: 'Alert acknowledged', variant: 'success' });
    },
  });

  const followUpMutation = useMutation({
    mutationFn: (vars: { alertId: string; status: 'scheduled' | 'completed'; note: string }) =>
      apiFetch(`/api/alerts/${vars.alertId}/followup`, {
        method: 'POST',
        body: JSON.stringify({ status: vars.status, note: vars.note }),
      }),
    onSuccess: () => {
      setSelectedAlertId(null);
      setNoteText('');
      queryClient.invalidateQueries({ queryKey: ['workspace-overview'] });
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['timeline'] });
      pushToast({ title: 'Caregiver follow-up saved', variant: 'success' });
    },
  });

  if (isLoading) return <DashboardSkeleton />;

  if (error || !data) {
    return (
      <StateNotice
        variant="error"
        title="Unable to load Caregiver Portal"
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

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Authorized Caregiver Workspace"
        title={`Caring for ${data.memberProfile.name}`}
        description="Clear, consent-governed summary of authorized health pattern updates, open alerts, and follow-up actions."
        actions={
          <Link
            to="/app/alerts"
            className="vs-btn-secondary rounded-xl px-3.5 py-2 text-xs font-medium whitespace-nowrap"
          >
            Full Alert History
          </Link>
        }
      />

      <SurfaceCard className="p-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3.5">
          <AvatarImage
            src={data.memberProfile.avatarUrl}
            alt={data.memberProfile.name}
            name={data.memberProfile.name}
            sizeClass="h-11 w-11"
          />
          <div>
            <p className="font-display text-base font-semibold text-[var(--vs-text)]">
              {data.memberProfile.name}
            </p>
            <p className="text-xs text-[var(--vs-text-muted)]">
              {data.memberProfile.wearableDeviceName}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[var(--vs-text-secondary)]">
          <span className="inline-flex items-center gap-1.5 text-[var(--vs-accent)] font-medium">
            <ShieldCheck className="h-4 w-4" />
            Active Consent Permissions:
          </span>
          <span>Vital Trends: {data.consent.shareVitalTrends ? 'Allowed' : 'Restricted'}</span>
          <span>Timeline: {data.consent.shareTimelineDetails ? 'Allowed' : 'Restricted'}</span>
          <span>AI Insights: {data.consent.shareAiInsights ? 'Allowed' : 'Restricted'}</span>
        </div>
      </SurfaceCard>

      <SurfaceCard className="p-5 sm:p-6">
        <h2 className="font-display text-base font-semibold text-[var(--vs-text)]">
          Authorized Monitoring Summary
        </h2>
        {!data.consent.shareVitalTrends ? (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface-muted)] p-4 text-sm text-[var(--vs-text-secondary)]">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-[var(--vs-text-muted)]" />
            <span>
              {data.memberProfile.name} has paused caregiver visibility for live vital trends.
              You can still acknowledge pattern alerts below.
            </span>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 divide-y divide-[var(--vs-border)] border-t border-[var(--vs-border)] sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-5 lg:divide-x">
            {data.latestSnapshots.map((snap) => (
              <div
                key={snap.metric}
                className="py-3.5 sm:px-4 first:sm:pl-0 last:sm:pr-0"
              >
                <p className="text-xs text-[var(--vs-text-muted)]">{snap.label}</p>
                <p className="mt-1.5 font-mono-num text-xl font-semibold text-[var(--vs-text)]">
                  {snap.latestValue !== null ? snap.latestValue : '—'}{' '}
                  <span className="text-xs font-normal text-[var(--vs-text-muted)]">{snap.unit}</span>
                </p>
                <div className="mt-2">
                  <TrendStatusLabel status={snap.trendStatus} />
                </div>
              </div>
            ))}
          </div>
        )}
      </SurfaceCard>

      <SurfaceCard className="p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-[var(--vs-border)] pb-3.5">
          <div>
            <h2 className="font-display text-base font-semibold text-[var(--vs-text)]">
              Alerts &amp; Caregiver Actions
            </h2>
            <p className="mt-0.5 text-xs text-[var(--vs-text-muted)]">
              Acknowledge notifications and record check-ins so the member sees your follow-up status.
            </p>
          </div>
        </div>

        {data.recentAlerts.length === 0 ? (
          <p className="py-6 text-sm text-[var(--vs-text-muted)]">
            No active pattern alerts require attention right now.
          </p>
        ) : (
          <div className="divide-y divide-[var(--vs-border)]">
            {data.recentAlerts.map((alert) => {
              const isEditing = selectedAlertId === alert.id;
              return (
                <div key={alert.id} className="py-4 space-y-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2 text-xs text-[var(--vs-text-muted)]">
                        <span className="capitalize font-medium text-[var(--vs-text-secondary)]">
                          {alert.severity}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-num">{formatDateTime(alert.detectedAt)}</span>
                      </div>
                      <p className="mt-1 font-display text-sm font-semibold text-[var(--vs-text)]">
                        {alert.title}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--vs-text-secondary)]">{alert.evidenceSummary}</p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {alert.acknowledgement.acknowledged ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--vs-success)]">
                          <CheckCircle2 className="h-4 w-4" />
                          Acknowledged
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => ackMutation.mutate(alert.id)}
                          disabled={ackMutation.isPending}
                          className="vs-btn-primary rounded-lg px-3.5 py-2 text-xs font-medium whitespace-nowrap"
                        >
                          Acknowledge
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setSelectedAlertId(isEditing ? null : alert.id);
                          setNoteText(alert.followUp.note ?? '');
                          setNextStatus(
                            alert.followUp.status === 'completed' ? 'completed' : 'scheduled'
                          );
                        }}
                        className="vs-btn-secondary rounded-lg px-3 py-2 text-xs font-medium whitespace-nowrap"
                      >
                        {alert.followUp.status === 'none' ? 'Log Follow-Up' : 'Edit Follow-Up'}
                      </button>
                    </div>
                  </div>

                  {alert.followUp.status !== 'none' && !isEditing && (
                    <div className="flex items-center gap-2 text-xs text-[var(--vs-text-secondary)]">
                      <Clock className="h-3.5 w-3.5 text-[var(--vs-accent)]" />
                      <span>
                        Follow-up ({alert.followUp.status}): {alert.followUp.note}
                      </span>
                    </div>
                  )}

                  {isEditing && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        followUpMutation.mutate({
                          alertId: alert.id,
                          status: nextStatus,
                          note: noteText,
                        });
                      }}
                      className="rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface-muted)] p-4 space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label
                          htmlFor={`cg-status-${alert.id}`}
                          className="text-xs font-medium text-[var(--vs-text)]"
                        >
                          Follow-up outcome
                        </label>
                        <select
                          id={`cg-status-${alert.id}`}
                          value={nextStatus}
                          onChange={(e) =>
                            setNextStatus(e.target.value as 'scheduled' | 'completed')
                          }
                          className="vs-input rounded-lg px-2.5 py-1.5 text-xs"
                        >
                          <option value="scheduled">Scheduled / Monitoring</option>
                          <option value="completed">Completed Check-In</option>
                        </select>
                      </div>
                      <textarea
                        rows={2}
                        required
                        minLength={3}
                        value={noteText}
                        onChange={(e) => setNoteText(e.target.value)}
                        placeholder="Record check-in notes or next steps..."
                        className="vs-input w-full rounded-lg px-3 py-2 text-sm"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedAlertId(null)}
                          className="vs-btn-secondary rounded-lg px-3 py-1.5 text-xs font-medium"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={followUpMutation.isPending || noteText.trim().length < 3}
                          className="vs-btn-primary inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-medium disabled:opacity-60"
                        >
                          <Send className="h-3.5 w-3.5" />
                          Save Follow-Up
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </SurfaceCard>
    </div>
  );
}
