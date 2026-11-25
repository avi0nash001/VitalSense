import { useEffect, useRef } from 'react';
import {
  buildSmoothAreaPath,
  buildSmoothLinePath,
  buildStreamingSeries,
  sampleTrajectoryPoint,
  type ChartPoint,
} from './chartCurves';

interface LiveStreamingSvgTraceProps {
  /** Y coordinates corresponding to discrete clinical anchor points across the chart */
  anchorYs: number[];
  xStart: number;
  xEnd: number;
  baselineY: number;
  strokeColor: string;
  areaFillUrl: string;
  strokeWidth?: number;
  rippleAmplitude?: number;
  speed?: number;
  sampleCount?: number;
  showLeadingCursor?: boolean;
  cursorColor?: string;
}

/**
 * Continuously streams a smooth Catmull-Rom physiological curve inside any SVG chart
 * via direct ref updates inside requestAnimationFrame (zero 60Hz React re-renders).
 */
export function LiveStreamingSvgTrace({
  anchorYs,
  xStart,
  xEnd,
  baselineY,
  strokeColor,
  areaFillUrl,
  strokeWidth = 2.6,
  rippleAmplitude = 2.4,
  speed = 2.4,
  sampleCount = 64,
  showLeadingCursor = true,
  cursorColor,
}: LiveStreamingSvgTraceProps) {
  const lineRef = useRef<SVGPathElement | null>(null);
  const areaRef = useRef<SVGPathElement | null>(null);
  const haloRef = useRef<SVGCircleElement | null>(null);
  const dotRef = useRef<SVGCircleElement | null>(null);

  const anchorsKey = anchorYs.map((y) => y.toFixed(1)).join(',');

  useEffect(() => {
    if (anchorYs.length === 0) return;

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let animId = 0;
    let phase = 0;
    let lastTs = performance.now();

    const renderFrame = (currentPhase: number) => {
      const ys = buildStreamingSeries(anchorYs, currentPhase, sampleCount, rippleAmplitude);
      const pts: ChartPoint[] = ys.map((y, idx) => ({
        x: xStart + ((xEnd - xStart) * idx) / Math.max(1, ys.length - 1),
        y,
      }));
      const lineD = buildSmoothLinePath(pts, 0.2);
      const areaD = buildSmoothAreaPath(pts, baselineY, 0.2);

      if (lineRef.current) lineRef.current.setAttribute('d', lineD);
      if (areaRef.current) areaRef.current.setAttribute('d', areaD);

      const tail = pts[pts.length - 1];
      if (tail && haloRef.current && dotRef.current) {
        haloRef.current.setAttribute('cx', tail.x.toFixed(1));
        haloRef.current.setAttribute('cy', tail.y.toFixed(1));
        haloRef.current.setAttribute(
          'r',
          (7.2 + Math.sin(currentPhase * 1.4) * 2.1).toFixed(1)
        );
        dotRef.current.setAttribute('cx', tail.x.toFixed(1));
        dotRef.current.setAttribute('cy', tail.y.toFixed(1));
      }
    };

    renderFrame(0);
    if (prefersReduced) return;

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - lastTs) / 1000);
      lastTs = now;
      phase += dt * speed;
      renderFrame(phase);
      animId = window.requestAnimationFrame(tick);
    };

    animId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(animId);
  }, [anchorsKey, xStart, xEnd, baselineY, rippleAmplitude, speed, sampleCount]);

  const initialYs = buildStreamingSeries(anchorYs, 0, sampleCount, rippleAmplitude);
  const initialPts: ChartPoint[] = initialYs.map((y, idx) => ({
    x: xStart + ((xEnd - xStart) * idx) / Math.max(1, initialYs.length - 1),
    y,
  }));
  const initialLine = buildSmoothLinePath(initialPts, 0.2);
  const initialArea = buildSmoothAreaPath(initialPts, baselineY, 0.2);
  const initialLast = initialPts[initialPts.length - 1] ?? { x: xEnd, y: baselineY };
  const dotCol = cursorColor ?? strokeColor;

  return (
    <g pointerEvents="none">
      <path ref={areaRef} d={initialArea} fill={areaFillUrl} />
      <path
        ref={lineRef}
        d={initialLine}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {showLeadingCursor && (
        <>
          <circle
            ref={haloRef}
            cx={initialLast.x}
            cy={initialLast.y}
            r="8"
            fill={dotCol}
            fillOpacity="0.22"
          />
          <circle
            ref={dotRef}
            cx={initialLast.x}
            cy={initialLast.y}
            r="4.2"
            fill={dotCol}
          />
        </>
      )}
    </g>
  );
}

interface LiveTrajectoryBeaconProps {
  points: ChartPoint[];
  color: string;
  tension?: number;
  cycleSeconds?: number;
}

/**
 * Smoothly glides a luminous telemetry pulse along a clinical trajectory curve
 * without touching React state at 60Hz.
 */
export function LiveTrajectoryBeacon({
  points,
  color,
  tension = 0.22,
  cycleSeconds = 3.6,
}: LiveTrajectoryBeaconProps) {
  const outerRef = useRef<SVGCircleElement | null>(null);
  const coreRef = useRef<SVGCircleElement | null>(null);
  const pointsKey = points.map((p) => `${p.x.toFixed(1)}:${p.y.toFixed(1)}`).join('|');

  useEffect(() => {
    if (points.length < 2) return;

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let animId = 0;
    const startTs = performance.now();

    const updateAt = (progress: number) => {
      const pos = sampleTrajectoryPoint(points, progress, tension);
      if (outerRef.current && coreRef.current) {
        outerRef.current.setAttribute('cx', pos.x.toFixed(1));
        outerRef.current.setAttribute('cy', pos.y.toFixed(1));
        coreRef.current.setAttribute('cx', pos.x.toFixed(1));
        coreRef.current.setAttribute('cy', pos.y.toFixed(1));
      }
    };

    updateAt(0.75);
    if (prefersReduced) return;

    const tick = (now: number) => {
      const elapsedSec = (now - startTs) / 1000;
      const progress = (elapsedSec % cycleSeconds) / cycleSeconds;
      updateAt(progress);
      animId = window.requestAnimationFrame(tick);
    };

    animId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(animId);
  }, [pointsKey, tension, cycleSeconds]);

  const fallback = points[points.length - 1] ?? { x: 0, y: 0 };

  return (
    <g pointerEvents="none">
      <circle
        ref={outerRef}
        cx={fallback.x}
        cy={fallback.y}
        r="9"
        fill={color}
        fillOpacity="0.22"
      />
      <circle
        ref={coreRef}
        cx={fallback.x}
        cy={fallback.y}
        r="3.8"
        fill={color}
      />
    </g>
  );
}

interface LiveDeviationMeterProps {
  label: string;
  reading: string;
  sigmaLabel: string;
  offsetPct: number;
  shifted: boolean;
  phaseOffset: number;
  mutedClass: string;
}

/**
 * Renders an Explainable AI deviation track with continuous live physiological
 * micro-telemetry motion on its indicator bar and marker dot.
 */
export function LiveDeviationMeter({
  label,
  reading,
  sigmaLabel,
  offsetPct,
  shifted,
  phaseOffset,
  mutedClass,
}: LiveDeviationMeterProps) {
  const barRef = useRef<HTMLDivElement | null>(null);
  const dotRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    let animId = 0;
    const startTs = performance.now();

    const tick = (now: number) => {
      const t = (now - startTs) / 1000;
      const deltaPct = Math.sin(t * 2.1 + phaseOffset) * 2.2;
      const currentOffset = offsetPct + deltaPct;

      if (dotRef.current) {
        dotRef.current.style.left = `${(50 + currentOffset).toFixed(2)}%`;
      }
      animId = window.requestAnimationFrame(tick);
    };

    animId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(animId);
  }, [offsetPct, phaseOffset]);

  const isPositive = offsetPct >= 0;
  const initLeft = isPositive ? 50 : Math.max(8, 50 + offsetPct);
  const initWidth = Math.min(44, Math.abs(offsetPct));

  return (
    <div className="grid grid-cols-12 items-center gap-2 text-xs">
      <div className="col-span-5 sm:col-span-4 truncate">
        <p className="font-medium text-[var(--vs-text)] truncate">{label}</p>
        <p className={`font-mono-num text-[11px] ${mutedClass}`}>{reading}</p>
      </div>

      <div className="col-span-5 sm:col-span-6 relative h-5 flex items-center">
        <div className="h-2.5 w-full rounded-full bg-[var(--vs-border)] relative overflow-hidden">
          <div className="absolute inset-y-0 left-[26%] right-[26%] bg-indigo-500/12 border-x border-indigo-500/30" />
        </div>
        <div className="absolute left-1/2 top-0.5 bottom-0.5 w-px bg-[var(--vs-text-muted)]/55" />
        <div
          ref={barRef}
          className={`absolute h-2.5 rounded-full ${
            shifted ? 'bg-amber-500' : 'bg-[var(--vs-accent)]'
          }`}
          style={{ left: `${initLeft}%`, width: `${initWidth}%` }}
        />
        <div
          ref={dotRef}
          className={`absolute h-3.5 w-3.5 -translate-x-1/2 rounded-full border-2 border-white shadow-xs ${
            shifted ? 'bg-amber-500' : 'bg-[var(--vs-accent)]'
          }`}
          style={{ left: `${50 + offsetPct}%` }}
        />
      </div>

      <div className="col-span-2 text-right font-mono-num text-xs font-semibold">
        <span
          className={
            shifted
              ? 'text-amber-600'
              : 'text-[var(--vs-success)]'
          }
        >
          {sigmaLabel}
        </span>
      </div>
    </div>
  );
}
