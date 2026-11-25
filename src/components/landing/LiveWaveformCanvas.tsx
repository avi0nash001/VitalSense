import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import {
  buildStationaryWaveformSeries,
  computePointerSweepProgress,
  computePulseMarkerNodes,
  computeRelativeProgressFromX,
  sampleArrayAtProgress,
  type PulseMarkerNode,
} from '../charts/curvePointerMath';

interface LiveWaveformCanvasProps {
  heartRateBpm: number;
  spo2Pct?: number | null;
  sourceLabel: string;
  isSimulated?: boolean;
  height?: number;
  compact?: boolean;
}

export function LiveWaveformCanvas({
  heartRateBpm,
  spo2Pct = 97.8,
  sourceLabel,
  isSimulated = true,
  height = 128,
  compact = false,
}: LiveWaveformCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const hoverProgressRef = useRef<number | null>(null);
  const pinnedProgressRef = useRef<number | null>(null);
  const bpmRef = useRef<number>(heartRateBpm);
  bpmRef.current = heartRateBpm;

  const [hoverProgress, setHoverProgress] = useState<number | null>(null);
  const [pinnedProgress, setPinnedProgress] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [canvasWidth, setCanvasWidth] = useState<number>(420);
  const [hoveredMarkerId, setHoveredMarkerId] = useState<string | null>(null);
  const [pinnedMarkerId, setPinnedMarkerId] = useState<string | null>(null);

  const dragStartRef = useRef<{ clientX: number; moved: boolean } | null>(null);
  const anchorTimestampMs = useMemo(() => Date.now(), [heartRateBpm]);

  const waveSeries = useMemo(
    () => buildStationaryWaveformSeries(220, 3.5, heartRateBpm),
    [heartRateBpm]
  );

  const pulseMarkers = useMemo(
    () => computePulseMarkerNodes(waveSeries, heartRateBpm, anchorTimestampMs),
    [waveSeries, heartRateBpm, anchorTimestampMs]
  );

  hoverProgressRef.current = hoverProgress;
  pinnedProgressRef.current = pinnedProgress;

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const updateW = () => {
      if (el.clientWidth > 0) setCanvasWidth(el.clientWidth);
    };
    updateW();
    if (typeof ResizeObserver !== 'undefined') {
      const obs = new ResizeObserver(updateW);
      obs.observe(el);
      return () => obs.disconnect();
    }
    return undefined;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let animId = 0;
    const startTs = performance.now();

    const draw = (now: number) => {
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth || 420;
      const targetH = height;
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(targetH * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(targetH * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const userScrub = hoverProgressRef.current ?? pinnedProgressRef.current;
      const pointerProgress =
        userScrub !== null
          ? userScrub
          : prefersReduced
            ? 0.72
            : computePointerSweepProgress(now - startTs, 3800);

      canvas.setAttribute('data-pointer-progress', pointerProgress.toFixed(3));
      ctx.clearRect(0, 0, width, targetH);

      const styles = getComputedStyle(document.documentElement);
      const lineColor = styles.getPropertyValue('--vs-accent').trim() || '#4F46E5';

      // Precision medical grid lines
      ctx.strokeStyle = 'rgba(100, 116, 139, 0.09)';
      ctx.lineWidth = 1;
      const stepX = 32;
      for (let x = 0; x < width; x += stepX) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, targetH);
        ctx.stroke();
      }
      const stepY = 24;
      for (let y = 0; y < targetH; y += stepY) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      const midY = targetH * 0.57;
      const amp = targetH * 0.35;

      // Dashed clinical zero-reference rule
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(100, 116, 139, 0.22)';
      ctx.beginPath();
      ctx.moveTo(0, midY);
      ctx.lineTo(width, midY);
      ctx.stroke();
      ctx.restore();

      // Gradient area fill underneath the 100% stationary pulse wave
      const areaGrad = ctx.createLinearGradient(0, midY - amp, 0, targetH);
      areaGrad.addColorStop(0, `${lineColor}26`);
      areaGrad.addColorStop(0.7, `${lineColor}0D`);
      areaGrad.addColorStop(1, `${lineColor}00`);

      ctx.beginPath();
      waveSeries.forEach((val, idx) => {
        const x = (idx / (waveSeries.length - 1)) * width;
        const y = midY - val * amp;
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.lineTo(width, targetH);
      ctx.lineTo(0, targetH);
      ctx.closePath();
      ctx.fillStyle = areaGrad;
      ctx.fill();

      // Stationary crisp waveform line
      ctx.beginPath();
      waveSeries.forEach((val, idx) => {
        const x = (idx / (waveSeries.length - 1)) * width;
        const y = midY - val * amp;
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = lineColor;
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 2.0;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Subtle Point-at-Pulse peak indicators directly on the stationary curve peaks
      pulseMarkers.forEach((marker) => {
        const mx = marker.progress01 * width;
        const my = midY - marker.amplitude * amp;
        ctx.beginPath();
        ctx.arc(mx, my, 3.1, 0, Math.PI * 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 1.6;
        ctx.stroke();
      });

      // Idle mode: ONLY the moving glowing POINT glides along the stationary wave (NO moving vertical line!)
      // User scrub mode: SVG/DOM scrubber overlay draws the user-controlled vertical scrubber line separately.
      if (userScrub === null) {
        const ptrVal = sampleArrayAtProgress(waveSeries, pointerProgress);
        const ptrX = Math.max(6, Math.min(width - 6, pointerProgress * width));
        const ptrY = midY - ptrVal * amp;

        const windowHalf = 0.055;
        const wStart = Math.max(0, Math.floor((pointerProgress - windowHalf) * (waveSeries.length - 1)));
        const wEnd = Math.min(
          waveSeries.length - 1,
          Math.ceil((pointerProgress + windowHalf) * (waveSeries.length - 1))
        );
        if (wEnd > wStart) {
          ctx.save();
          ctx.shadowColor = `${lineColor}66`;
          ctx.shadowBlur = 8;
          ctx.beginPath();
          for (let idx = wStart; idx <= wEnd; idx++) {
            const x = (idx / (waveSeries.length - 1)) * width;
            const y = midY - waveSeries[idx] * amp;
            if (idx === wStart) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.strokeStyle = lineColor;
          ctx.lineWidth = 2.7;
          ctx.lineCap = 'round';
          ctx.stroke();
          ctx.restore();
        }

        ctx.beginPath();
        ctx.arc(ptrX, ptrY, 10, 0, Math.PI * 2);
        ctx.fillStyle = `${lineColor}26`;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(ptrX, ptrY, 6.2, 0, Math.PI * 2);
        ctx.strokeStyle = `${lineColor}70`;
        ctx.lineWidth = 1.4;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(ptrX, ptrY, 4, 0, Math.PI * 2);
        ctx.fillStyle = lineColor;
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.8;
        ctx.stroke();
      }

      if (!prefersReduced) {
        animId = window.requestAnimationFrame(draw);
      }
    };

    draw(performance.now());
    if (!prefersReduced) {
      animId = window.requestAnimationFrame(draw);
    }
    return () => window.cancelAnimationFrame(animId);
  }, [height, waveSeries, pulseMarkers]);

  const activeScrubProgress = hoverProgress ?? pinnedProgress;
  const activeMarkerId = hoveredMarkerId ?? pinnedMarkerId;
  const activeMarker: PulseMarkerNode | null = useMemo(
    () => pulseMarkers.find((m) => m.id === activeMarkerId) ?? null,
    [pulseMarkers, activeMarkerId]
  );

  const midY = height * 0.57;
  const amp = height * 0.35;

  const scrubReadout = useMemo(() => {
    if (activeScrubProgress === null) return null;
    const ampVal = sampleArrayAtProgress(waveSeries, activeScrubProgress);
    const instantHr = Number((heartRateBpm + ampVal * 1.4).toFixed(1));
    const offsetSec = (1 - activeScrubProgress) * 3.5 * (60 / Math.max(40, heartRateBpm));
    const ts = new Date(anchorTimestampMs - Math.round(offsetSec * 1000));
    const timeText = ts.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const xPx = Math.max(4, Math.min(canvasWidth - 4, activeScrubProgress * canvasWidth));
    const yPx = midY - ampVal * amp;
    return { instantHr, ampVal, timeText, xPx, yPx };
  }, [activeScrubProgress, waveSeries, heartRateBpm, anchorTimestampMs, canvasWidth, midY, amp]);

  const updateProgressFromEvent = (e: React.PointerEvent<HTMLElement>, alsoPin = false) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const p = computeRelativeProgressFromX(e.clientX, rect.left, rect.width);
    setHoverProgress(p);
    if (alsoPin) {
      setPinnedProgress(p);
    }
  };

  return (
    <div className="vs-glass-subcard rounded-xl p-3.5 sm:p-4">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[var(--vs-text)]">{sourceLabel}</span>
          <span className="text-[var(--vs-text-muted)]">·</span>
          <span className="font-mono-num font-semibold text-[var(--vs-accent)]">
            {heartRateBpm.toFixed(1)} bpm
          </span>
        </div>
        <span
          className={`font-mono-num text-[10.5px] font-semibold uppercase tracking-[0.08em] ${
            isSimulated ? 'text-[var(--vs-warning)]' : 'text-[var(--vs-success)]'
          }`}
        >
          {isSimulated ? 'POINT-AT-PULSE · SIMULATED' : 'POINT-AT-PULSE · LIVE'}
        </span>
      </div>

      <div
        ref={containerRef}
        className="relative w-full select-none"
        style={{ height: `${height}px` }}
        onPointerDown={(e) => {
          const target = e.target as HTMLElement | null;
          if (target?.closest('[data-overlay-interactive="true"]')) return;
          dragStartRef.current = { clientX: e.clientX, moved: false };
          setIsDragging(true);
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // ignore
          }
          updateProgressFromEvent(e, true);
        }}
        onPointerMove={(e) => {
          if (isDragging && dragStartRef.current) {
            if (Math.abs(e.clientX - dragStartRef.current.clientX) >= 4) {
              dragStartRef.current.moved = true;
            }
            updateProgressFromEvent(e, true);
            return;
          }
          updateProgressFromEvent(e, false);
        }}
        onPointerUp={(e) => {
          if (!isDragging) return;
          setIsDragging(false);
          try {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
              e.currentTarget.releasePointerCapture(e.pointerId);
            }
          } catch {
            // ignore
          }
          const origin = dragStartRef.current;
          dragStartRef.current = null;
          if (origin && !origin.moved) {
            setPinnedProgress(null);
            setPinnedMarkerId(null);
          }
        }}
        onPointerLeave={() => {
          if (isDragging) return;
          setHoverProgress(null);
          setHoveredMarkerId(null);
        }}
        onDoubleClick={() => {
          setPinnedProgress(null);
          setPinnedMarkerId(null);
        }}
      >
        <canvas
          ref={canvasRef}
          data-testid="live-waveform-canvas"
          style={{ height: `${height}px` }}
          className="vs-glass-chart-pane w-full block rounded-lg cursor-crosshair touch-none"
        />

        {/* User-Controlled Draggable Vertical Scrubber Line + Live Tooltip */}
        {scrubReadout && (
          <div className="pointer-events-none absolute inset-0 z-10">
            <div
              data-testid="chart-scrubber-line"
              data-scrubber-x={scrubReadout.xPx.toFixed(1)}
              style={{ left: `${scrubReadout.xPx}px` }}
              className="absolute inset-y-1 w-[1.5px] -translate-x-1/2 bg-[var(--vs-accent)]/80"
            />
            <button
              type="button"
              data-overlay-interactive="true"
              data-testid="scrubber-drag-handle"
              aria-label="Drag vertical scrubber line across pulse wave"
              onPointerDown={(e) => {
                e.stopPropagation();
                dragStartRef.current = { clientX: e.clientX, moved: false };
                setIsDragging(true);
                containerRef.current?.setPointerCapture?.(e.pointerId);
              }}
              style={{ left: `${scrubReadout.xPx}px`, top: '2px' }}
              className="pointer-events-auto absolute -translate-x-1/2 flex h-4 w-6 cursor-ew-resize items-center justify-center rounded-full border border-[var(--vs-border-strong)] bg-[var(--vs-surface)] shadow-xs"
            >
              <span className="flex gap-0.5">
                <span className="h-2 w-px bg-[var(--vs-accent)]" />
                <span className="h-2 w-px bg-[var(--vs-accent)]" />
              </span>
            </button>

            <div
              style={{ left: `${scrubReadout.xPx}px`, top: `${scrubReadout.yPx}px` }}
              className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[var(--vs-accent)] shadow-xs"
            />

            {!activeMarker && (
              <div
                data-testid="scrubber-tooltip"
                style={{
                  left: `${
                    scrubReadout.xPx > canvasWidth * 0.6
                      ? Math.max(8, scrubReadout.xPx - 12)
                      : Math.min(canvasWidth - 8, scrubReadout.xPx + 12)
                  }px`,
                  top: '8px',
                  transform:
                    scrubReadout.xPx > canvasWidth * 0.6 ? 'translateX(-100%)' : 'translateX(0)',
                }}
                className="pointer-events-none absolute min-w-[154px] rounded-xl border border-[var(--vs-border-strong)] bg-[var(--vs-surface)]/95 px-3 py-2 shadow-md backdrop-blur-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono-num text-[10px] text-[var(--vs-text-muted)]">
                    {scrubReadout.timeText}
                  </span>
                  {pinnedProgress !== null && (
                    <button
                      type="button"
                      data-overlay-interactive="true"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPinnedProgress(null);
                      }}
                      className="pointer-events-auto text-[10px] font-semibold text-[var(--vs-accent)] hover:underline"
                    >
                      Unpin
                    </button>
                  )}
                </div>
                <div className="mt-0.5 flex items-baseline justify-between gap-3">
                  <span className="text-[11px] text-[var(--vs-text-secondary)]">Heart Rate</span>
                  <span className="vs-kpi-num text-xs font-bold text-[var(--vs-text)]">
                    {scrubReadout.instantHr} bpm
                  </span>
                </div>
                {typeof spo2Pct === 'number' && Number.isFinite(spo2Pct) && (
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[11px] text-[var(--vs-text-secondary)]">SpO₂</span>
                    <span className="vs-kpi-num text-xs font-semibold text-[var(--vs-text)]">
                      {spo2Pct.toFixed(1)}%
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Clickable & Hoverable 'Point-at-Pulse' Peak Markers */}
        <div className="pointer-events-none absolute inset-0 z-20">
          {pulseMarkers.map((marker) => {
            const mx = marker.progress01 * canvasWidth;
            const my = midY - marker.amplitude * amp;
            const selected = activeMarkerId === marker.id;
            return (
              <button
                key={marker.id}
                type="button"
                data-overlay-interactive="true"
                data-testid="point-at-pulse-marker"
                data-pulse-beat={marker.beatNumber}
                aria-label={`${marker.phaseLabel}: ${marker.bpm} bpm at ${marker.timestampLabel}`}
                onPointerEnter={() => setHoveredMarkerId(marker.id)}
                onPointerLeave={() =>
                  setHoveredMarkerId((prev) => (prev === marker.id ? null : prev))
                }
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  setPinnedMarkerId((prev) => (prev === marker.id ? null : marker.id));
                }}
                style={{ left: `${mx}px`, top: `${my}px` }}
                className="pointer-events-auto absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center rounded-full focus:outline-none"
              >
                <span
                  className={`block rounded-full transition-all ${
                    selected
                      ? 'h-3.5 w-3.5 ring-4 ring-[var(--vs-accent)]/25 bg-[var(--vs-surface)] border-2 border-[var(--vs-accent)]'
                      : 'h-2.5 w-2.5 bg-transparent hover:bg-[var(--vs-accent)]/20'
                  }`}
                />
              </button>
            );
          })}
        </div>

        {/* Point-at-Pulse Popover */}
        {activeMarker && (
          <div
            role="dialog"
            aria-label="Point at pulse reading"
            data-testid="point-at-pulse-popover"
            data-overlay-interactive="true"
            style={{
              left: `${Math.max(86, Math.min(canvasWidth - 94, activeMarker.progress01 * canvasWidth))}px`,
              top: `${Math.max(8, midY - activeMarker.amplitude * amp - 8)}px`,
              transform:
                midY - activeMarker.amplitude * amp > height * 0.45
                  ? 'translate(-50%, -100%)'
                  : 'translate(-50%, 14px)',
            }}
            className="pointer-events-auto absolute z-30 min-w-[180px] rounded-xl border border-[var(--vs-border-strong)] bg-[var(--vs-surface)] px-3 py-2 shadow-lg"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--vs-accent)]">
                {activeMarker.phaseLabel}
              </span>
              {pinnedMarkerId !== null && (
                <button
                  type="button"
                  aria-label="Close pulse popover"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPinnedMarkerId(null);
                    setHoveredMarkerId(null);
                  }}
                  className="rounded p-0.5 text-[var(--vs-text-muted)] hover:bg-[var(--vs-bg-subtle)]"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
            <p className="mt-0.5 font-mono-num text-[10.5px] text-[var(--vs-text-muted)]">
              {activeMarker.timestampLabel}
            </p>
            <div className="mt-1 flex items-baseline justify-between gap-3">
              <span className="text-xs text-[var(--vs-text-secondary)]">Instant Pulse</span>
              <span className="vs-kpi-num text-sm font-bold text-[var(--vs-text)]">
                {activeMarker.bpm} bpm
              </span>
            </div>
            {typeof spo2Pct === 'number' && Number.isFinite(spo2Pct) && (
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-xs text-[var(--vs-text-secondary)]">SpO₂</span>
                <span className="vs-kpi-num text-xs font-semibold text-[var(--vs-text)]">
                  {spo2Pct.toFixed(1)}%
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {!compact && (
        <p className="mt-2 text-xs text-[var(--vs-text-muted)]">
          Hover or drag the vertical scrubber line across the stationary wave, or click any pulse peak dot to inspect its value and timestamp.
        </p>
      )}
    </div>
  );
}
