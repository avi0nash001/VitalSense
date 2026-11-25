import type { MetricBaseline, MetricKey, VitalReading } from './types';
import { METRIC_DEFINITIONS, sortReadingsChronologically } from './vitalsEngine';

export type CalibrationBandMode = 'typical' | 'full_range';

export interface ThirtyDayCalibrationBand {
  metric: MetricKey;
  label: string;
  shortLabel: string;
  unit: string;
  mode: CalibrationBandMode;
  windowDays: number;
  dayCount: number;
  readingCount: number;
  coveragePct: number;
  mean: number | null;
  stdDev: number | null;
  observedMin: number | null;
  observedMax: number | null;
  typicalLow: number | null;
  typicalHigh: number | null;
  activeLow: number | null;
  activeHigh: number | null;
  currentValue: number | null;
  deltaFromMean: number | null;
  currentStatus: 'within_range' | 'above_range' | 'below_range' | 'no_data';
  statusLabel: string;
  markerPositionPct: number;
  bandStartPct: number;
  bandEndPct: number;
}

function roundTo(value: number, precision: number): number {
  const factor = Math.pow(10, precision);
  return Math.round(value * factor) / factor;
}

export function buildThirtyDayCalibrationBand(params: {
  readings: VitalReading[];
  metric: MetricKey;
  mode?: CalibrationBandMode;
  fallbackBaseline?: MetricBaseline | null;
  liveCurrentValue?: number | null;
}): ThirtyDayCalibrationBand {
  const { metric, mode = 'typical', fallbackBaseline = null, liveCurrentValue } = params;
  const def = METRIC_DEFINITIONS[metric];
  const sorted = sortReadingsChronologically(params.readings);

  const validEntries = sorted.filter(
    (r) => typeof r[metric] === 'number' && Number.isFinite(r[metric])
  );

  let thirtyDayEntries = validEntries;
  if (validEntries.length > 0) {
    const latestMs = Date.parse(validEntries[validEntries.length - 1].timestamp);
    const cutoffMs = latestMs - 29.5 * 24 * 60 * 60 * 1000;
    thirtyDayEntries = validEntries.filter((r) => Date.parse(r.timestamp) >= cutoffMs);
  }

  const uniqueDays = new Set(thirtyDayEntries.map((r) => r.timestamp.slice(0, 10))).size;
  const values = thirtyDayEntries.map((r) => r[metric] as number);
  const currentValue =
    typeof liveCurrentValue === 'number' && Number.isFinite(liveCurrentValue)
      ? roundTo(liveCurrentValue, def.precision)
      : values.length > 0
        ? roundTo(values[values.length - 1], def.precision)
        : null;

  if (values.length === 0 && (!fallbackBaseline || fallbackBaseline.mean === null)) {
    return {
      metric,
      label: def.label,
      shortLabel: def.shortLabel,
      unit: def.unit,
      mode,
      windowDays: 30,
      dayCount: 0,
      readingCount: 0,
      coveragePct: 0,
      mean: null,
      stdDev: null,
      observedMin: null,
      observedMax: null,
      typicalLow: null,
      typicalHigh: null,
      activeLow: null,
      activeHigh: null,
      currentValue,
      deltaFromMean: null,
      currentStatus: 'no_data',
      statusLabel: 'Collecting 30-day history',
      markerPositionPct: 50,
      bandStartPct: 25,
      bandEndPct: 75,
    };
  }

  const computedMean =
    values.length > 0
      ? values.reduce((acc, v) => acc + v, 0) / values.length
      : (fallbackBaseline?.mean ?? 0);

  const computedVariance =
    values.length > 1
      ? values.reduce((acc, v) => acc + Math.pow(v - computedMean, 2), 0) / (values.length - 1)
      : 0;
  const computedStd = Math.sqrt(computedVariance);

  // When an established baseline is supplied, anchor the typical range to it so recent shifts stand out clearly
  const useAnchoredBaseline =
    fallbackBaseline !== null &&
    fallbackBaseline.mean !== null &&
    fallbackBaseline.confidenceStatus !== 'insufficient';

  const mean = roundTo(
    useAnchoredBaseline ? (fallbackBaseline!.mean as number) : computedMean,
    def.precision
  );
  const rawStd = useAnchoredBaseline
    ? (fallbackBaseline!.stdDev ?? computedStd)
    : computedStd;
  const stdDev = roundTo(rawStd, def.precision);
  const halfBand = Math.max(rawStd, def.minFloorStd * 0.7);

  const observedMin =
    values.length > 0
      ? roundTo(Math.min(...values), def.precision)
      : roundTo(fallbackBaseline?.min ?? mean - halfBand, def.precision);
  const observedMax =
    values.length > 0
      ? roundTo(Math.max(...values), def.precision)
      : roundTo(fallbackBaseline?.max ?? mean + halfBand, def.precision);

  const typicalLow = roundTo(Math.max(def.plausibleMin, mean - halfBand), def.precision);
  const typicalHigh = roundTo(Math.min(def.plausibleMax, mean + halfBand), def.precision);

  const activeLow = mode === 'full_range' ? observedMin : typicalLow;
  const activeHigh = mode === 'full_range' ? observedMax : typicalHigh;

  const deltaFromMean =
    currentValue !== null ? roundTo(currentValue - mean, def.precision) : null;

  let currentStatus: ThirtyDayCalibrationBand['currentStatus'] = 'no_data';
  let statusLabel = 'Waiting for reading';

  if (currentValue !== null) {
    if (currentValue > activeHigh) {
      currentStatus = 'above_range';
      statusLabel = 'Above 30-day range';
    } else if (currentValue < activeLow) {
      currentStatus = 'below_range';
      statusLabel = 'Below 30-day range';
    } else {
      currentStatus = 'within_range';
      statusLabel = 'Within 30-day range';
    }
  }

  // Normalize band + current reading along a visual 0..100 track for the widget indicator bar
  const span = Math.max(activeHigh - activeLow, def.minFloorStd);
  const trackMin = Math.min(activeLow, currentValue ?? activeLow) - span * 0.35;
  const trackMax = Math.max(activeHigh, currentValue ?? activeHigh) + span * 0.35;
  const trackSpan = Math.max(trackMax - trackMin, 0.001);

  const toPct = (v: number) =>
    Math.max(2, Math.min(98, Math.round(((v - trackMin) / trackSpan) * 100)));

  const dayCount = Math.min(30, uniqueDays || fallbackBaseline?.coverageDays || 0);
  const coveragePct = Math.min(100, Math.round((dayCount / 30) * 100));

  return {
    metric,
    label: def.label,
    shortLabel: def.shortLabel,
    unit: def.unit,
    mode,
    windowDays: 30,
    dayCount,
    readingCount: values.length || fallbackBaseline?.readingCount || 0,
    coveragePct,
    mean,
    stdDev,
    observedMin,
    observedMax,
    typicalLow,
    typicalHigh,
    activeLow,
    activeHigh,
    currentValue,
    deltaFromMean,
    currentStatus,
    statusLabel,
    markerPositionPct: currentValue !== null ? toPct(currentValue) : 50,
    bandStartPct: toPct(activeLow),
    bandEndPct: toPct(activeHigh),
  };
}
