import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  AlertCircle,
  ArrowRight,
  Clock,
  Eye,
  FileBarChart2,
  GitBranch,
  MessageCircle,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import type {
  AIInsight,
  InsightChatMessage,
  TimelineEvent,
  UnifiedPredictiveObservation,
} from '../lib/types';
import {
  DashboardSkeleton,
  formatDateTime,
  PageHeader,
  SourceAttribution,
  StateNotice,
  SurfaceCard,
} from '../components/ui/Primitives';

interface InsightsResponse {
  restrictedByConsent: boolean;
  insights: AIInsight[];
  timelineEvents: TimelineEvent[];
}

interface UnifiedResponse {
  restrictedByConsent: boolean;
  observations: UnifiedPredictiveObservation[];
}

const STARTER_QUESTIONS = [
  'Why did I get this alert?',
  'What is my normal heart rate?',
  'How were my sleep and steps recently?',
  'What should I do next?',
];

export function InsightsPage() {
  const { user, apiFetch } = useAuth();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<InsightChatMessage[]>([]);
  const [chatError, setChatError] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery<InsightsResponse>({
    queryKey: ['insights'],
    queryFn: () => apiFetch<InsightsResponse>('/api/insights'),
  });

  const unifiedQuery = useQuery<UnifiedResponse>({
    queryKey: ['unified-intelligence'],
    queryFn: () => apiFetch<UnifiedResponse>('/api/intelligence/unified'),
  });

  const explainMutation = useMutation({
    mutationFn: (insightId: string) =>
      apiFetch<{ insight: AIInsight }>(`/api/insights/${insightId}/explain`, {
        method: 'POST',
      }),
    onMutate: (insightId) => {
      setGeneratingId(insightId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['insights'] });
      queryClient.invalidateQueries({ queryKey: ['workspace-overview'] });
      queryClient.invalidateQueries({ queryKey: ['unified-intelligence'] });
      pushToast({
        title: 'AI explanation updated',
        description: 'Plain-English summary refreshed from your recorded wearable readings.',
        variant: 'success',
      });
    },
    onError: (err) => {
      queryClient.invalidateQueries({ queryKey: ['insights'] });
      pushToast({
        title: 'Could not update AI explanation',
        description: err instanceof Error ? err.message : 'Unable to generate explanation.',
        variant: 'error',
      });
    },
    onSettled: () => {
      setGeneratingId(null);
    },
  });

  const chatMutation = useMutation({
    mutationFn: (question: string) =>
      apiFetch<{ reply: string; disclaimer: string }>('/api/insights/chat', {
        method: 'POST',
        body: JSON.stringify({
          question,
          history: chatMessages.slice(-6),
        }),
      }),
    onMutate: (question) => {
      setChatError(null);
      setChatMessages((prev) => [
        ...prev,
        {
          id: `user-${Date.now()}`,
          role: 'user',
          text: question,
          timestamp: new Date().toISOString(),
        },
      ]);
      setChatInput('');
    },
    onSuccess: (res) => {
      setChatMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          text: res.reply,
          timestamp: new Date().toISOString(),
        },
      ]);
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : 'Unable to answer right now.';
      setChatError(msg);
    },
  });

  const handleAskQuestion = (questionText: string) => {
    const trimmed = questionText.trim();
    if (!trimmed || chatMutation.isPending) return;
    chatMutation.mutate(trimmed);
  };

  if (isLoading) return <DashboardSkeleton />;

  if (error || !data) {
    return (
      <StateNotice
        variant="error"
        title="Unable to load AI Insights"
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
          kicker="Plain-English Explanations"
          title="AI Insights"
        />
        <StateNotice
          variant="warning"
          title="AI insights restricted by member consent"
          message="The monitored member has not enabled caregiver access to AI-generated pattern explanations."
        />
      </div>
    );
  }

  const unifiedObservations = unifiedQuery.data?.observations ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Explainable AI"
        title="AI Insights &amp; Health Q&amp;A"
        description="See clearly what changed in your wearable data, why an alert appeared, and ask plain-English questions about your own numbers."
      />

      {/* Interactive Grounded Q&A Assistant */}
      <SurfaceCard className="p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--vs-border)] pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-semibold text-[var(--vs-accent)]">
              <MessageCircle className="h-4 w-4" />
              Ask About Your Health Data
            </div>
            <h2 className="font-display text-lg font-semibold text-[var(--vs-text)]">
              Get Plain-English Answers From Your Stored Wearable Readings
            </h2>
            <p className="text-xs text-[var(--vs-text-secondary)]">
              Answers are strictly grounded in your recorded heart rate, SpO₂, sleep, daily steps, and personal baseline. Informational only, not a medical diagnosis.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {STARTER_QUESTIONS.map((q) => (
            <button
              key={q}
              type="button"
              disabled={chatMutation.isPending}
              onClick={() => handleAskQuestion(q)}
              className="rounded-xl border border-[var(--vs-border)] bg-[var(--vs-bg-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--vs-text-secondary)] hover:border-[var(--vs-border-strong)] hover:text-[var(--vs-text)] transition-colors"
            >
              {q}
            </button>
          ))}
        </div>

        {chatMessages.length > 0 && (
          <div className="max-h-[300px] overflow-y-auto space-y-3 rounded-xl border border-[var(--vs-border)] bg-[var(--vs-bg-subtle)] p-4">
            {chatMessages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-xl px-4 py-2.5 text-xs leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-[var(--vs-accent)] text-[var(--vs-accent-contrast)]'
                      : 'border border-[var(--vs-border)] bg-[var(--vs-surface)] text-[var(--vs-text)]'
                  }`}
                >
                  <p>{msg.text}</p>
                </div>
              </div>
            ))}
            {chatMutation.isPending && (
              <div className="flex justify-start">
                <div className="rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface)] px-4 py-2.5 text-xs text-[var(--vs-text-muted)]">
                  Looking up your wearable readings...
                </div>
              </div>
            )}
          </div>
        )}

        {chatError && (
          <div className="rounded-xl border border-[var(--vs-danger)]/40 bg-[var(--vs-danger-soft)] px-4 py-3 text-xs text-[var(--vs-danger)] flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{chatError}</span>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAskQuestion(chatInput);
          }}
          className="flex flex-col sm:flex-row gap-2.5"
        >
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Ask a question about your heart rate, SpO₂, sleep, steps, or alerts..."
            aria-label="Ask a question about your health data"
            className="vs-input flex-1 rounded-xl px-4 py-2.5 text-sm"
          />
          <button
            type="submit"
            disabled={!chatInput.trim() || chatMutation.isPending}
            className="vs-btn-primary inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-xs font-semibold disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Send className="h-3.5 w-3.5" />
            {chatMutation.isPending ? 'Asking...' : 'Ask Assistant'}
          </button>
        </form>
      </SurfaceCard>

      {/* Cross-Signal Observations */}
      {unifiedObservations.length > 0 && (
        <SurfaceCard className="p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--vs-border)] pb-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-[var(--vs-accent)]">
                <Activity className="h-4 w-4" />
                Pattern Summary
              </div>
              <h2 className="mt-1 font-display text-lg font-semibold text-[var(--vs-text)]">
                What Was Measured vs. Practical Next Steps
              </h2>
              <p className="mt-0.5 text-xs text-[var(--vs-text-secondary)]">
                Connects changes across heart rate, SpO₂, sleep, and daily activity without making medical diagnoses.
              </p>
            </div>
            <span className="font-mono-num text-xs text-[var(--vs-text-muted)]">
              {unifiedObservations.length} active pattern{unifiedObservations.length === 1 ? '' : 's'}
            </span>
          </div>

          <div className="space-y-4">
            {unifiedObservations.map((obs) => (
              <div
                key={obs.id}
                className="rounded-2xl border border-[var(--vs-border)] bg-[var(--vs-bg-subtle)] overflow-hidden"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--vs-border)] bg-[var(--vs-surface)] px-4 py-3">
                  <div>
                    <h3 className="text-sm font-semibold text-[var(--vs-text)]">
                      {obs.title}
                    </h3>
                    <p className="text-[11px] text-[var(--vs-text-muted)]">
                      {obs.confidenceNote}
                    </p>
                  </div>
                  <span className="text-xs font-medium text-[var(--vs-text-secondary)] capitalize">
                    {obs.category.replace('_', ' ')}
                  </span>
                </div>

                <div className="grid grid-cols-1 divide-y divide-[var(--vs-border)] md:grid-cols-3 md:divide-x md:divide-y-0">
                  <div className="p-4 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--vs-text)]">
                      <Eye className="h-3.5 w-3.5 text-[var(--vs-accent)]" />
                      1. What Was Measured
                    </div>
                    <ul className="space-y-1.5 text-xs leading-relaxed text-[var(--vs-text-secondary)]">
                      {obs.measuredObservations.map((m, i) => (
                        <li key={i} className="flex items-start gap-2 font-mono-num">
                          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[var(--vs-accent)]" />
                          <span>{m}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="p-4 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--vs-text)]">
                      <GitBranch className="h-3.5 w-3.5 text-[var(--vs-warning)]" />
                      2. What It Suggests
                    </div>
                    <ul className="space-y-1.5 text-xs leading-relaxed text-[var(--vs-text-secondary)]">
                      {obs.inferredPatterns.map((p, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[var(--vs-warning)]" />
                          <span>{p}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="p-4 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--vs-text)]">
                      <ArrowRight className="h-3.5 w-3.5 text-[var(--vs-success)]" />
                      3. Helpful Next Steps
                    </div>
                    <ul className="space-y-1.5 text-xs leading-relaxed text-[var(--vs-text-secondary)]">
                      {obs.recommendedActions.map((a, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="font-mono-num text-[var(--vs-success)] font-semibold">
                            {i + 1}.
                          </span>
                          <span>{a}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </SurfaceCard>
      )}

      {data.insights.length === 0 ? (
        <StateNotice
          variant="empty"
          title="No unusual multi-day shifts right now"
          message="When VITALSENSE spots a multi-day change compared with your usual wearable pattern, a plain-English explanation appears here."
          action={
            <Link
              to="/app/data-lab"
              className="vs-btn-primary inline-block rounded-lg px-3.5 py-2 text-xs font-medium"
            >
              Manage Data &amp; Scenarios
            </Link>
          }
        />
      ) : (
        <div className="space-y-6">
          {data.insights.map((ins) => {
            const isBusy = generatingId === ins.id;
            return (
              <SurfaceCard key={ins.id} className="overflow-hidden">
                <div className="flex flex-col gap-3 border-b border-[var(--vs-border)] px-6 py-5 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--vs-text-muted)]">
                      <span>{ins.metricLabel}</span>
                      <span aria-hidden="true">·</span>
                      <span>{ins.durationAndTrend}</span>
                      <span aria-hidden="true">·</span>
                      <SourceAttribution source={ins.source} />
                    </div>
                    <h2 className="mt-1.5 font-display text-lg font-semibold text-[var(--vs-text)]">
                      {ins.title}
                    </h2>
                  </div>

                  <div className="flex shrink-0 items-center gap-2.5">
                    <Link
                      to="/app/timeline"
                      className="vs-btn-secondary inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap"
                    >
                      <Clock className="h-3.5 w-3.5 text-[var(--vs-text-muted)]" />
                      Timeline Event
                    </Link>

                    {user?.role === 'member' && (
                      <button
                        type="button"
                        onClick={() => explainMutation.mutate(ins.id)}
                        disabled={isBusy}
                        className="vs-btn-primary inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-medium disabled:opacity-60 whitespace-nowrap"
                      >
                        <RefreshCw
                          className={`h-3.5 w-3.5 ${isBusy ? 'animate-spin' : ''}`}
                        />
                        {isBusy
                          ? 'Updating...'
                          : ins.geminiAnalysis
                            ? 'Refresh Explanation'
                            : 'Generate AI Explanation'}
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 divide-y divide-[var(--vs-border)] lg:grid-cols-12 lg:divide-x lg:divide-y-0">
                  <div className="lg:col-span-5 p-6 space-y-4 bg-[var(--vs-bg-subtle)]">
                    <div className="flex items-center gap-2 text-xs font-semibold text-[var(--vs-text)]">
                      <FileBarChart2 className="h-4 w-4 text-[var(--vs-accent)]" />
                      What Your Wearable Recorded
                    </div>

                    <div>
                      <p className="text-xs text-[var(--vs-text-muted)]">Observed Change</p>
                      <p className="mt-1 text-sm leading-relaxed text-[var(--vs-text)]">
                        {ins.whatChanged}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-[var(--vs-text-muted)]">Compared With Your Usual Range</p>
                      <p className="mt-1 font-mono-num text-xs font-medium text-[var(--vs-text)]">
                        {ins.baselineComparison}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-[var(--vs-text-muted)]">Supporting Readings</p>
                      <ul className="mt-1.5 space-y-1.5">
                        {ins.supportingMeasurements.map((m, idx) => (
                          <li
                            key={idx}
                            className="font-mono-num text-xs text-[var(--vs-text-secondary)] flex items-start gap-2"
                          >
                            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[var(--vs-text-muted)]" />
                            <span>{m}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="lg:col-span-7 p-6 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs font-semibold text-[var(--vs-accent)]">
                        <Sparkles className="h-4 w-4 text-[var(--vs-accent)]" />
                        Plain-English AI Explanation
                      </div>
                      {ins.geminiAnalysis && (
                        <span className="font-mono-num text-[11px] text-[var(--vs-text-muted)]">
                          Updated {formatDateTime(ins.geminiAnalysis.generatedAt)}
                        </span>
                      )}
                    </div>

                    {ins.lastError && (
                      <div className="rounded-lg border border-[var(--vs-danger)]/40 bg-[var(--vs-danger-soft)] px-3.5 py-2.5 text-xs text-[var(--vs-text)] flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-[var(--vs-danger)]" />
                        <span>{ins.lastError}</span>
                      </div>
                    )}

                    {ins.geminiAnalysis ? (
                      <>
                        <p className="text-sm font-medium leading-relaxed text-[var(--vs-text)]">
                          {ins.geminiAnalysis.summary}
                        </p>
                        <p className="text-sm leading-relaxed text-[var(--vs-text-secondary)]">
                          {ins.geminiAnalysis.patternExplanation}
                        </p>

                        <div className="grid grid-cols-1 gap-4 border-t border-[var(--vs-border)] pt-4 sm:grid-cols-2">
                          <div>
                            <p className="text-xs font-semibold text-[var(--vs-text)]">
                              Suggested Next Steps
                            </p>
                            <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-[var(--vs-text-secondary)]">
                              {ins.geminiAnalysis.nonDiagnosticNextSteps.map((step, i) => (
                                <li key={i} className="flex items-start gap-2">
                                  <span className="font-mono-num text-[var(--vs-accent)]">
                                    0{i + 1}.
                                  </span>
                                  <span>{step}</span>
                                </li>
                              ))}
                            </ul>
                          </div>

                          <div>
                            <p className="text-xs font-semibold text-[var(--vs-text)]">
                              Questions to Share With a Doctor
                            </p>
                            <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-[var(--vs-text-secondary)]">
                              {ins.geminiAnalysis.clinicianQuestions.map((q, i) => (
                                <li key={i} className="flex items-start gap-2">
                                  <span className="text-[var(--vs-text-muted)]">•</span>
                                  <span>{q}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>

                        <div className="flex items-start gap-2 border-t border-[var(--vs-border)] pt-3 text-[11px] text-[var(--vs-text-muted)]">
                          <ShieldCheck className="h-3.5 w-3.5 shrink-0 mt-0.5 text-[var(--vs-text-muted)]" />
                          <span>{ins.geminiAnalysis.disclaimer}</span>
                        </div>
                      </>
                    ) : (
                      <div className="py-6 text-sm text-[var(--vs-text-muted)]">
                        Click &ldquo;Generate AI Explanation&rdquo; above to get a plain-English summary of these measurements.
                      </div>
                    )}
                  </div>
                </div>
              </SurfaceCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
