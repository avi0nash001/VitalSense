import type { ChartAnnotation, ChartAnnotationCategory, MetricKey } from './types';

export interface AnnotationPreset {
  label: string;
  category: ChartAnnotationCategory;
}

export const ANNOTATION_PRESETS: AnnotationPreset[] = [
  { label: 'Exercise', category: 'exercise' },
  { label: 'Stressful meeting', category: 'stress' },
  { label: 'Poor sleep', category: 'sleep' },
  { label: 'Medication change', category: 'medication' },
  { label: 'Recovery rest', category: 'recovery' },
];

export const ANNOTATION_CATEGORY_LABELS: Record<ChartAnnotationCategory, string> = {
  exercise: 'Exercise',
  stress: 'Stress',
  sleep: 'Sleep',
  medication: 'Medication',
  recovery: 'Recovery',
  other: 'Context note',
};

export function toAnnotationDateKey(timestamp: string): string {
  if (!timestamp) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(timestamp)) {
    return timestamp.slice(0, 10);
  }
  const ms = Date.parse(timestamp);
  if (Number.isNaN(ms)) return timestamp.trim().toLowerCase();
  return new Date(ms).toISOString().slice(0, 10);
}

export function inferAnnotationCategory(note: string): ChartAnnotationCategory {
  const lower = note.toLowerCase();
  if (/\b(run|running|walk|walking|gym|exercise|exercising|workout|cycling|yoga)\b/.test(lower)) return 'exercise';
  if (/\b(stress|stressful|meeting|work|deadline|travel|anxious|busy)\b/.test(lower)) return 'stress';
  if (/\b(sleep|sleeping|insomnia|nap|late night|woke|tired)\b/.test(lower)) return 'sleep';
  if (/\b(meds?|medication|pill|dose|caffeine|coffee|vitamin)\b/.test(lower)) return 'medication';
  if (/\b(rest|resting|recover|recovery|hydrate|hydration|calm)\b/.test(lower)) return 'recovery';
  return 'other';
}

export function matchAnnotationsForPoint(params: {
  annotations: ChartAnnotation[];
  timestamp?: string;
  metric?: MetricKey;
}): ChartAnnotation[] {
  const { annotations, timestamp, metric } = params;
  if (!timestamp || annotations.length === 0) return [];
  const targetDateKey = toAnnotationDateKey(timestamp);

  return annotations.filter((ann) => {
    const metricMatches = !metric || ann.metric === 'all' || ann.metric === metric;
    if (!metricMatches) return false;
    if (ann.timestamp === timestamp) return true;
    return targetDateKey.length > 0 && ann.dateKey === targetDateKey;
  });
}

export function formatAnnotationSummary(annotations: ChartAnnotation[]): string | undefined {
  if (annotations.length === 0) return undefined;
  return annotations.map((a) => a.note).join(' · ');
}
