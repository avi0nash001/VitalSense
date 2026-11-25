export interface ChartPoint {
  x: number;
  y: number;
}

/**
 * Generates a smooth Catmull-Rom -> Cubic Bezier SVG path string passing cleanly
 * through every provided data point.
 */
export function buildSmoothLinePath(points: ChartPoint[], tension = 0.22): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  if (points.length === 2) {
    return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)} L ${points[1].x.toFixed(1)} ${points[1].y.toFixed(1)}`;
  }

  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 < points.length ? i + 2 : points.length - 1];

    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;

    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

/**
 * Closes a smooth line path down to a baseline Y coordinate for SVG gradient fills.
 */
export function buildSmoothAreaPath(
  points: ChartPoint[],
  baselineY: number,
  tension = 0.22
): string {
  if (points.length === 0) return '';
  const line = buildSmoothLinePath(points, tension);
  const first = points[0];
  const last = points[points.length - 1];
  return `${line} L ${last.x.toFixed(1)} ${baselineY.toFixed(1)} L ${first.x.toFixed(1)} ${baselineY.toFixed(1)} Z`;
}

/**
 * Evaluates an exact (x, y) position at normalized progress t in [0, 1] along the
 * Catmull-Rom cubic curve defined by `buildSmoothLinePath(points, tension)`.
 */
export function sampleTrajectoryPoint(
  points: ChartPoint[],
  progress01: number,
  tension = 0.22
): ChartPoint {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return { x: points[0].x, y: points[0].y };

  const clamped = Math.max(0, Math.min(1, progress01));
  const segCount = points.length - 1;
  const scaled = clamped * segCount;
  const segIdx = Math.min(segCount - 1, Math.floor(scaled));
  const t = scaled - segIdx;

  const p0 = points[segIdx === 0 ? 0 : segIdx - 1];
  const p1 = points[segIdx];
  const p2 = points[segIdx + 1];
  const p3 = points[segIdx + 2 < points.length ? segIdx + 2 : points.length - 1];

  const cp1x = p1.x + (p2.x - p0.x) * tension;
  const cp1y = p1.y + (p2.y - p0.y) * tension;
  const cp2x = p2.x - (p3.x - p1.x) * tension;
  const cp2y = p2.y - (p3.y - p1.y) * tension;

  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;

  return {
    x:
      mt2 * mt * p1.x +
      3 * mt2 * t * cp1x +
      3 * mt * t2 * cp2x +
      t2 * t * p2.x,
    y:
      mt2 * mt * p1.y +
      3 * mt2 * t * cp1y +
      3 * mt * t2 * cp2y +
      t2 * t * p2.y,
  };
}

/**
 * Produces a smoothly interpolated, continuously flowing series anchored to discrete
 * clinical readings so analytical graphs stream gently like Slide 1's live trace.
 */
export function buildStreamingSeries(
  anchors: number[],
  phase: number,
  sampleCount = 72,
  rippleAmplitude = 0.32
): number[] {
  if (anchors.length === 0 || sampleCount <= 0) return [];
  if (anchors.length === 1) {
    return Array.from({ length: sampleCount }, (_, idx) => {
      const u = sampleCount === 1 ? 0 : idx / (sampleCount - 1);
      return anchors[0] + Math.sin(u * Math.PI * 6 + phase) * rippleAmplitude;
    });
  }

  const out: number[] = [];
  for (let i = 0; i < sampleCount; i++) {
    const u = sampleCount === 1 ? 0 : i / (sampleCount - 1);
    const pos = u * (anchors.length - 1);
    const idx = Math.min(anchors.length - 2, Math.floor(pos));
    const frac = pos - idx;
    const smoothFrac = frac * frac * (3 - 2 * frac);
    const base = anchors[idx] + (anchors[idx + 1] - anchors[idx]) * smoothFrac;
    const wave =
      Math.sin(u * Math.PI * 7 + phase) * rippleAmplitude +
      Math.cos(u * Math.PI * 13 + phase * 1.4) * (rippleAmplitude * 0.35);
    out.push(base + wave);
  }
  return out;
}
