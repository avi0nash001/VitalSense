import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock,
  Send,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import type { AlertRecord, ConsentSettings } from '../lib/types';
import {
  DashboardSkeleton,
  formatDateTime,
  PageHeader,
  SourceAttribution,
  StateNotice,
  SurfaceCard,
} from '../components/ui/Primitives';

interface AlertsResponse {
  alerts: AlertRecord[];
  consent: ConsentSettings;
}

export function AlertsPage() {
  const { apiFetch } = useAuth();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();

  const [filter, setFilter] = useState<'all' | 'open' | 'acknowledged' | 'resolved'>('all');
  const [activeFollowUpId, setActiveFollowUpId] = useState<string | null>(null);
  const [followUpStatus, setFollowUpStatus] = useState<'scheduled' | 'completed'>('scheduled');
  const [followUpNote, setFollowUpNote] = useState('');

  const { data, isLoading, error, refetch } = useQuery<AlertsResponse>({
    queryKey: ['alerts'],
    queryFn: () => apiFetch<AlertsResponse>('/api/alerts'),
  });

  const ackMutation = useMutation({
    mutationFn: (alertId: string) =>
      apiFetch<{ alert: AlertRecord }>(`/api/alerts/${alertId}/acknowledge`, {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['timeline'] });
      queryClient.invalidateQueries({ queryKey: ['workspace-overview'] });
      pushToast({ title: 'Alert acknowledged', variant: 'success' });
    },
    onError: (err) => {
      pushToast({
        title: 'Could not acknowledge alert',
        description: err instanceof Error ? err.message : 'Please retry.',
        variant: 'error',
      });
    },
  });

  const followUpMutation = useMutation({
    mutationFn: (vars: { alertId: string; status: 'scheduled' | 'completed'; note: string }) =>
      apiFetch<{ alert: AlertRecord }>(`/api/alerts/${vars.alertId}/followup`, {
        method: 'POST',
        body: JSON.stringify({ status: vars.status, note: vars.note }),
      }),
    onSuccess: () => {
      setActiveFollowUpId(null);
      setFollowUpNote('');
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['timeline'] });
      queryClient.invalidateQueries({ queryKey: ['workspace-overview'] });
      pushToast({ title: 'Follow-up recorded', variant: 'success' });
    },
    onError: (err) => {
      pushToast({
        title: 'Unable to save follow-up',
        description: err instanceof Error ? err.message : 'Check your note and retry.',
        variant: 'error',
      });
    },
  });

  if (isLoading) return <DashboardSkeleton />;

  if (error || !data) {
    return (
      <StateNotice
        variant="error"
        title="Unable to load alerts"
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

  const filteredAlerts = data.alerts.filter((a) =>
    filter === 'all' ? true : a.status === filter
  );

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Pattern Notifications & Follow-Up"
        title="Alert Management"
        description="Review sustained pattern alerts, caregiver notification delivery, acknowledgements, and documented follow-up actions."
        actions={
          <div className="flex flex-wrap items-center gap-1 rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface-muted)] p-1">
            {(['all', 'open', 'acknowledged', 'resolved'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setFilter(tab)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors whitespace-nowrap ${
                  filter === tab
                    ? 'bg-[var(--vs-surface)] text-[var(--vs-text)] shadow-xs'
                    : 'text-[var(--vs-text-secondary)] hover:text-[var(--vs-text)]'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        }
      />

      {filteredAlerts.length === 0 ? (
        <StateNotice
          variant="empty"
          title="No alerts in this view"
          message="Alerts are created only when multi-day readings drift consistently outside the established personal baseline."
        />
      ) : (
        <div className="space-y-4">
          {filteredAlerts.map((alert) => {
            const isFollowUpOpen = activeFollowUpId === alert.id;
            return (
              <SurfaceCard key={alert.id} className="p-5 sm:p-6 space-y-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--vs-text-muted)]">
                      <span
                        className={`inline-flex items-center gap-1 font-semibold capitalize ${
                          alert.severity === 'priority'
                            ? 'text-[var(--vs-danger)]'
                            : alert.severity === 'attention'
                              ? 'text-[var(--vs-warning)]'
                              : 'text-[var(--vs-text-secondary)]'
                        }`}
                      >
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {alert.severity} severity
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono-num">
                        Detected {formatDateTime(alert.detectedAt)}
                      </span>
                      <span aria-hidden="true">·</span>
                      <SourceAttribution source={alert.source} />
                    </div>

                    <h2 className="font-display text-base font-semibold text-[var(--vs-text)]">
                      {alert.title}
                    </h2>
                    <p className="text-sm text-[var(--vs-text-secondary)]">{alert.evidenceSummary}</p>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <Link
                      to="/app/timeline"
                      className="vs-btn-secondary rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap"
                    >
                      View Timeline
                    </Link>

                    {!alert.acknowledgement.acknowledged && (
                      <button
                        type="button"
                        onClick={() => ackMutation.mutate(alert.id)}
                        disabled={ackMutation.isPending}
                        className="vs-btn-primary rounded-lg px-3.5 py-1.5 text-xs font-medium disabled:opacity-60 whitespace-nowrap"
                      >
                        Acknowledge Alert
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setActiveFollowUpId(isFollowUpOpen ? null : alert.id);
                        setFollowUpNote(alert.followUp.note ?? '');
                        setFollowUpStatus(
                          alert.followUp.status === 'completed' ? 'completed' : 'scheduled'
                        );
                      }}
                      className="rounded-lg border border-[var(--vs-accent)]/30 bg-[var(--vs-accent-soft)] px-3 py-1.5 text-xs font-medium text-[var(--vs-accent-soft-text)] hover:opacity-90 whitespace-nowrap"
                    >
                      {alert.followUp.status === 'none'
                        ? 'Record Follow-Up'
                        : 'Update Follow-Up'}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 border-t border-[var(--vs-border)] pt-4 sm:grid-cols-3 text-xs">
                  <div>
                    <p className="text-[var(--vs-text-muted)]">Acknowledgement Status</p>
                    {alert.acknowledgement.acknowledged ? (
                      <p className="mt-1 inline-flex items-center gap-1.5 font-medium text-[var(--vs-success)]">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Acknowledged by {alert.acknowledgement.by}
                      </p>
                    ) : (
                      <p className="mt-1 inline-flex items-center gap-1.5 font-medium text-[var(--vs-warning)]">
                        <Clock className="h-3.5 w-3.5" />
                        Pending acknowledgement
                      </p>
                    )}
                  </div>

                  <div>
                    <p className="text-[var(--vs-text-muted)]">Caregiver Notification Log</p>
                    {alert.notifications.map((n) => (
                      <p key={n.id} className="mt-1 flex items-center gap-1.5 text-[var(--vs-text-secondary)]">
                        <Bell className="h-3.5 w-3.5 text-[var(--vs-text-muted)]" />
                        <span>
                          {n.recipient} ·{' '}
                          {n.status === 'delivered'
                            ? 'Delivered'
                            : 'Withheld by consent'}
                        </span>
                      </p>
                    ))}
                  </div>

                  <div>
                    <p className="text-[var(--vs-text-muted)]">Follow-Up Status</p>
                    <p className="mt-1 font-medium text-[var(--vs-text)] capitalize">
                      {alert.followUp.status === 'none'
                        ? 'No follow-up logged'
                        : `${alert.followUp.status}${alert.followUp.note ? ` — ${alert.followUp.note}` : ''}`}
                    </p>
                  </div>
                </div>

                {isFollowUpOpen && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      followUpMutation.mutate({
                        alertId: alert.id,
                        status: followUpStatus,
                        note: followUpNote,
                      });
                    }}
                    className="rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface-muted)] p-4 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs font-semibold text-[var(--vs-text)]">
                        Document Follow-Up Action
                      </p>
                      <select
                        aria-label="Follow-up status"
                        value={followUpStatus}
                        onChange={(e) =>
                          setFollowUpStatus(e.target.value as 'scheduled' | 'completed')
                        }
                        className="vs-input rounded-lg px-2.5 py-1.5 text-xs"
                      >
                        <option value="scheduled">Follow-up scheduled / monitoring</option>
                        <option value="completed">Follow-up completed (Resolve alert)</option>
                      </select>
                    </div>
                    <textarea
                      rows={2}
                      required
                      minLength={3}
                      value={followUpNote}
                      onChange={(e) => setFollowUpNote(e.target.value)}
                      placeholder="e.g., Spoke with Elena by phone; monitoring hydration and sleep schedule for 48 hours."
                      className="vs-input w-full rounded-lg px-3 py-2 text-sm"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveFollowUpId(null)}
                        className="vs-btn-secondary rounded-lg px-3 py-1.5 text-xs font-medium"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={followUpMutation.isPending || followUpNote.trim().length < 3}
                        className="vs-btn-primary inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-medium disabled:opacity-60"
                      >
                        <Send className="h-3.5 w-3.5" />
                        Save Follow-Up
                      </button>
                    </div>
                  </form>
                )}
              </SurfaceCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
