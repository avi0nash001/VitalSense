import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Check, Copy, FileText, Mail, Sparkles } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import type { DemoPersonaId } from '../../lib/demoPersonas';
import type { AlertRecord, MetricBaseline, MetricKey, VitalReading } from '../../lib/types';
import {
  buildSevenDayBiometricWindow,
  formatWeeklyReportForSharing,
  type WeeklySummaryReport,
} from '../../lib/weeklySummary';
import { formatDateTime, StateNotice, SurfaceCard } from '../ui/Primitives';

interface WeeklySummaryCardProps {
  personaId: DemoPersonaId | 'live';
  memberName: string;
  readings: VitalReading[];
  baselines: Record<MetricKey, MetricBaseline> | null;
  alerts: AlertRecord[];
  apiFetch: <T>(url: string, init?: RequestInit) => Promise<T>;
}

export function WeeklySummaryCard({
  personaId,
  memberName,
  readings,
  baselines,
  alerts,
  apiFetch,
}: WeeklySummaryCardProps) {
  const { pushToast } = useToast();
  const [copied, setCopied] = useState(false);

  const windowStats = buildSevenDayBiometricWindow({
    memberName,
    readings,
    baselines,
    alerts,
  });

  const summaryMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ report: WeeklySummaryReport }>('/api/dashboard/weekly-summary', {
        method: 'POST',
        body: JSON.stringify({ personaId }),
      }),
    onSuccess: () => {
      setCopied(false);
      pushToast({
        title: 'Weekly caregiver summary ready',
        description: 'Plain-English 7-day report generated for easy sharing.',
        variant: 'success',
      });
    },
    onError: (err) => {
      pushToast({
        title: 'Could not generate weekly summary',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    },
  });

  const { reset: resetSummary } = summaryMutation;

  useEffect(() => {
    resetSummary();
    setCopied(false);
  }, [personaId, resetSummary]);

  const report = summaryMutation.data?.report ?? null;

  const handleCopy = async () => {
    if (!report) return;
    const text = formatWeeklyReportForSharing(report);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      pushToast({
        title: 'Report copied to clipboard',
        description: 'Ready to paste into an email or caregiver message.',
        variant: 'success',
      });
      setTimeout(() => setCopied(false), 2500);
    } catch {
      pushToast({
        title: 'Clipboard unavailable',
        description: 'Select and copy the summary text directly below.',
        variant: 'info',
      });
    }
  };

  const mailtoHref = report
    ? `mailto:?subject=${encodeURIComponent(report.subjectLine)}&body=${encodeURIComponent(
        formatWeeklyReportForSharing(report)
      )}`
    : '#';

  return (
    <SurfaceCard className="p-5 sm:p-6 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[var(--vs-border)] pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-medium text-[var(--vs-accent)]">
            <Sparkles className="h-3.5 w-3.5" />
            Caregiver-Ready Weekly Report
          </div>
          <h2 className="font-display text-base font-semibold text-[var(--vs-text)]">
            7-Day Biometric Summary for {memberName.split(' ')[0]}
          </h2>
          <p className="text-xs text-[var(--vs-text-secondary)]">
            Synthesizes the last {windowStats.dayCount} days of heart rate, SpO₂, sleep, and daily steps into plain English ready for email or text.
          </p>
        </div>

        <button
          type="button"
          data-testid="generate-weekly-summary-btn"
          onClick={() => summaryMutation.mutate()}
          disabled={summaryMutation.isPending || windowStats.dayCount === 0}
          className="vs-btn-primary inline-flex shrink-0 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold whitespace-nowrap disabled:opacity-60"
        >
          <FileText className="h-3.5 w-3.5" />
          {summaryMutation.isPending ? 'Generating Weekly Summary...' : 'Generate Weekly Summary'}
        </button>
      </div>

      {/* Compact 7-Day Window Snapshot */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs">
        <div className="rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface-muted)] px-3 py-2.5">
          <p className="text-[var(--vs-text-muted)]">7-Day Heart Rate</p>
          <p className="mt-1 font-mono-num text-sm font-semibold text-[var(--vs-text)]">
            {windowStats.heartRate.avg !== null ? `${windowStats.heartRate.avg} bpm` : '—'}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface-muted)] px-3 py-2.5">
          <p className="text-[var(--vs-text-muted)]">7-Day SpO₂</p>
          <p className="mt-1 font-mono-num text-sm font-semibold text-[var(--vs-text)]">
            {windowStats.spo2.avg !== null ? `${windowStats.spo2.avg}%` : '—'}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface-muted)] px-3 py-2.5">
          <p className="text-[var(--vs-text-muted)]">7-Day Sleep Avg</p>
          <p className="mt-1 font-mono-num text-sm font-semibold text-[var(--vs-text)]">
            {windowStats.sleepHours.avg !== null ? `${windowStats.sleepHours.avg} hrs` : '—'}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface-muted)] px-3 py-2.5">
          <p className="text-[var(--vs-text-muted)]">7-Day Steps Avg</p>
          <p className="mt-1 font-mono-num text-sm font-semibold text-[var(--vs-text)]">
            {windowStats.steps.avg !== null ? windowStats.steps.avg.toLocaleString() : '—'}
          </p>
        </div>
      </div>

      {summaryMutation.error && (
        <StateNotice
          variant="warning"
          title="Weekly summary needs live Gemini configuration"
          message={
            summaryMutation.error instanceof Error
              ? summaryMutation.error.message
              : 'Unable to reach Gemini API right now.'
          }
        />
      )}

      {report && (
        <div
          data-testid="weekly-summary-report"
          className="rounded-2xl border border-[var(--vs-border-strong)] bg-[var(--vs-surface-muted)] p-4 sm:p-5 space-y-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--vs-border)] pb-3">
            <div className="space-y-1">
              <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--vs-accent)]">
                Email / Message Draft · {report.periodLabel}
              </p>
              <h3 className="font-display text-sm sm:text-base font-semibold text-[var(--vs-text)]">
                {report.subjectLine}
              </h3>
              <p className="text-[11px] text-[var(--vs-text-muted)]">
                Generated {formatDateTime(report.generatedAt)}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleCopy}
                className="vs-btn-secondary inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-[var(--vs-success)]" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copy for Email / Message
                  </>
                )}
              </button>
              <a
                href={mailtoHref}
                className="vs-btn-secondary inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap"
              >
                <Mail className="h-3.5 w-3.5" />
                Open Email Draft
              </a>
            </div>
          </div>

          <div className="space-y-3 text-sm leading-relaxed text-[var(--vs-text)] whitespace-pre-line">
            {report.messageBody}
          </div>

          {report.keyHighlights.length > 0 && (
            <div className="rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface)] p-3.5 space-y-2">
              <p className="text-xs font-semibold text-[var(--vs-text)]">7-Day Highlights</p>
              <ul className="space-y-1.5 text-xs text-[var(--vs-text-secondary)]">
                {report.keyHighlights.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--vs-accent)]" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-xl border border-[var(--vs-border)] bg-[var(--vs-accent-soft)]/50 p-3.5 text-xs text-[var(--vs-text)]">
            <span className="font-semibold">Suggested caregiver check-in:</span>{' '}
            {report.suggestedCaregiverNote}
          </div>

          <p className="text-[11px] text-[var(--vs-text-muted)]">{report.disclaimer}</p>
        </div>
      )}
    </SurfaceCard>
  );
}
