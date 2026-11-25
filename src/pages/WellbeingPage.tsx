import { type FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  HeartHandshake,
  MessageCircleHeart,
  PhoneCall,
  Send,
  ShieldAlert,
  Sparkles,
  Users,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import type {
  SafetyContact,
  WellbeingCheckin,
  WellbeingCompanionMessage,
  WellbeingTrendSummary,
} from '../lib/types';
import {
  DashboardSkeleton,
  formatDateTime,
  PageHeader,
  StateNotice,
  SurfaceCard,
} from '../components/ui/Primitives';
import { GlassRechartsFrame } from '../components/charts/GlassChartShell';
import { buildGlassChartTheme } from '../components/charts/streamingChartUtils';

interface WellbeingHistoryResponse {
  restrictedByConsent: boolean;
  checkins: WellbeingCheckin[];
  summary: WellbeingTrendSummary;
  companionMessages: WellbeingCompanionMessage[];
}

interface SafetyContactsResponse {
  contacts: SafetyContact[];
}

export function WellbeingPage() {
  const { apiFetch } = useAuth();
  const { theme } = useTheme();
  const glassTheme = buildGlassChartTheme(theme.tokens);
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [editorialImgFailed, setEditorialImgFailed] = useState<boolean>(false);

  const [mood, setMood] = useState<WellbeingCheckin['mood']>('calm');
  const [sleepQuality, setSleepQuality] = useState<1 | 2 | 3 | 4 | 5>(4);
  const [energyLevel, setEnergyLevel] = useState<1 | 2 | 3 | 4 | 5>(4);
  const [socialConnectedness, setSocialConnectedness] =
    useState<WellbeingCheckin['socialConnectedness']>('connected');
  const [wantsToTalk, setWantsToTalk] = useState<boolean>(false);
  const [breakReminderRequested, setBreakReminderRequested] = useState<boolean>(false);
  const [journalNote, setJournalNote] = useState<string>('');

  const [supportMessage, setSupportMessage] = useState<string>('');
  const [selectedContactId, setSelectedContactId] = useState<string>('');

  const [companionInput, setCompanionInput] = useState<string>('');
  const [companionError, setCompanionError] = useState<string | null>(null);

  const { data, isLoading } = useQuery<WellbeingHistoryResponse>({
    queryKey: ['wellbeing-history'],
    queryFn: () => apiFetch<WellbeingHistoryResponse>('/api/wellbeing/history'),
  });

  const { data: contactsData } = useQuery<SafetyContactsResponse>({
    queryKey: ['safety-contacts'],
    queryFn: () => apiFetch<SafetyContactsResponse>('/api/safety/contacts'),
  });

  const checkinMutation = useMutation({
    mutationFn: () =>
      apiFetch('/api/wellbeing/checkin', {
        method: 'POST',
        body: JSON.stringify({
          mood,
          sleepQuality,
          energyLevel,
          socialConnectedness,
          wantsToTalk,
          breakReminderRequested,
          journalNote,
        }),
      }),
    onSuccess: () => {
      setJournalNote('');
      queryClient.invalidateQueries({ queryKey: ['wellbeing-history'] });
      queryClient.invalidateQueries({ queryKey: ['safety-history'] });
      pushToast({
        title: 'Wellbeing check-in saved',
        description: 'Self-reported patterns updated.',
        variant: 'success',
      });
    },
    onError: (err) => {
      pushToast({
        title: 'Unable to save check-in',
        description: err instanceof Error ? err.message : 'Please retry.',
        variant: 'error',
      });
    },
  });

  const supportRequestMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ recipient: string }>('/api/wellbeing/support-request', {
        method: 'POST',
        body: JSON.stringify({
          contactId: selectedContactId || contactsData?.contacts[0]?.id,
          note: supportMessage,
        }),
      }),
    onSuccess: (res) => {
      setSupportMessage('');
      queryClient.invalidateQueries({ queryKey: ['safety-history'] });
      pushToast({
        title: `Check-in shared with ${res.recipient}`,
        description: 'Added to your Personal Safety Network log.',
        variant: 'success',
      });
    },
    onError: (err) => {
      pushToast({
        title: 'Unable to send support note',
        description: err instanceof Error ? err.message : 'Please write a short note first.',
        variant: 'error',
      });
    },
  });

  const companionMutation = useMutation({
    mutationFn: (message: string) =>
      apiFetch<{ reply: WellbeingCompanionMessage; crisisGuidanceShown: boolean }>(
        '/api/wellbeing/companion',
        {
          method: 'POST',
          body: JSON.stringify({ message }),
        }
      ),
    onSuccess: () => {
      setCompanionError(null);
      setCompanionInput('');
      queryClient.invalidateQueries({ queryKey: ['wellbeing-history'] });
    },
    onError: (err) => {
      setCompanionError(err instanceof Error ? err.message : 'Unable to reach Gemini companion.');
    },
  });

  const handleCompanionSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (companionInput.trim().length < 2) return;
    companionMutation.mutate(companionInput.trim());
  };

  if (isLoading) return <DashboardSkeleton />;

  const summary = data?.summary;
  const checkins = data?.checkins ?? [];
  const chartSeries = [...checkins]
    .slice(0, 10)
    .reverse()
    .map((c) => ({
      date: new Date(c.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' }),
      sleep: c.sleepQuality,
      energy: c.energyLevel,
    }));

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Voluntary Daily Reflections"
        title="Personal Wellbeing Check-Ins"
        description="Reflect on mood, sleep, energy, and feeling connected through gentle voluntary check-ins. VITALSENSE never diagnoses conditions or infers emotion from facial images."
      />

      {summary?.suggestTrustedReachOut && (
        <StateNotice
          variant="info"
          title="Connection Reflection"
          message={summary.neutralObservation}
        />
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Daily Voluntary Check-In Form */}
        <SurfaceCard className="lg:col-span-6 p-5 sm:p-6 space-y-5">
          <div>
            <h2 className="font-display text-base font-semibold text-[var(--vs-text)]">
              Voluntary Daily Check-In
            </h2>
            <p className="text-xs text-[var(--vs-text-muted)]">
              Answer only what feels comfortable — every field is user-controlled.
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-[var(--vs-text-secondary)]">
              How are you feeling today?
            </p>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['calm', 'Calm'],
                  ['okay', 'Okay'],
                  ['tired', 'Tired'],
                  ['stressed', 'Stressed'],
                  ['low', 'Low Mood'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setMood(id)}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors ${
                    mood === id
                      ? 'border-[var(--vs-accent)] bg-[var(--vs-accent)] text-[var(--vs-accent-contrast)]'
                      : 'border-[var(--vs-border)] bg-[var(--vs-surface-muted)] text-[var(--vs-text-secondary)]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-[var(--vs-text-secondary)]">
                How was your sleep? ({sleepQuality}/5)
              </p>
              <div className="flex gap-1.5">
                {([1, 2, 3, 4, 5] as const).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setSleepQuality(n)}
                    className={`flex-1 rounded-lg border py-1.5 font-mono-num text-xs font-semibold ${
                      sleepQuality === n
                        ? 'border-[var(--vs-accent)] bg-[var(--vs-accent-soft)] text-[var(--vs-accent-soft-text)]'
                        : 'border-[var(--vs-border)] bg-[var(--vs-surface-muted)] text-[var(--vs-text-secondary)]'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-medium text-[var(--vs-text-secondary)]">
                How energetic do you feel? ({energyLevel}/5)
              </p>
              <div className="flex gap-1.5">
                {([1, 2, 3, 4, 5] as const).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setEnergyLevel(n)}
                    className={`flex-1 rounded-lg border py-1.5 font-mono-num text-xs font-semibold ${
                      energyLevel === n
                        ? 'border-[var(--vs-accent)] bg-[var(--vs-accent-soft)] text-[var(--vs-accent-soft-text)]'
                        : 'border-[var(--vs-border)] bg-[var(--vs-surface-muted)] text-[var(--vs-text-secondary)]'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-[var(--vs-text-secondary)]">
              Have you felt socially connected today?
            </p>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['connected', 'Connected'],
                  ['somewhat_isolated', 'Somewhat Distant'],
                  ['isolated', 'Feeling Isolated'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSocialConnectedness(id)}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-medium ${
                    socialConnectedness === id
                      ? 'border-[var(--vs-accent)] bg-[var(--vs-accent)] text-[var(--vs-accent-contrast)]'
                      : 'border-[var(--vs-border)] bg-[var(--vs-surface-muted)] text-[var(--vs-text-secondary)]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2 text-xs text-[var(--vs-text-secondary)]">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={wantsToTalk}
                onChange={(e) => setWantsToTalk(e.target.checked)}
              />
              Would you like to talk to someone you trust?
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={breakReminderRequested}
                onChange={(e) => setBreakReminderRequested(e.target.checked)}
              />
              Remind me to take a gentle break later today
            </label>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="wb-journal"
              className="block text-xs font-medium text-[var(--vs-text-secondary)]"
            >
              Optional Personal Journal
            </label>
            <textarea
              id="wb-journal"
              rows={2}
              value={journalNote}
              onChange={(e) => setJournalNote(e.target.value)}
              placeholder="Write anything helpful about your day, rest, or routine..."
              className="vs-input w-full rounded-xl px-3 py-2 text-xs"
            />
          </div>

          <button
            type="button"
            onClick={() => checkinMutation.mutate()}
            disabled={checkinMutation.isPending}
            className="vs-btn-primary w-full rounded-xl py-2.5 text-xs font-semibold"
          >
            {checkinMutation.isPending ? 'Saving Check-In...' : 'Save Wellbeing Check-In'}
          </button>
        </SurfaceCard>

        {/* Right Column: Editorial Reflection Atmosphere, Trends & Social Connection Reach-Out */}
        <div className="lg:col-span-6 space-y-6">
          <div className="relative h-[205px] w-full overflow-hidden rounded-2xl border border-[var(--vs-border)] bg-[var(--vs-surface)] shadow-[var(--vs-shadow-card)]">
            {!editorialImgFailed ? (
              <img
                src="/src/assets/images/wellbeing_editorial_rest_1795451860142.jpg"
                alt="Sunlit oak table with ceramic tea cup and open linen journal symbolizing quiet daily reflection"
                referrerPolicy="no-referrer"
                onError={() => setEditorialImgFailed(true)}
                className="h-full w-full object-cover object-center"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-[var(--vs-surface-muted)] p-6 text-center">
                <p className="text-xs font-medium text-[var(--vs-text-secondary)]">
                  Quiet Daily Reflection · Voluntary Input
                </p>
              </div>
            )}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#111714]/82 via-[#111714]/35 to-transparent"
            />
            <div className="pointer-events-none absolute inset-x-4 bottom-3 flex flex-wrap items-end justify-between gap-2 text-white">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-300">
                  Daily Reflection Atmosphere
                </p>
                <p className="text-sm font-semibold capitalize">
                  {mood} · Sleep {sleepQuality}/5 · Energy {energyLevel}/5
                </p>
              </div>
              <span className="rounded-lg bg-white/15 px-2.5 py-1 text-[11px] font-medium">
                {socialConnectedness === 'connected'
                  ? 'Connected'
                  : socialConnectedness === 'somewhat_isolated'
                    ? 'Somewhat Distant'
                    : 'Reach-out option ready'}
              </span>
            </div>
          </div>

          <SurfaceCard className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-[var(--vs-text)]">
                Self-Reported Sleep &amp; Energy Pattern
              </h2>
              <span className="font-mono-num text-xs text-[var(--vs-text-muted)]">
                {summary?.totalCheckins ?? 0} entries
              </span>
            </div>

            <p className="rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface-muted)] p-3 text-xs leading-relaxed text-[var(--vs-text-secondary)]">
              {summary?.neutralObservation}
            </p>

            <GlassRechartsFrame
              accentColor={glassTheme.strokeColor}
              secondaryColor={glassTheme.secondaryColor}
              height={188}
              compact
              scrubberSeries={{
                metricLabel: 'Sleep',
                unit: '/5',
                precision: 1,
                secondaryLabel: 'Energy',
                secondaryUnit: '/5',
                secondaryPrecision: 1,
                points: chartSeries.map((pt) => ({
                  label: pt.date,
                  value: pt.sleep,
                  secondaryValue: pt.energy,
                })),
              }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartSeries} margin={{ top: 10, right: 16, left: -14, bottom: 2 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={glassTheme.gridColor} />
                  <XAxis
                    dataKey="date"
                    padding={{ left: 8, right: 12 }}
                    tick={glassTheme.tickStyle}
                    tickLine={false}
                    axisLine={{ stroke: glassTheme.gridColor }}
                    minTickGap={20}
                  />
                  <YAxis
                    domain={[1, 5]}
                    ticks={[1, 2, 3, 4, 5]}
                    tick={glassTheme.tickStyle}
                    tickLine={false}
                    axisLine={false}
                    width={36}
                  />
                  <Tooltip content={() => null} />
                  <Line
                    type="monotone"
                    dataKey="sleep"
                    name="Sleep (1-5)"
                    stroke={glassTheme.strokeColor}
                    strokeWidth={2.4}
                    dot={(dotProps) => {
                      const { cx, cy, index } = dotProps;
                      if (typeof cx !== 'number' || typeof cy !== 'number') return null;
                      const isLast = index === chartSeries.length - 1;
                      return (
                        <circle
                          key={`sleep-dot-${index}`}
                          cx={cx}
                          cy={cy}
                          r={isLast ? 4 : 2.8}
                          fill={glassTheme.strokeColor}
                          stroke={isLast ? glassTheme.surfaceColor : 'none'}
                          strokeWidth={isLast ? 1.6 : 0}
                        />
                      );
                    }}
                    activeDot={{ r: 5, fill: glassTheme.strokeColor }}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="energy"
                    name="Energy (1-5)"
                    stroke={glassTheme.secondaryColor}
                    strokeWidth={2.4}
                    dot={{ r: 2.8, fill: glassTheme.secondaryColor }}
                    activeDot={{ r: 5, fill: glassTheme.secondaryColor }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </GlassRechartsFrame>
          </SurfaceCard>

          <SurfaceCard className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-[var(--vs-accent)]" />
              <h3 className="font-display text-sm font-semibold text-[var(--vs-text)]">
                Social Connection &amp; Trusted Contact Reach-Out
              </h3>
            </div>
            <p className="text-xs text-[var(--vs-text-muted)]">
              Send a voluntary friendly note to an authorized contact or schedule a check-in.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <select
                aria-label="Select trusted contact"
                value={selectedContactId || contactsData?.contacts[0]?.id || ''}
                onChange={(e) => setSelectedContactId(e.target.value)}
                className="vs-input rounded-xl px-3 py-2 text-xs sm:w-44"
              >
                {(contactsData?.contacts ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={supportMessage}
                onChange={(e) => setSupportMessage(e.target.value)}
                placeholder="e.g. Would love a quick call this evening..."
                className="vs-input flex-1 rounded-xl px-3 py-2 text-xs"
              />
              <button
                type="button"
                onClick={() => supportRequestMutation.mutate()}
                disabled={supportRequestMutation.isPending || supportMessage.trim().length < 3}
                className="vs-btn-secondary inline-flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold whitespace-nowrap"
              >
                <HeartHandshake className="h-3.5 w-3.5" />
                Send Request
              </button>
            </div>
          </SurfaceCard>
        </div>
      </div>

      {/* Optional Supportive AI Companion + Check-in Journal History */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <SurfaceCard className="lg:col-span-7 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <MessageCircleHeart className="h-4 w-4 text-[var(--vs-accent)]" />
              <h2 className="font-display text-base font-semibold text-[var(--vs-text)]">
                Optional Supportive Reflection Companion
              </h2>
            </div>
            <span className="inline-flex items-center gap-1 text-[11px] text-[var(--vs-text-muted)]">
              <Sparkles className="h-3 w-3 text-[var(--vs-accent)]" />
              Not a therapist or medical substitute
            </span>
          </div>

          <div className="max-h-[260px] overflow-y-auto space-y-2.5 rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface-muted)] p-3.5">
            {(data?.companionMessages ?? []).map((msg) => (
              <div
                key={msg.id}
                className={`rounded-xl p-3 text-xs leading-relaxed ${
                  msg.role === 'user'
                    ? 'ml-8 bg-[var(--vs-accent)] text-[var(--vs-accent-contrast)]'
                    : msg.crisisGuidanceShown
                      ? 'mr-4 border border-[var(--vs-danger)] bg-[var(--vs-danger-soft)] text-[var(--vs-danger)]'
                      : 'mr-8 border border-[var(--vs-border)] bg-[var(--vs-surface)] text-[var(--vs-text)]'
                }`}
              >
                <p>{msg.text}</p>
                {msg.crisisGuidanceShown && (
                  <p className="mt-2 flex items-center gap-1.5 font-semibold">
                    <PhoneCall className="h-3.5 w-3.5" />
                    Call or text 988 (Suicide &amp; Crisis Lifeline) · Text HOME to 741741
                  </p>
                )}
              </div>
            ))}
          </div>

          {companionError && (
            <p className="flex items-center gap-1.5 rounded-xl border border-[var(--vs-warning)]/30 bg-[var(--vs-warning-soft)] p-3 text-xs text-[var(--vs-warning)]">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              {companionError}
            </p>
          )}

          <form onSubmit={handleCompanionSubmit} className="flex gap-2">
            <input
              type="text"
              value={companionInput}
              onChange={(e) => setCompanionInput(e.target.value)}
              placeholder="Share what is on your mind or ask for a gentle routine prompt..."
              className="vs-input flex-1 rounded-xl px-3.5 py-2 text-xs"
            />
            <button
              type="submit"
              disabled={companionMutation.isPending || companionInput.trim().length < 2}
              className="vs-btn-primary inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold"
            >
              <Send className="h-3.5 w-3.5" />
              {companionMutation.isPending ? 'Thinking...' : 'Reflect'}
            </button>
          </form>
        </SurfaceCard>

        <SurfaceCard className="lg:col-span-5 p-5 space-y-3">
          <h3 className="font-display text-sm font-semibold text-[var(--vs-text)]">
            Recent Journal &amp; Check-In History
          </h3>
          <div className="space-y-2.5 max-h-[320px] overflow-y-auto">
            {checkins.map((c) => (
              <div
                key={c.id}
                className="rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface-muted)] p-3 text-xs space-y-1"
              >
                <div className="flex items-center justify-between font-medium text-[var(--vs-text)]">
                  <span className="capitalize">
                    {c.mood} · Sleep {c.sleepQuality}/5 · Energy {c.energyLevel}/5
                  </span>
                  <span className="font-mono-num text-[11px] text-[var(--vs-text-muted)]">
                    {formatDateTime(c.timestamp)}
                  </span>
                </div>
                {c.journalNote && (
                  <p className="text-[var(--vs-text-secondary)]">{c.journalNote}</p>
                )}
              </div>
            ))}
          </div>
        </SurfaceCard>
      </div>
    </div>
  );
}
