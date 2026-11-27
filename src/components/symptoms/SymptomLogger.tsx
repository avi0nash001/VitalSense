import { useEffect, useMemo, useState } from 'react';
import { Check, Plus, Thermometer, Trash2 } from 'lucide-react';
import {
  findNearestBiometricContext,
  SEVERITY_LABELS,
  SYMPTOM_PRESETS,
} from '../../lib/symptomCorrelation';
import { toAnnotationDateKey } from '../../lib/chartAnnotations';
import type {
  SymptomLog,
  SymptomSeverity,
  VitalReading,
} from '../../lib/types';
import { formatShortDate, SurfaceCard } from '../ui/Primitives';

interface SymptomLoggerProps {
  readings: VitalReading[];
  symptoms: SymptomLog[];
  selectedDateKey?: string;
  readOnly?: boolean;
  isSaving?: boolean;
  compact?: boolean;
  onAddSymptom: (payload: {
    symptom: string;
    severity: SymptomSeverity;
    timestamp: string;
    dateKey: string;
    activityContext?: string;
    note?: string;
  }) => Promise<void>;
  onDeleteSymptom: (id: string) => Promise<void>;
}

export function SymptomLogger({
  readings,
  symptoms,
  selectedDateKey,
  readOnly = false,
  isSaving = false,
  compact = false,
  onAddSymptom,
  onDeleteSymptom,
}: SymptomLoggerProps) {
  const dayOptions = useMemo(() => {
    const sorted = [...readings].sort(
      (a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)
    );
    const seen = new Set<string>();
    const list: { dateKey: string; timestamp: string; label: string }[] = [];
    for (const r of sorted.slice(0, 21)) {
      const dk = toAnnotationDateKey(r.timestamp);
      if (!seen.has(dk)) {
        seen.add(dk);
        list.push({
          dateKey: dk,
          timestamp: r.timestamp,
          label: formatShortDate(r.timestamp),
        });
      }
    }
    return list;
  }, [readings]);

  const defaultDateKey = dayOptions[0]?.dateKey ?? new Date().toISOString().slice(0, 10);

  const [symptomText, setSymptomText] = useState<string>('Dizziness');
  const [severity, setSeverity] = useState<SymptomSeverity>(3);
  const [dateKey, setDateKey] = useState<string>(selectedDateKey || defaultDateKey);
  const [activityContext, setActivityContext] = useState<string>('');
  const [note, setNote] = useState<string>('');

  useEffect(() => {
    if (selectedDateKey) {
      setDateKey(selectedDateKey);
    }
  }, [selectedDateKey]);

  useEffect(() => {
    if (!dateKey && defaultDateKey) {
      setDateKey(defaultDateKey);
    }
  }, [dateKey, defaultDateKey]);

  const matchedBiometrics = useMemo(
    () => findNearestBiometricContext(readings, dateKey || defaultDateKey),
    [dateKey, defaultDateKey, readings]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = symptomText.trim();
    if (!trimmed || readOnly || isSaving) return;

    const chosenOption = dayOptions.find((o) => o.dateKey === dateKey);
    const timestamp =
      chosenOption?.timestamp ?? `${dateKey || defaultDateKey}T12:00:00.000Z`;

    await onAddSymptom({
      symptom: trimmed,
      severity,
      timestamp,
      dateKey: dateKey || defaultDateKey,
      activityContext: activityContext.trim() || undefined,
      note: note.trim() || undefined,
    });

    setActivityContext('');
    setNote('');
  };

  return (
    <SurfaceCard
      data-testid="symptom-logger-card"
      className={`${compact ? 'p-5' : 'p-6'} space-y-4`}
    >
      <div className="border-b border-[var(--vs-border)] pb-3.5 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--vs-accent)]">
            <Thermometer className="h-4 w-4" />
            Symptom Logger
          </span>
          <span className="font-mono-num text-[11px] text-[var(--vs-text-muted)]">
            {symptoms.length} logged
          </span>
        </div>
        <h2 className="font-display text-base sm:text-lg font-semibold text-[var(--vs-text)]">
          Log Physical Feelings With Your Readings
        </h2>
        <p className="text-xs text-[var(--vs-text-secondary)]">
          Quickly record feelings like dizziness or fatigue. They appear on your Insights correlation chart and inside weekly reports.
        </p>
      </div>

      {!readOnly ? (
        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* Quick-tap Preset Chips */}
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-[var(--vs-text-secondary)]">
              How are you feeling?
            </span>
            <div className="flex flex-wrap gap-1.5">
              {SYMPTOM_PRESETS.map((preset) => {
                const selected =
                  symptomText.trim().toLowerCase() === preset.toLowerCase();
                return (
                  <button
                    key={preset}
                    type="button"
                    data-testid={`symptom-preset-${preset.toLowerCase().replace(/\s+/g, '-')}`}
                    onClick={() => setSymptomText(preset)}
                    className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      selected
                        ? 'border-[var(--vs-accent)] bg-[var(--vs-accent-soft)] text-[var(--vs-accent-soft-text)]'
                        : 'border-[var(--vs-border)] bg-[var(--vs-surface-muted)] text-[var(--vs-text-secondary)] hover:text-[var(--vs-text)]'
                    }`}
                  >
                    {selected && <Check className="h-3 w-3" />}
                    {preset}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Symptom + Date Selector */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-[var(--vs-text-secondary)]">
                Feeling or symptom
              </span>
              <input
                type="text"
                required
                minLength={2}
                maxLength={80}
                data-testid="symptom-custom-input"
                value={symptomText}
                onChange={(e) => setSymptomText(e.target.value)}
                placeholder="Dizziness, Fatigue..."
                className="vs-input w-full rounded-xl px-3 py-2 text-xs"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-[var(--vs-text-secondary)]">
                Reading day
              </span>
              <select
                data-testid="symptom-date-select"
                value={dateKey}
                onChange={(e) => setDateKey(e.target.value)}
                className="vs-input w-full rounded-xl px-3 py-2 text-xs"
              >
                {dayOptions.length > 0 ? (
                  dayOptions.map((opt) => (
                    <option key={opt.dateKey} value={opt.dateKey}>
                      {opt.label} ({opt.dateKey})
                    </option>
                  ))
                ) : (
                  <option value={defaultDateKey}>{defaultDateKey}</option>
                )}
              </select>
            </label>
          </div>

          {/* Intensity Scale (1-5) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-[var(--vs-text-secondary)]">
                Intensity
              </span>
              <span className="font-mono-num font-semibold text-[var(--vs-text)]">
                {severity}/5 · {SEVERITY_LABELS[severity]}
              </span>
            </div>
            <div className="grid grid-cols-5 gap-1.5" role="group" aria-label="Symptom intensity">
              {([1, 2, 3, 4, 5] as SymptomSeverity[]).map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  data-testid={`symptom-severity-${lvl}`}
                  aria-pressed={severity === lvl}
                  onClick={() => setSeverity(lvl)}
                  className={`rounded-lg border py-1.5 font-mono-num text-xs font-semibold transition-colors ${
                    severity === lvl
                      ? 'border-amber-500 bg-amber-100 text-amber-950'
                      : 'border-[var(--vs-border)] bg-[var(--vs-surface-muted)] text-[var(--vs-text-secondary)] hover:text-[var(--vs-text)]'
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>
          </div>

          {/* Activity Context & Optional Note */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-[var(--vs-text-secondary)]">
                Activity context (optional)
              </span>
              <input
                type="text"
                maxLength={120}
                data-testid="symptom-activity-input"
                value={activityContext}
                onChange={(e) => setActivityContext(e.target.value)}
                placeholder="After stairs, resting..."
                className="vs-input w-full rounded-xl px-3 py-2 text-xs"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-[var(--vs-text-secondary)]">
                Brief note (optional)
              </span>
              <input
                type="text"
                maxLength={240}
                data-testid="symptom-note-input"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Settled after resting..."
                className="vs-input w-full rounded-xl px-3 py-2 text-xs"
              />
            </label>
          </div>

          {/* Matched Biometric Snapshot Preview + Submit */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface-muted)] px-3.5 py-2.5">
            <div className="font-mono-num text-[11px] text-[var(--vs-text-secondary)]">
              <span className="text-[var(--vs-text-muted)]">Paired readings: </span>
              {matchedBiometrics?.heartRate ?? '—'} bpm · {matchedBiometrics?.spo2 ?? '—'}% SpO₂ ·{' '}
              {matchedBiometrics?.sleepHours ?? '—'}h sleep
            </div>

            <button
              type="submit"
              data-testid="log-symptom-submit-btn"
              disabled={!symptomText.trim() || isSaving}
              className="vs-btn-primary inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold disabled:opacity-50 whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5" />
              {isSaving ? 'Saving...' : 'Log Feeling'}
            </button>
          </div>
        </form>
      ) : (
        <p className="rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface-muted)] px-3.5 py-2.5 text-xs text-[var(--vs-text-muted)]">
          Caregiver view shows feelings logged by the member.
        </p>
      )}

      {/* Logged Entries List */}
      <div className="space-y-2 pt-1">
        <p className="text-xs font-semibold text-[var(--vs-text)]">
          Recent Logged Feelings ({symptoms.length})
        </p>

        {symptoms.length === 0 ? (
          <p className="rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface-muted)] px-3.5 py-3 text-xs text-[var(--vs-text-muted)]">
            No feelings logged yet. Tap a feeling above to pair it with your wearable data.
          </p>
        ) : (
          <div
            data-testid="symptom-log-list"
            className="max-h-[260px] overflow-y-auto space-y-2 pr-0.5"
          >
            {symptoms.map((item) => (
              <div
                key={item.id}
                data-testid="symptom-log-item"
                className="flex items-start justify-between gap-3 rounded-xl border border-[var(--vs-border)] bg-[var(--vs-bg-subtle)] px-3.5 py-2.5"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-semibold text-[var(--vs-text)]">
                      {item.symptom}
                    </span>
                    <span className="font-mono-num rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-900">
                      {item.severity}/5
                    </span>
                    <span className="font-mono-num text-[11px] text-[var(--vs-text-muted)]">
                      {item.dateKey}
                    </span>
                  </div>

                  {item.biometricContext && (
                    <p className="font-mono-num text-[11px] text-[var(--vs-text-secondary)]">
                      {item.biometricContext.heartRate ?? '—'} bpm ·{' '}
                      {item.biometricContext.spo2 ?? '—'}% SpO₂
                      {item.biometricContext.sleepHours != null
                        ? ` · ${item.biometricContext.sleepHours}h sleep`
                        : ''}
                    </p>
                  )}

                  {(item.activityContext || item.note) && (
                    <p className="text-xs text-[var(--vs-text-secondary)]">
                      {item.activityContext}
                      {item.activityContext && item.note ? ' — ' : ''}
                      {item.note}
                    </p>
                  )}
                </div>

                {!readOnly && (
                  <button
                    type="button"
                    aria-label={`Remove ${item.symptom} log`}
                    onClick={() => onDeleteSymptom(item.id)}
                    className="shrink-0 rounded-lg p-1.5 text-[var(--vs-text-muted)] hover:bg-[var(--vs-danger-soft)] hover:text-[var(--vs-danger)] transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </SurfaceCard>
  );
}
