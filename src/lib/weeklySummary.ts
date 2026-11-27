import type {
  AlertRecord,
  MetricBaseline,
  MetricKey,
  SymptomLog,
  VitalReading,
} from './types';

export interface SevenDayMetricSummary {
  avg: number | null;
  min: number | null;
  max: number | null;
  baselineMean: number | null;
  deltaFromBaseline: number | null;
  readingCount: number;
}

export interface SevenDaySymptomEntry {
  dateKey: string;
  symptom: string;
  severity: number;
  activityContext?: string;
  note?: string;
}

export interface SevenDayBiometricWindow {
  memberName: string;
  startDate: string | null;
  endDate: string | null;
  dayCount: number;
  heartRate: SevenDayMetricSummary;
  spo2: SevenDayMetricSummary;
  sleepHours: SevenDayMetricSummary;
  steps: SevenDayMetricSummary;
  temperature: SevenDayMetricSummary;
  respiratoryRate: SevenDayMetricSummary;
  recentAlerts: {
    title: string;
    evidenceSummary: string;
    status: string;
  }[];
  loggedSymptoms: SevenDaySymptomEntry[];
}

export interface WeeklySummaryReport {
  generatedAt: string;
  model: string;
  periodLabel: string;
  subjectLine: string;
  messageBody: string;
  keyHighlights: string[];
  suggestedCaregiverNote: string;
  disclaimer: string;
  loggedSymptoms?: SevenDaySymptomEntry[];
}

function summarizeSeries(
  values: number[],
  baselineMean: number | null,
  precision = 1
): SevenDayMetricSummary {
  if (values.length === 0) {
    return {
      avg: null,
      min: null,
      max: null,
      baselineMean,
      deltaFromBaseline: null,
      readingCount: 0,
    };
  }
  const factor = Math.pow(10, precision);
  const round = (v: number) => Math.round(v * factor) / factor;
  const sum = values.reduce((acc, v) => acc + v, 0);
  const avg = round(sum / values.length);
  const min = round(Math.min(...values));
  const max = round(Math.max(...values));
  const deltaFromBaseline =
    baselineMean !== null ? round(avg - baselineMean) : null;

  return {
    avg,
    min,
    max,
    baselineMean,
    deltaFromBaseline,
    readingCount: values.length,
  };
}

export function buildSevenDayBiometricWindow(params: {
  memberName: string;
  readings: VitalReading[];
  baselines: Record<MetricKey, MetricBaseline> | null;
  alerts: AlertRecord[];
  symptoms?: SymptomLog[];
}): SevenDayBiometricWindow {
  const sorted = [...params.readings].sort(
    (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)
  );

  let windowReadings: VitalReading[] = [];
  if (sorted.length > 0) {
    const latestMs = Date.parse(sorted[sorted.length - 1].timestamp);
    const sevenDayCutoff = latestMs - 6.5 * 24 * 60 * 60 * 1000;
    const byDateWindow = sorted.filter((r) => Date.parse(r.timestamp) >= sevenDayCutoff);
    windowReadings = byDateWindow.length > 0 ? byDateWindow.slice(-7) : sorted.slice(-7);
  }

  const extract = (picker: (r: VitalReading) => number | undefined): number[] =>
    windowReadings
      .map(picker)
      .filter((val): val is number => typeof val === 'number' && Number.isFinite(val));

  const sleepVals = extract((r) => r.sleepHours);
  const stepVals = extract((r) => r.steps);

  const windowStartKey = windowReadings[0]?.timestamp?.slice(0, 10) ?? null;
  const windowEndKey =
    windowReadings[windowReadings.length - 1]?.timestamp?.slice(0, 10) ?? null;

  const allSymptoms = params.symptoms ?? [];
  const windowSymptoms = allSymptoms.filter((s) => {
    const dk = s.dateKey || s.timestamp.slice(0, 10);
    if (!windowStartKey || !windowEndKey) return true;
    return dk >= windowStartKey && dk <= windowEndKey;
  });
  const selectedSymptoms = (windowSymptoms.length > 0 ? windowSymptoms : allSymptoms).slice(0, 10);

  return {
    memberName: params.memberName,
    startDate: windowReadings[0]?.timestamp ?? null,
    endDate: windowReadings[windowReadings.length - 1]?.timestamp ?? null,
    dayCount: windowReadings.length,
    heartRate: summarizeSeries(
      extract((r) => r.heartRate),
      params.baselines?.heartRate?.mean ?? null,
      1
    ),
    spo2: summarizeSeries(
      extract((r) => r.spo2),
      params.baselines?.spo2?.mean ?? null,
      1
    ),
    sleepHours: summarizeSeries(sleepVals, 7.2, 1),
    steps: summarizeSeries(stepVals, 7200, 0),
    temperature: summarizeSeries(
      extract((r) => r.temperature),
      params.baselines?.temperature?.mean ?? null,
      2
    ),
    respiratoryRate: summarizeSeries(
      extract((r) => r.respiratoryRate),
      params.baselines?.respiratoryRate?.mean ?? null,
      1
    ),
    recentAlerts: params.alerts.slice(0, 3).map((a) => ({
      title: a.title,
      evidenceSummary: a.evidenceSummary,
      status: a.status,
    })),
    loggedSymptoms: selectedSymptoms.map((s) => ({
      dateKey: s.dateKey || s.timestamp.slice(0, 10),
      symptom: s.symptom,
      severity: s.severity,
      activityContext: s.activityContext,
      note: s.note,
    })),
  };
}

export function formatWeeklyReportForSharing(report: WeeklySummaryReport): string {
  const highlightsBlock =
    report.keyHighlights.length > 0
      ? `\n\n7-Day Highlights:\n${report.keyHighlights.map((h) => `• ${h}`).join('\n')}`
      : '';

  const symptomsList = report.loggedSymptoms ?? [];
  const symptomsBlock =
    symptomsList.length > 0
      ? `\n\nLogged Physical Feelings:\n${symptomsList
          .map(
            (s) =>
              `• ${s.dateKey}: ${s.symptom} (intensity ${s.severity}/5)${
                s.activityContext ? ` · ${s.activityContext}` : ''
              }${s.note ? ` — ${s.note}` : ''}`
          )
          .join('\n')}`
      : '';

  return [
    `Subject: ${report.subjectLine}`,
    `Period: ${report.periodLabel}`,
    '',
    report.messageBody.trim(),
    highlightsBlock.trimStart(),
    symptomsBlock.trimStart(),
    '',
    `Caregiver note: ${report.suggestedCaregiverNote.trim()}`,
    '',
    `Note: ${report.disclaimer.trim()}`,
  ]
    .filter((line, idx, arr) => !(line === '' && arr[idx - 1] === ''))
    .join('\n');
}
