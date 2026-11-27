import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Check, Copy, FileDown, FileText, Mail, Sparkles } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import type { DemoPersonaId } from '../../lib/demoPersonas';
import type {
  AlertRecord,
  ChartAnnotation,
  MetricBaseline,
  MetricKey,
  SymptomLog,
  VitalReading,
} from '../../lib/types';
import {
  buildSevenDayBiometricWindow,
  formatWeeklyReportForSharing,
  type WeeklySummaryReport,
} from '../../lib/weeklySummary';
import { downloadPhysicianReportPdf } from '../../lib/physicianReportPdf';
import { formatDateTime, StateNotice, SurfaceCard } from '../ui/Primitives';

interface WeeklySummaryCardProps {
  personaId: DemoPersonaId | 'live';
  memberName: string;
  deviceName?: string;
  readings: VitalReading[];
  baselines: Record<MetricKey, MetricBaseline> | null;
  alerts: AlertRecord[];
  annotations?: ChartAnnotation[];
  symptoms?: SymptomLog[];
  apiFetch: <T>(url: string, init?: RequestInit) => Promise<T>;
}

export function WeeklySummaryCard({
  personaId,
  memberName,
  deviceName,
  readings,
  baselines,
  alerts,
  annotations = [],
  symptoms = [],
  apiFetch,
}: WeeklySummaryCardProps) {
  const { pushToast } = useToast();
  const [copied, setCopied] = useState(false);
  const [lastPdfFileName, setLastPdfFileName] = useState<string | null>(null);

  const windowStats = buildSevenDayBiometricWindow({
    memberName,
    readings,
    baselines,
    alerts,
    symptoms,
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
    setLastPdfFileName(null);
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

  const handleDownloadPhysicianPdf = () => {
    try {
      const model = downloadPhysicianReportPdf({
        memberName,
        deviceName,
        readings,
        baselines,
        alerts,
        annotations,
        symptoms,
        weeklySummaryReport: report,
      });
      setLastPdfFileName(model.fileName);
      pushToast({
        title: 'Physician PDF report downloaded',
        description: `Saved ${model.fileName} with 7-day metrics, charts, symptoms, and context notes.`,
        variant: 'success',
      });
    } catch (err) {
      pushToast({
        title: 'Could not export PDF report',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    }
  };

  const mailtoHref = report
    ? `mailto:?subject=${encodeURIComponent(report.subjectLine)}&body=${encodeURIComponent(
        formatWeeklyReportForSharing(report)
      )}`
    : '#';

  return (
    <SurfaceCard className="p-6 sm:p-7 space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-[var(--vs-border)] pb-5">
        <div className="space-y-1.5 max-w-2xl">
          <div className="flex items-center gap-2 text-xs font-semibold text-[var(--vs-accent)]">
            <Sparkles className="h-3.5 w-3.5" />
            Caregiver &amp; Doctor Ready Weekly Report
          </div>
          <h2 className="font-display text-lg font-semibold text-[var(--vs-text)]">
            7-Day Biometric Summary for {memberName.split(' ')[0]}
          </h2>
          <p className="text-sm text-[var(--vs-text-secondary)] leading-relaxed">
            Turn the last {windowStats.dayCount} days of heart rate, SpO₂, sleep, and steps into a plain-English update or downloadable PDF with charts for your doctor.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            data-testid="share-report-pdf-btn"
            onClick={handleDownloadPhysicianPdf}
            disabled={windowStats.dayCount === 0}
            className="vs-btn-secondary inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold whitespace-nowrap disabled:opacity-60"
          >
            <FileDown className="h-3.5 w-3.5 text-[var(--vs-accent)]" />
            Share Report (PDF)
          </button>

          <button
            type="button"
            data-testid="generate-weekly-summary-btn"
            onClick={() => summaryMutation.mutate()}
            disabled={summaryMutation.isPending || windowStats.dayCount === 0}
            className="vs-btn-primary inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold whitespace-nowrap disabled:opacity-60"
          >
            <FileText className="h-3.5 w-3.5" />
            {summaryMutation.isPending ? 'Generating Weekly Summary...' : 'Generate Weekly Summary'}
          </button>
        </div>
      </div>

      {/* Compact 7-Day Window Snapshot */}
      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4 text-xs">
        <div className="rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface-muted)] px-4 py-3">
          <p className="text-[var(--vs-text-muted)]">7-Day Heart Rate</p>
          <p className="mt-1 font-mono-num text-sm font-semibold text-[var(--vs-text)]">
            {windowStats.heartRate.avg !== null ? `${windowStats.heartRate.avg} bpm` : '—'}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface-muted)] px-4 py-3">
          <p className="text-[var(--vs-text-muted)]">7-Day SpO₂</p>
          <p className="mt-1 font-mono-num text-sm font-semibold text-[var(--vs-text)]">
            {windowStats.spo2.avg !== null ? `${windowStats.spo2.avg}%` : '—'}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface-muted)] px-4 py-3">
          <p className="text-[var(--vs-text-muted)]">7-Day Sleep Avg</p>
          <p className="mt-1 font-mono-num text-sm font-semibold text-[var(--vs-text)]">
            {windowStats.sleepHours.avg !== null ? `${windowStats.sleepHours.avg} hrs` : '—'}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface-muted)] px-4 py-3">
          <p className="text-[var(--vs-text-muted)]">7-Day Steps Avg</p>
          <p className="mt-1 font-mono-num text-sm font-semibold text-[var(--vs-text)]">
            {windowStats.steps.avg !== null ? windowStats.steps.avg.toLocaleString() : '—'}
          </p>
        </div>
      </div>

      {/* Logged Feelings Included Indicator */}
      <div
        data-testid="weekly-summary-symptom-count"
        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--vs-border)] bg-[var(--vs-bg-subtle)] px-4 py-2.5 text-xs text-[var(--vs-text-secondary)]"
      >
        <span>
          Included in weekly &amp; PDF reports:{' '}
          <strong className="font-mono-num text-[var(--vs-text)]">
            {windowStats.loggedSymptoms.length} logged symptom(s)
          </strong>{' '}
          and{' '}
          <strong className="font-mono-num text-[var(--vs-text)]">
            {annotations.length} chart note(s)
          </strong>
        </span>
        {windowStats.loggedSymptoms.length > 0 && (
          <span className="font-mono-num text-[11px] text-[var(--vs-text-muted)] truncate max-w-md">
            Latest: {windowStats.loggedSymptoms[0].symptom} ({windowStats.loggedSymptoms[0].severity}/5)
          </span>
        )}
      </div>

      {lastPdfFileName && (
        <div
          data-testid="pdf-download-confirmation"
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--vs-success)]/35 bg-[var(--vs-success-soft)] px-4 py-2.5 text-xs text-[var(--vs-text)]"
        >
          <span className="inline-flex items-center gap-2 font-medium">
            <Check className="h-3.5 w-3.5 text-[var(--vs-success)]" />
            Printable doctor summary downloaded ({lastPdfFileName}) — includes 7-day table, trend charts, {windowStats.loggedSymptoms.length} symptom log(s), and {annotations.length} context note(s).
          </span>
          <button
            type="button"
            onClick={handleDownloadPhysicianPdf}
            className="font-semibold text-[var(--vs-accent)] hover:underline"
          >
            Download Again
          </button>
        </div>
      )}

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
          className="rounded-2xl border border-[var(--vs-border-strong)] bg-[var(--vs-surface-muted)] p-5 space-y-4"
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
                onClick={handleDownloadPhysicianPdf}
                className="vs-btn-secondary inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap"
              >
                <FileDown className="h-3.5 w-3.5 text-[var(--vs-accent)]" />
                Export PDF with Summary
              </button>
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

          {(report.loggedSymptoms?.length ?? 0) > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 space-y-1.5">
              <p className="text-xs font-semibold text-amber-950">
                Logged Physical Feelings Included ({report.loggedSymptoms?.length})
              </p>
              <ul className="space-y-1 text-xs text-amber-900">
                {report.loggedSymptoms?.map((sym, idx) => (
                  <li key={`${sym.dateKey}-${idx}`} className="font-mono-num">
                    {sym.dateKey}: {sym.symptom} ({sym.severity}/5)
                    {sym.activityContext ? ` · ${sym.activityContext}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-xl border border-[var(--vs-border)] bg-[var(--vs-accent-soft)]/50 p-3.5 text-xs text-[var(--vs-text)]">
            <span className="font-semibold">Caregiver check-in note:</span>{' '}
            {report.suggestedCaregiverNote}
          </div>

          <p className="text-[11px] text-[var(--vs-text-muted)]">{report.disclaimer}</p>
        </div>
      )}
    </SurfaceCard>
  );
}
