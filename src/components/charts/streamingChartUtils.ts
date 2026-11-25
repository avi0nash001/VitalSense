import { HERO_SLIDE_INTERVAL_MS } from '../landing/heroCarouselConfig';
import type { ThemeDefinition } from '../../theme/themes';

/**
 * Unified chart timing synchronized with the hero auto-slider interval (2500ms).
 */
export const STREAMING_CYCLE_MS = HERO_SLIDE_INTERVAL_MS;
export const STREAMING_CYCLE_SECONDS = HERO_SLIDE_INTERVAL_MS / 1000;

export function getStreamingCycleSeconds(multiplier = 1): number {
  const safeMult = Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;
  return Number((STREAMING_CYCLE_SECONDS * safeMult).toFixed(2));
}

/**
 * Generates a seamless repeating SVG sine-harmonic path spanning [0, 2 * width]
 * so translating by -50% creates a continuous wave-like streaming progression
 * with zero visual seam at loop boundaries.
 */
export function buildStreamingWavePath(
  width: number,
  height: number,
  baselineY: number,
  amplitude = 10,
  cyclesPerSpan = 2,
  sampleCount = 64
): string {
  const safeW = Math.max(40, width);
  const safeH = Math.max(20, height);
  const totalW = safeW * 2;
  const totalSamples = Math.max(16, sampleCount);
  const clampedBase = Math.max(amplitude + 2, Math.min(safeH - amplitude - 2, baselineY));

  const points: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= totalSamples; i++) {
    const t = i / totalSamples;
    const x = t * totalW;
    // Integer cycles per half-span (width) ensures f(0) === f(width) === f(2*width)
    const theta = t * 2 * Math.PI * cyclesPerSpan * 2;
    const primary = Math.sin(theta) * amplitude;
    const harmonic = Math.sin(theta * 2 + Math.PI / 3) * (amplitude * 0.28);
    const y = clampedBase - primary - harmonic;
    points.push({ x, y });
  }

  const lineSegment = points
    .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
    .join(' ');

  return `${lineSegment} L ${totalW.toFixed(1)} ${safeH.toFixed(1)} L 0.0 ${safeH.toFixed(1)} Z`;
}

export interface GlassChartTheme {
  strokeColor: string;
  secondaryColor: string;
  bandColor: string;
  gridColor: string;
  refColor: string;
  tickColor: string;
  surfaceColor: string;
  borderColor: string;
  textColor: string;
  mutedTextColor: string;
  tickStyle: {
    fontSize: number;
    fontWeight: number;
    fill: string;
    fontFamily: string;
  };
}

export function buildGlassChartTheme(
  tokens: ThemeDefinition['tokens'],
  accentOverride?: string
): GlassChartTheme {
  const tickColor = tokens['--vs-text-secondary'];
  return {
    strokeColor: accentOverride ?? tokens['--vs-chart-line'],
    secondaryColor: tokens['--vs-warning'],
    bandColor: tokens['--vs-chart-band'],
    gridColor: tokens['--vs-chart-grid'],
    refColor: tokens['--vs-chart-ref'],
    tickColor,
    surfaceColor: tokens['--vs-surface'],
    borderColor: tokens['--vs-border-strong'],
    textColor: tokens['--vs-text'],
    mutedTextColor: tokens['--vs-text-muted'],
    tickStyle: {
      fontSize: 12,
      fontWeight: 500,
      fill: tickColor,
      fontFamily: 'IBM Plex Mono, monospace',
    },
  };
}
