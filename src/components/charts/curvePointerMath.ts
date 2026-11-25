import { computeIllustrativeWaveformPoint } from '../../lib/intelligenceEngine';

export interface SvgPoint {
  x: number;
  y: number;
}

export function clampProgress01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function computePointerSweepProgress(elapsedMs: number, cycleMs = 4400): number {
  if (!Number.isFinite(elapsedMs) || !Number.isFinite(cycleMs) || cycleMs <= 0) return 0;
  const mod = ((elapsedMs % cycleMs) + cycleMs) % cycleMs;
  return mod / cycleMs;
}

export function computeRelativeProgressFromX(
  clientX: number,
  boundsLeft: number,
  boundsWidth: number
): number {
  if (!Number.isFinite(clientX) || !Number.isFinite(boundsLeft) || boundsWidth <= 0) {
    return 0.5;
  }
  return clampProgress01((clientX - boundsLeft) / boundsWidth);
}

/**
 * Generates a stationary multi-beat cardiac pulse waveform spanning [0, 1]
 * without scrolling or shifting the underlying wave.
 */
export function buildStationaryWaveformSeries(
  sampleCount = 220,
  cycles = 3.5,
  heartRateBpm = 68
): number[] {
  const count = Math.max(16, Math.round(sampleCount));
  const safeCycles = Math.max(1, cycles);
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const u = i / (count - 1);
    const phase = u * safeCycles * Math.PI * 2;
    out.push(computeIllustrativeWaveformPoint(phase, heartRateBpm, 0));
  }
  return out;
}

export function sampleArrayAtProgress(values: number[], progress01: number): number {
  if (values.length === 0) return 0;
  if (values.length === 1) return values[0];
  const clamped = clampProgress01(progress01);
  const pos = clamped * (values.length - 1);
  const idx = Math.min(values.length - 2, Math.floor(pos));
  const frac = pos - idx;
  return values[idx] + (values[idx + 1] - values[idx]) * frac;
}

export interface CurvePathLike {
  getTotalLength: () => number;
  getPointAtLength: (distance: number) => SvgPoint;
}

/**
 * Binary-searches a monotonic-X SVG path to find the exact curve length
 * whose x coordinate matches targetX so a movable user pointer locks onto the wave.
 */
export function findPathLengthAtX(
  path: CurvePathLike,
  targetX: number,
  iterations = 12
): SvgPoint | null {
  const total = path.getTotalLength();
  if (!Number.isFinite(total) || total <= 0) return null;

  const startPt = path.getPointAtLength(0);
  const endPt = path.getPointAtLength(total);
  if (targetX <= startPt.x) return { x: startPt.x, y: startPt.y };
  if (targetX >= endPt.x) return { x: endPt.x, y: endPt.y };

  let low = 0;
  let high = total;
  let best = startPt;

  for (let i = 0; i < iterations; i++) {
    const mid = (low + high) * 0.5;
    const pt = path.getPointAtLength(mid);
    best = pt;
    if (pt.x < targetX) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return { x: best.x, y: best.y };
}

export interface ScrubberPoint {
  label: string;
  timestamp?: string;
  value: number;
  secondaryValue?: number | null;
  quality?: number;
  note?: string;
}

export interface InterpolatedScrubberReadout {
  index: number;
  progress01: number;
  value: number;
  secondaryValue: number | null;
  label: string;
  timestamp: string;
  quality?: number;
  note?: string;
}

export interface PulseMarkerNode {
  id: string;
  beatNumber: number;
  progress01: number;
  amplitude: number;
  bpm: number;
  timestampLabel: string;
  phaseLabel: string;
}

export function formatPointTimestamp(
  rawTimestamp: string | undefined,
  fallbackLabel: string
): string {
  if (!rawTimestamp) return fallbackLabel;
  const parsed = Date.parse(rawTimestamp);
  if (Number.isNaN(parsed)) return rawTimestamp;
  const d = new Date(parsed);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Smoothly interpolates biometric telemetry values at any horizontal cursor
 * progress in [0, 1] along a stationary time series.
 */
export function interpolateSeriesAtProgress(
  points: ScrubberPoint[],
  progress01: number,
  precision = 1,
  secondaryPrecision = 1
): InterpolatedScrubberReadout | null {
  if (points.length === 0) return null;
  const clamped = clampProgress01(progress01);

  if (points.length === 1) {
    const only = points[0];
    return {
      index: 0,
      progress01: clamped,
      value: Number(only.value.toFixed(precision)),
      secondaryValue:
        typeof only.secondaryValue === 'number' && Number.isFinite(only.secondaryValue)
          ? Number(only.secondaryValue.toFixed(secondaryPrecision))
          : null,
      label: only.label,
      timestamp: formatPointTimestamp(only.timestamp, only.label),
      quality: only.quality,
      note: only.note,
    };
  }

  const pos = clamped * (points.length - 1);
  const idx = Math.min(points.length - 2, Math.floor(pos));
  const frac = pos - idx;
  const a = points[idx];
  const b = points[idx + 1];
  const nearestIdx = frac < 0.5 ? idx : idx + 1;
  const nearest = points[nearestIdx];

  const interpPrimary = Number((a.value + (b.value - a.value) * frac).toFixed(precision));

  let interpSecondary: number | null = null;
  if (
    typeof a.secondaryValue === 'number' &&
    Number.isFinite(a.secondaryValue) &&
    typeof b.secondaryValue === 'number' &&
    Number.isFinite(b.secondaryValue)
  ) {
    interpSecondary = Number(
      (a.secondaryValue + (b.secondaryValue - a.secondaryValue) * frac).toFixed(secondaryPrecision)
    );
  } else if (
    typeof nearest.secondaryValue === 'number' &&
    Number.isFinite(nearest.secondaryValue)
  ) {
    interpSecondary = Number(nearest.secondaryValue.toFixed(secondaryPrecision));
  }

  let timestamp = formatPointTimestamp(nearest.timestamp, nearest.label);
  if (a.timestamp && b.timestamp) {
    const tA = Date.parse(a.timestamp);
    const tB = Date.parse(b.timestamp);
    if (!Number.isNaN(tA) && !Number.isNaN(tB)) {
      const interpMs = tA + (tB - tA) * frac;
      timestamp = formatPointTimestamp(new Date(interpMs).toISOString(), nearest.label);
    }
  }

  return {
    index: nearestIdx,
    progress01: clamped,
    value: interpPrimary,
    secondaryValue: interpSecondary,
    label: nearest.label,
    timestamp,
    quality: nearest.quality,
    note: nearest.note,
  };
}

/**
 * Extracts clickable Point-at-Pulse peak markers from a stationary cardiac
 * waveform buffer so users can inspect individual pulse beats.
 */
export function computePulseMarkerNodes(
  waveSeries: number[],
  heartRateBpm: number,
  referenceTimeMs = Date.UTC(2026, 10, 25, 8, 15, 0)
): PulseMarkerNode[] {
  if (waveSeries.length < 5) return [];
  const peaks: number[] = [];
  for (let i = 2; i < waveSeries.length - 2; i++) {
    const val = waveSeries[i];
    if (
      val > 0.38 &&
      val >= waveSeries[i - 1] &&
      val > waveSeries[i + 1] &&
      val >= waveSeries[i - 2] &&
      val >= waveSeries[i + 2]
    ) {
      if (peaks.length === 0 || i - peaks[peaks.length - 1] >= Math.floor(waveSeries.length * 0.14)) {
        peaks.push(i);
      }
    }
  }

  const safeBpm = Number.isFinite(heartRateBpm) && heartRateBpm > 25 ? heartRateBpm : 68;
  const beatPeriodMs = 60000 / safeBpm;

  return peaks.map((idx, n) => {
    const progress01 = idx / Math.max(1, waveSeries.length - 1);
    const amplitude = Number(waveSeries[idx].toFixed(2));
    const offsetBeats = peaks.length - 1 - n;
    const ts = new Date(referenceTimeMs - Math.round(offsetBeats * beatPeriodMs));
    const timestampLabel = ts.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const microShift = ((n % 3) - 1) * 0.2;
    return {
      id: `pulse-peak-${n + 1}`,
      beatNumber: n + 1,
      progress01,
      amplitude,
      bpm: Number((safeBpm + microShift).toFixed(1)),
      timestampLabel,
      phaseLabel: `Pulse Peak #${n + 1}`,
    };
  });
}

