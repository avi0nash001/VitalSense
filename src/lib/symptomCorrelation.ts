import type {
  ChartAnnotation,
  SymptomLog,
  SymptomSeverity,
  VitalReading,
} from './types';
import { toAnnotationDateKey } from './chartAnnotations';

export const SYMPTOM_PRESETS = [
  'Fatigue',
  'Dizziness',
  'Shortness of breath',
  'Headache',
  'Racing pulse',
  'Poor focus',
] as const;

export const SEVERITY_LABELS: Record<SymptomSeverity, string> = {
  1: 'Very mild',
  2: 'Mild',
  3: 'Moderate',
  4: 'Noticeable',
  5: 'Strong',
};

export type CorrelationMetricKey = 'heartRate' | 'spo2' | 'sleepHours' | 'hrv';
export type CorrelationOverlayMode = 'combined' | 'symptoms' | 'steps';

export interface CorrelationMetricMeta {
  key: CorrelationMetricKey;
  label: string;
  shortLabel: string;
  unit: string;
  precision: number;
  color: string;
}

export const CORRELATION_METRICS: Record<CorrelationMetricKey, CorrelationMetricMeta> = {
  heartRate: {
    key: 'heartRate',
    label: 'Resting Heart Rate',
    shortLabel: 'Heart Rate',
    unit: 'bpm',
    precision: 1,
    color: '#4F46E5',
  },
  spo2: {
    key: 'spo2',
    label: 'Blood Oxygen (SpO₂)',
    shortLabel: 'SpO₂',
    unit: '%',
    precision: 1,
    color: '#0D9488',
  },
  sleepHours: {
    key: 'sleepHours',
    label: 'Sleep Duration',
    shortLabel: 'Sleep',
    unit: 'hrs',
    precision: 1,
    color: '#7C3AED',
  },
  hrv: {
    key: 'hrv',
    label: 'Heart Rate Variability',
    shortLabel: 'HRV',
    unit: 'ms',
    precision: 1,
    color: '#2563EB',
  },
};

export interface DualAxisCorrelationPoint {
  dateKey: string;
  label: string;
  timestamp: string;
  metricValue: number | null;
  steps: number | null;
  maxSymptomSeverity: number;
  symptomCount: number;
  symptoms: SymptomLog[];
  annotations: ChartAnnotation[];
  hasContextOverlay: boolean;
}

export interface SymptomCorrelationSummary {
  metricLabel: string;
  unit: string;
  symptomDayCount: number;
  totalSymptomsLogged: number;
  symptomDayAvg: number | null;
  symptomFreeDayAvg: number | null;
  deltaOnSymptomDays: number | null;
  headline: string;
  detail: string;
}

function formatDateLabel(isoOrDateKey: string): string {
  const ms = Date.parse(isoOrDateKey);
  if (Number.isNaN(ms)) return isoOrDateKey.slice(5, 10);
  return new Date(ms).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function roundTo(val: number, precision: number): number {
  const factor = Math.pow(10, precision);
  return Math.round(val * factor) / factor;
}

export function extractReadingMetricValue(
  reading: VitalReading,
  metric: CorrelationMetricKey
): number | null {
  const raw = reading[metric];
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}

export function findNearestBiometricContext(
  readings: VitalReading[],
  dateKey: string
): SymptomLog['biometricContext'] {
  if (readings.length === 0) return undefined;
  const sorted = [...readings].sort(
    (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)
  );
  const exact = sorted.find((r) => toAnnotationDateKey(r.timestamp) === dateKey);
  const target = exact ?? sorted[sorted.length - 1];
  return {
    heartRate:
      typeof target.heartRate === 'number' ? roundTo(target.heartRate, 1) : undefined,
    spo2: typeof target.spo2 === 'number' ? roundTo(target.spo2, 1) : undefined,
    sleepHours:
      typeof target.sleepHours === 'number' ? roundTo(target.sleepHours, 1) : undefined,
    steps: typeof target.steps === 'number' ? Math.round(target.steps) : undefined,
  };
}

export function buildDualAxisCorrelationSeries(params: {
  readings: VitalReading[];
  metric: CorrelationMetricKey;
  symptoms: SymptomLog[];
  annotations: ChartAnnotation[];
}): DualAxisCorrelationPoint[] {
  const sorted = [...params.readings].sort(
    (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)
  );
  const recent = sorted.slice(-21);

  const symptomsByDate = new Map<string, SymptomLog[]>();
  for (const s of params.symptoms) {
    const key = s.dateKey || toAnnotationDateKey(s.timestamp);
    const list = symptomsByDate.get(key) ?? [];
    list.push(s);
    symptomsByDate.set(key, list);
  }

  const annotationsByDate = new Map<string, ChartAnnotation[]>();
  for (const a of params.annotations) {
    const key = a.dateKey || toAnnotationDateKey(a.timestamp);
    const list = annotationsByDate.get(key) ?? [];
    list.push(a);
    annotationsByDate.set(key, list);
  }

  return recent.map((r) => {
    const dateKey = toAnnotationDateKey(r.timestamp);
    const daySymptoms = symptomsByDate.get(dateKey) ?? [];
    const dayAnnotations = annotationsByDate.get(dateKey) ?? [];
    const maxSymptomSeverity =
      daySymptoms.length > 0
        ? Math.max(...daySymptoms.map((s) => s.severity))
        : 0;

    return {
      dateKey,
      label: formatDateLabel(r.timestamp),
      timestamp: r.timestamp,
      metricValue: extractReadingMetricValue(r, params.metric),
      steps:
        typeof r.steps === 'number' && Number.isFinite(r.steps)
          ? Math.round(r.steps)
          : null,
      maxSymptomSeverity,
      symptomCount: daySymptoms.length,
      symptoms: daySymptoms,
      annotations: dayAnnotations,
      hasContextOverlay: daySymptoms.length > 0 || dayAnnotations.length > 0,
    };
  });
}

export function summarizeSymptomBiometricCorrelation(
  points: DualAxisCorrelationPoint[],
  metric: CorrelationMetricKey,
  baselineMean: number | null
): SymptomCorrelationSummary {
  const meta = CORRELATION_METRICS[metric];
  const symptomDays = points.filter(
    (p) => p.symptomCount > 0 && p.metricValue !== null
  );
  const clearDays = points.filter(
    (p) => p.symptomCount === 0 && p.metricValue !== null
  );
  const totalSymptomsLogged = points.reduce((sum, p) => sum + p.symptomCount, 0);

  const avg = (arr: number[]) =>
    arr.length > 0
      ? roundTo(arr.reduce((a, b) => a + b, 0) / arr.length, meta.precision)
      : null;

  const symptomDayAvg = avg(
    symptomDays.map((d) => d.metricValue as number)
  );
  const symptomFreeDayAvg = avg(
    clearDays.map((d) => d.metricValue as number)
  );

  const reference = symptomFreeDayAvg ?? baselineMean;
  const deltaOnSymptomDays =
    symptomDayAvg !== null && reference !== null
      ? roundTo(symptomDayAvg - reference, meta.precision)
      : null;

  if (totalSymptomsLogged === 0 || symptomDayAvg === null) {
    return {
      metricLabel: meta.label,
      unit: meta.unit,
      symptomDayCount: 0,
      totalSymptomsLogged: 0,
      symptomDayAvg: null,
      symptomFreeDayAvg,
      deltaOnSymptomDays: null,
      headline: 'Log how you feel to spot connections with your readings',
      detail: `Use the Symptom Logger beside this chart to record feelings like fatigue or dizziness. VitalSense will compare your ${meta.shortLabel.toLowerCase()} on those days against calm days.`,
    };
  }

  const topSymptoms = Array.from(
    new Set(symptomDays.flatMap((d) => d.symptoms.map((s) => s.symptom.toLowerCase())))
  ).slice(0, 3);
  const symptomPhrase =
    topSymptoms.length > 0 ? topSymptoms.join(', ') : 'logged symptoms';

  let comparisonText = `${symptomDayAvg} ${meta.unit} on days with ${symptomPhrase}`;
  if (deltaOnSymptomDays !== null && reference !== null) {
    const absDelta = Math.abs(deltaOnSymptomDays);
    const directionWord =
      deltaOnSymptomDays > 0.05
        ? 'higher'
        : deltaOnSymptomDays < -0.05
          ? 'lower'
          : 'close to';
    comparisonText =
      directionWord === 'close to'
        ? `${symptomDayAvg} ${meta.unit}, very close to your ${reference} ${meta.unit} calm-day average`
        : `${symptomDayAvg} ${meta.unit} (${absDelta} ${meta.unit} ${directionWord} than your ${reference} ${meta.unit} average on symptom-free days)`;
  }

  return {
    metricLabel: meta.label,
    unit: meta.unit,
    symptomDayCount: symptomDays.length,
    totalSymptomsLogged,
    symptomDayAvg,
    symptomFreeDayAvg,
    deltaOnSymptomDays,
    headline: `${symptomDays.length} day${symptomDays.length === 1 ? '' : 's'} with ${symptomPhrase} overlapped with ${meta.shortLabel.toLowerCase()} shifts`,
    detail: `On days you logged ${symptomPhrase}, ${meta.shortLabel.toLowerCase()} averaged ${comparisonText}. Informational pattern comparison only, not a medical diagnosis.`,
  };
}
