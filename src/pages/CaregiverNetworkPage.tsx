import { type FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  CheckCircle2,
  Plus,
  ShieldCheck,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import type {
  ConsentRecord,
  SafetyAlertCategory,
  SafetyAlertRecord,
  SafetyContact,
} from '../lib/types';
import {
  DashboardSkeleton,
  formatDateTime,
  PageHeader,
  StateNotice,
  SurfaceCard,
} from '../components/ui/Primitives';

interface SafetyHistoryResponse {
  alerts: SafetyAlertRecord[];
  contacts: SafetyContact[];
  consentRecords: ConsentRecord[];
}

const CATEGORY_LABELS: Record<SafetyAlertCategory, string> = {
  sensor_issue: 'Sensor Monitoring Issue',
  physiological_change: 'Sustained Health Pattern Change',
  wellbeing_support: 'Wellbeing Support Request',
  missed_checkin: 'Missed Voluntary Check-In',
  caregiver_followup: 'Caregiver Follow-Up',
};

export function CaregiverNetworkPage() {
  const { user, apiFetch } = useAuth();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [relation, setRelation] = useState('');
  const [role, setRole] = useState<SafetyContact['role']>('trusted_contact');
  const [channel, setChannel] = useState<SafetyContact['channel']>('Portal & Digest');
  const [contactValue, setContactValue] = useState('');

  const { data, isLoading } = useQuery<SafetyHistoryResponse>({
    queryKey: ['safety-history'],
    queryFn: () => apiFetch<SafetyHistoryResponse>('/api/safety/history'),
  });

  const addContactMutation = useMutation({
    mutationFn: () =>
      apiFetch('/api/safety/contacts', {
        method: 'POST',
        body: JSON.stringify({
          name,
          relation,
          role,
          channel,
          contactValue,
          notifyOnCategories: ['physiological_change', 'wellbeing_support'],
        }),
      }),
    onSuccess: () => {
      setName('');
      setRelation('');
      setContactValue('');
      queryClient.invalidateQueries({ queryKey: ['safety-history'] });
      queryClient.invalidateQueries({ queryKey: ['safety-contacts'] });
      pushToast({
        title: 'Trusted contact added',
        description: 'Notification preferences saved.',
        variant: 'success',
      });
    },
    onError: (err) => {
      pushToast({
        title: 'Unable to add contact',
        description: err instanceof Error ? err.message : 'Check contact fields.',
        variant: 'error',
      });
    },
  });

  const removeContactMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/safety/contacts/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['safety-history'] });
      queryClient.invalidateQueries({ queryKey: ['safety-contacts'] });
      pushToast({
        title: 'Contact removed',
        variant: 'info',
      });
    },
  });

  const acknowledgeAlertMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/safety/alerts/${id}/acknowledge`, {
        method: 'POST',
        body: JSON.stringify({ followUpNote: 'Confirmed via Personal Safety Network.' }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['safety-history'] });
      pushToast({
        title: 'Safety alert acknowledged',
        variant: 'success',
      });
    },
  });

  const deleteCvDataMutation = useMutation({
    mutationFn: () =>
      apiFetch('/api/privacy/cv-data', {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rppg-history'] });
      pushToast({
        title: 'Stored camera pulse records cleared',
        description: 'All stored optical pulse check records have been removed.',
        variant: 'success',
      });
    },
  });

  const handleAddContact = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !relation.trim() || !contactValue.trim()) return;
    addContactMutation.mutate();
  };

  if (isLoading) return <DashboardSkeleton />;

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Trusted Contacts & Privacy"
        title="Caregiver Network & Privacy"
        description="Manage authorized caregivers, trusted contacts, consent records, and alert notifications."
      />

      <StateNotice
        variant="info"
        title="Human Confirmation & Non-Emergency Framing"
        message="A missed voluntary check-in alone is never escalated as an emergency. Alerts support configurable human confirmation and clear follow-up records."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Trusted & Emergency Contacts */}
        <SurfaceCard className="lg:col-span-6 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-[var(--vs-text)]">
              Trusted &amp; Emergency Contacts ({data?.contacts.length ?? 0})
            </h2>
            <UserPlus className="h-4 w-4 text-[var(--vs-accent)]" />
          </div>

          <div className="space-y-2.5">
            {(data?.contacts ?? []).map((cnt) => (
              <div
                key={cnt.id}
                className="flex items-start justify-between gap-3 rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface-muted)] p-3.5 text-xs"
              >
                <div className="space-y-1">
                  <p className="font-semibold text-[var(--vs-text)]">
                    {cnt.name} · <span className="font-normal text-[var(--vs-text-secondary)]">{cnt.relation}</span>
                  </p>
                  <p className="font-mono-num text-[11px] text-[var(--vs-text-muted)]">
                    {cnt.channel}: {cnt.contactValue} · Role: {cnt.role.replace('_', ' ')}
                  </p>
                </div>
                {user?.role === 'member' && (
                  <button
                    type="button"
                    aria-label={`Remove ${cnt.name}`}
                    onClick={() => removeContactMutation.mutate(cnt.id)}
                    className="rounded-lg p-1.5 text-[var(--vs-text-muted)] hover:text-[var(--vs-danger)]"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {user?.role === 'member' && (
            <form onSubmit={handleAddContact} className="border-t border-[var(--vs-border)] pt-4 space-y-3">
              <p className="text-xs font-semibold text-[var(--vs-text)]">Add Trusted / Emergency Contact</p>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Full name"
                  required
                  className="vs-input rounded-xl px-3 py-2 text-xs"
                />
                <input
                  type="text"
                  value={relation}
                  onChange={(e) => setRelation(e.target.value)}
                  placeholder="Relationship (e.g. Spouse, Clinician)"
                  required
                  className="vs-input rounded-xl px-3 py-2 text-xs"
                />
                <select
                  aria-label="Contact role"
                  value={role}
                  onChange={(e) => setRole(e.target.value as SafetyContact['role'])}
                  className="vs-input rounded-xl px-3 py-2 text-xs"
                >
                  <option value="trusted_contact">Trusted Contact</option>
                  <option value="caregiver">Authorized Caregiver</option>
                  <option value="emergency">Emergency Contact</option>
                </select>
                <select
                  aria-label="Delivery channel"
                  value={channel}
                  onChange={(e) => setChannel(e.target.value as SafetyContact['channel'])}
                  className="vs-input rounded-xl px-3 py-2 text-xs"
                >
                  <option value="Portal & Digest">Portal &amp; Digest</option>
                  <option value="Email (Resend)">Email (Resend)</option>
                  <option value="Telegram Bot">Telegram Bot</option>
                  <option value="Phone">Phone</option>
                </select>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={contactValue}
                  onChange={(e) => setContactValue(e.target.value)}
                  placeholder="Email, Telegram handle, or phone number"
                  required
                  className="vs-input flex-1 rounded-xl px-3 py-2 text-xs"
                />
                <button
                  type="submit"
                  disabled={addContactMutation.isPending}
                  className="vs-btn-primary inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold whitespace-nowrap"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Contact
                </button>
              </div>
            </form>
          )}
        </SurfaceCard>

        {/* Safety Alert Queue & Privacy Ledger */}
        <div className="lg:col-span-6 space-y-6">
          <SurfaceCard className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-[var(--vs-text)]">
                Safety Network Alert Log ({data?.alerts.length ?? 0})
              </h2>
              <Bell className="h-4 w-4 text-[var(--vs-accent)]" />
            </div>

            <div className="space-y-2.5 max-h-[290px] overflow-y-auto">
              {(data?.alerts ?? []).map((alt) => (
                <div
                  key={alt.id}
                  className="rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface-muted)] p-3.5 text-xs space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[var(--vs-text)]">
                      {CATEGORY_LABELS[alt.category]}
                    </span>
                    <span className="font-mono-num text-[11px] text-[var(--vs-text-muted)]">
                      {formatDateTime(alt.createdAt)}
                    </span>
                  </div>
                  <p className="font-medium text-[var(--vs-text)]">{alt.title}</p>
                  <p className="text-[var(--vs-text-secondary)]">{alt.description}</p>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-[var(--vs-text-muted)]">
                      {alt.acknowledged
                        ? `Confirmed by ${alt.acknowledgedBy ?? 'Caregiver'}`
                        : 'Pending human confirmation'}
                    </span>
                    {alt.acknowledged ? (
                      <span className="inline-flex items-center gap-1 font-medium text-[var(--vs-success)]">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Confirmed
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => acknowledgeAlertMutation.mutate(alt.id)}
                        className="vs-btn-secondary rounded-lg px-2.5 py-1 text-xs font-medium"
                      >
                        Acknowledge
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </SurfaceCard>

          <SurfaceCard className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-semibold text-[var(--vs-text)]">
                Consent Records &amp; Privacy Deletion
              </h3>
              <ShieldCheck className="h-4 w-4 text-[var(--vs-accent)]" />
            </div>

            <div className="space-y-2 text-xs">
              {(data?.consentRecords ?? []).map((rec) => (
                <div
                  key={rec.id}
                  className="rounded-lg border border-[var(--vs-border)] bg-[var(--vs-surface-muted)] px-3 py-2"
                >
                  <p className="font-semibold text-[var(--vs-text)]">
                    {rec.scope.replace('_', ' ')} — {rec.granted ? 'Granted' : 'Not Active'}
                  </p>
                  <p className="text-[11px] text-[var(--vs-text-muted)]">{rec.retentionPolicy}</p>
                </div>
              ))}
            </div>

            {user?.role === 'member' && (
              <button
                type="button"
                onClick={() => deleteCvDataMutation.mutate()}
                disabled={deleteCvDataMutation.isPending}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--vs-danger)]/30 bg-[var(--vs-danger-soft)] px-3.5 py-2 text-xs font-semibold text-[var(--vs-danger)]"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete Stored Camera Pulse Records
              </button>
            )}
          </SurfaceCard>
        </div>
      </div>
    </div>
  );
}
