import type {
  BaselineConfidence,
  LatestMetricSnapshot,
  MetricBaseline,
  MetricKey,
  VitalReading,
} from './types.ts';

export interface MetricDefinition {
  key: MetricKey;
  label: string;
  shortLabel: string;
  unit: string;
  precision: number;
  plausibleMin: number;
  plausibleMax: number;
  driftThresholdAbs: number;
  minFloorStd: number;
  description: string;
}

export const METRIC_DEFINITIONS: Record<MetricKey, MetricDefinition> = {
  heartRate: {
    key: 'heartRate',
    label: 'Resting Heart Rate',
    shortLabel: 'Heart Rate',
    unit: 'bpm',
    precision: 1,
    plausibleMin: 30,
    plausibleMax: 220,
    driftThresholdAbs: 3.5,
    minFloorStd: 1.8,
    description: 'Overnight resting heart rate recorded while you sleep.',
  },
  spo2: {
    key: 'spo2',
    label: 'Blood Oxygen (SpO2)',
    shortLabel: 'SpO2',
    unit: '%',
    precision: 1,
    plausibleMin: 70,
    plausibleMax: 100,
    driftThresholdAbs: 1.2,
    minFloorStd: 0.6,
    description: 'Blood oxygen level measured while resting quietly.',
  },
  temperature: {
    key: 'temperature',
    label: 'Skin Temperature',
    shortLabel: 'Temperature',
    unit: '°C',
    precision: 2,
    plausibleMin: 33.0,
    plausibleMax: 42.0,
    driftThresholdAbs: 0.35,
    minFloorStd: 0.16,
    description: 'Overnight skin temperature compared against your usual level.',
  },
  respiratoryRate: {
    key: 'respiratoryRate',
    label: 'Breathing Rate',
    shortLabel: 'Breathing',
    unit: 'br/min',
    precision: 1,
    plausibleMin: 6,
    plausibleMax: 45,
    driftThresholdAbs: 1.4,
    minFloorStd: 0.7,
    description: 'Average breaths per minute while sleeping.',
  },
  hrv: {
    key: 'hrv',
    label: 'Heart Rate Variability',
    shortLabel: 'HRV (Recovery)',
    unit: 'ms',
    precision: 1,
    plausibleMin: 5,
    plausibleMax: 250,
    driftThresholdAbs: 6.0,
    minFloorStd: 3.5,
    description: 'Natural beat-to-beat recovery variation during rest.',
  },
};

export const ALL_METRIC_KEYS: MetricKey[] = [
  'heartRate',
  'spo2',
  'temperature',
  'respiratoryRate',
  'hrv',
];

function roundTo(value: number, precision: number): number {
  const factor = Math.pow(10, precision);
  return Math.round(value * factor) / factor;
}

export function sortReadingsChronologically(readings: VitalReading[]): VitalReading[] {
  return [...readings].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
}

export function computeBaselines(
  readings: VitalReading[],
  targetDays = 14
): Record<MetricKey, MetricBaseline> {
  const sorted = sortReadingsChronologically(readings);
  const result = {} as Record<MetricKey, MetricBaseline>;

  for (const key of ALL_METRIC_KEYS) {
    const def = METRIC_DEFINITIONS[key];
    const entries = sorted
      .filter((r) => typeof r[key] === 'number' && Number.isFinite(r[key]))
      .map((r) => ({
        value: r[key] as number,
        timestamp: r.timestamp,
        dayKey: r.timestamp.slice(0, 10),
      }));

    const readingCount = entries.length;
    const uniqueDays = new Set(entries.map((e) => e.dayKey)).size;
    const progressPct = Math.min(100, Math.round((uniqueDays / targetDays) * 100));

    let confidenceStatus: BaselineConfidence = 'insufficient';
    if (readingCount >= 7 && uniqueDays >= 5) {
      confidenceStatus = uniqueDays >= targetDays ? 'established' : 'learning';
    }

    if (readingCount === 0) {
      result[key] = {
        metric: key,
        label: def.label,
        unit: def.unit,
        mean: null,
        stdDev: null,
        min: null,
        max: null,
        readingCount: 0,
        coverageDays: 0,
        targetDays,
        progressPct: 0,
        confidenceStatus: 'insufficient',
        lastUpdated: null,
      };
      continue;
    }

    const values = entries.map((e) => e.value);
    const mean = values.reduce((acc, v) => acc + v, 0) / values.length;
    const variance =
      values.length > 1
        ? values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (values.length - 1)
        : 0;
    const stdDev = Math.sqrt(variance);

    result[key] = {
      metric: key,
      label: def.label,
      unit: def.unit,
      mean: roundTo(mean, def.precision),
      stdDev: roundTo(stdDev, def.precision),
      min: roundTo(Math.min(...values), def.precision),
      max: roundTo(Math.max(...values), def.precision),
      readingCount,
      coverageDays: uniqueDays,
      targetDays,
      progressPct,
      confidenceStatus,
      lastUpdated: entries[entries.length - 1].timestamp,
    };
  }

  return result;
}

export function computeOverallBaselineSummary(baselines: Record<MetricKey, MetricBaseline>) {
  const list = ALL_METRIC_KEYS.map((k) => baselines[k]);
  const avgProgress = Math.round(
    list.reduce((acc, item) => acc + item.progressPct, 0) / list.length
  );
  const establishedCount = list.filter((b) => b.confidenceStatus === 'established').length;
  const learningCount = list.filter((b) => b.confidenceStatus === 'learning').length;
  const maxCoverageDays = Math.max(...list.map((b) => b.coverageDays));
  const totalReadings = Math.max(...list.map((b) => b.readingCount));

  let statusLabel = 'Insufficient data';
  if (establishedCount === list.length) {
    statusLabel = 'Personal baseline established';
  } else if (establishedCount > 0 || learningCount > 0) {
    statusLabel = 'Learning personal baseline';
  }

  return {
    overallPct: avgProgress,
    statusLabel,
    establishedCount,
    learningCount,
    totalMetrics: list.length,
    coverageDaysMax: maxCoverageDays,
    totalReadings,
  };
}

export function assessLatestMetrics(
  readings: VitalReading[],
  baselines: Record<MetricKey, MetricBaseline>
): LatestMetricSnapshot[] {
  const sorted = sortReadingsChronologically(readings);

  return ALL_METRIC_KEYS.map((key) => {
    const def = METRIC_DEFINITIONS[key];
    const baseline = baselines[key];
    const matching = sorted.filter(
      (r) => typeof r[key] === 'number' && Number.isFinite(r[key])
    );

    if (matching.length === 0) {
      return {
        metric: key,
        label: def.label,
        unit: def.unit,
        latestValue: null,
        latestTimestamp: null,
        baselineMean: baseline.mean,
        deltaFromBaseline: null,
        deltaPct: null,
        trendStatus: 'no_data',
        trendSummary: 'No readings recorded yet',
        qualityScore: null,
        qualityLabel: 'Unavailable',
        source: null,
      };
    }

    const latest = matching[matching.length - 1];
    const latestValue = roundTo(latest[key] as number, def.precision);
    const qualityScore = Math.round(latest.qualityScore);
    const qualityLabel: LatestMetricSnapshot['qualityLabel'] =
      qualityScore >= 85 ? 'High' : qualityScore >= 65 ? 'Moderate' : 'Low';

    // Reference baseline computed from earlier points when enough history exists
    const priorWindow = matching.slice(0, Math.max(0, matching.length - 4));
    const refMean =
      priorWindow.length >= 7
        ? priorWindow.reduce((sum, r) => sum + (r[key] as number), 0) / priorWindow.length
        : baseline.mean;

    if (baseline.confidenceStatus === 'insufficient' || refMean === null) {
      return {
        metric: key,
        label: def.label,
        unit: def.unit,
        latestValue,
        latestTimestamp: latest.timestamp,
        baselineMean: baseline.mean,
        deltaFromBaseline: null,
        deltaPct: null,
        trendStatus: 'insufficient_baseline',
        trendSummary: `Collecting baseline (${baseline.coverageDays}/${baseline.targetDays} days)`,
        qualityScore,
        qualityLabel,
        source: latest.source,
      };
    }

    const recentSlice = matching.slice(-3);
    const recentAvg =
      recentSlice.reduce((sum, r) => sum + (r[key] as number), 0) / recentSlice.length;
    const delta = roundTo(recentAvg - refMean, def.precision);
    const deltaPct = refMean !== 0 ? roundTo((delta / refMean) * 100, 1) : 0;

    let trendStatus: LatestMetricSnapshot['trendStatus'] = 'within_baseline';
    let trendSummary = `Inside your usual range (${roundTo(refMean, def.precision)} ${def.unit})`;

    if (delta >= def.driftThresholdAbs) {
      trendStatus = 'upward_shift';
      trendSummary = `+${Math.abs(delta)} ${def.unit} higher than your usual average`;
    } else if (delta <= -def.driftThresholdAbs) {
      trendStatus = 'downward_shift';
      trendSummary = `-${Math.abs(delta)} ${def.unit} lower than your usual average`;
    }

    return {
      metric: key,
      label: def.label,
      unit: def.unit,
      latestValue,
      latestTimestamp: latest.timestamp,
      baselineMean: roundTo(refMean, def.precision),
      deltaFromBaseline: delta,
      deltaPct,
      trendStatus,
      trendSummary,
      qualityScore,
      qualityLabel,
      source: latest.source,
    };
  });
}

export interface DetectedDriftCandidate {
  metric: MetricKey;
  metricLabel: string;
  unit: string;
  previousBaseline: number;
  currentObserved: number;
  delta: number;
  deltaText: string;
  zScore: number;
  durationDays: number;
  firstDetectedAt: string;
  lastObservedAt: string;
  sampleCount: number;
  consistencyPct: number;
  dataQualityAvg: number;
  severity: 'low' | 'moderate' | 'high';
  detectionMethod: string;
  progressionPoints: { date: string; observed: number; baseline: number }[];
}

export function detectGradualChanges(
  readings: VitalReading[],
  sensitivity: 'balanced' | 'sensitive' | 'conservative' = 'balanced'
): DetectedDriftCandidate[] {
  const sorted = sortReadingsChronologically(readings);
  const sensitivityMultiplier =
    sensitivity === 'sensitive' ? 0.8 : sensitivity === 'conservative' ? 1.25 : 1.0;

  const candidates: DetectedDriftCandidate[] = [];

  for (const key of ALL_METRIC_KEYS) {
    const def = METRIC_DEFINITIONS[key];
    const series = sorted.filter(
      (r) => typeof r[key] === 'number' && Number.isFinite(r[key]) && r.qualityScore >= 50
    );

    if (series.length < 10) {
      continue;
    }

    const recentWindowSize = Math.min(6, Math.max(4, Math.floor(series.length * 0.28)));
    const baselineSlice = series.slice(0, series.length - recentWindowSize);
    const recentSlice = series.slice(series.length - recentWindowSize);

    if (baselineSlice.length < 6) {
      continue;
    }

    const baseVals = baselineSlice.map((r) => r[key] as number);
    const recentVals = recentSlice.map((r) => r[key] as number);

    const baseMean = baseVals.reduce((a, b) => a + b, 0) / baseVals.length;
    const baseVar =
      baseVals.reduce((a, b) => a + Math.pow(b - baseMean, 2), 0) /
      Math.max(1, baseVals.length - 1);
    const baseStd = Math.max(Math.sqrt(baseVar), def.minFloorStd);

    const recentMean = recentVals.reduce((a, b) => a + b, 0) / recentVals.length;
    const delta = recentMean - baseMean;
    const absDelta = Math.abs(delta);
    const zScore = Math.abs(delta) / baseStd;

    const effectiveThreshold = def.driftThresholdAbs * sensitivityMultiplier;
    if (absDelta < effectiveThreshold || zScore < 1.35 * sensitivityMultiplier) {
      continue;
    }

    const direction = delta > 0 ? 1 : -1;
    const consistentSamples = recentVals.filter((v) =>
      direction > 0 ? v > baseMean : v < baseMean
    ).length;
    const consistencyPct = Math.round((consistentSamples / recentVals.length) * 100);

    if (consistencyPct < 65) {
      continue;
    }

    const firstDate = new Date(recentSlice[0].timestamp).getTime();
    const lastDate = new Date(recentSlice[recentSlice.length - 1].timestamp).getTime();
    const durationDays = Math.max(
      1,
      Math.round((lastDate - firstDate) / (1000 * 60 * 60 * 24)) + 1
    );

    const dataQualityAvg = Math.round(
      recentSlice.reduce((sum, r) => sum + r.qualityScore, 0) / recentSlice.length
    );

    const severity: DetectedDriftCandidate['severity'] =
      zScore >= 2.6 || absDelta >= effectiveThreshold * 1.8
        ? 'high'
        : zScore >= 1.9
          ? 'moderate'
          : 'low';

    const roundedBase = roundTo(baseMean, def.precision);
    const roundedCurrent = roundTo(recentMean, def.precision);
    const roundedDelta = roundTo(delta, def.precision);
    const sign = roundedDelta > 0 ? '+' : '';

    const progressionSource = series.slice(-14);
    const progressionPoints = progressionSource.map((r) => ({
      date: r.timestamp.slice(0, 10),
      observed: roundTo(r[key] as number, def.precision),
      baseline: roundedBase,
    }));

    candidates.push({
      metric: key,
      metricLabel: def.label,
      unit: def.unit,
      previousBaseline: roundedBase,
      currentObserved: roundedCurrent,
      delta: roundedDelta,
      deltaText: `${sign}${roundedDelta} ${def.unit}`,
      zScore: roundTo(zScore, 2),
      durationDays,
      firstDetectedAt: recentSlice[0].timestamp,
      lastObservedAt: recentSlice[recentSlice.length - 1].timestamp,
      sampleCount: recentSlice.length,
      consistencyPct,
      dataQualityAvg,
      severity,
      detectionMethod: 'Multi-day recent readings compared with your normal baseline',
      progressionPoints,
    });
  }

  return candidates.sort((a, b) => b.zScore - a.zScore);
}
