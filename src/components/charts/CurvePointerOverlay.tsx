import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import {
  clampProgress01,
  computePointerSweepProgress,
  findPathLengthAtX,
  formatPointTimestamp,
  interpolateSeriesAtProgress,
  type ScrubberPoint,
} from './curvePointerMath';

export interface ScrubberSeriesConfig {
  points: ScrubberPoint[];
  metricLabel: string;
  unit: string;
  precision?: number;
  secondaryLabel?: string;
  secondaryUnit?: string;
  secondaryPrecision?: number;
  baselineMean?: number | null;
}

interface CurvePointerOverlayProps {
  children: React.ReactNode;
  accentColor?: string;
  enabled?: boolean;
  cycleMs?: number;
  className?: string;
  scrubberSeries?: ScrubberSeriesConfig;
}

interface MarkerPosition {
  index: number;
  x: number;
  y: number;
  point: ScrubberPoint;
}

interface ChartPlotLayout {
  plotLeft: number;
  plotRight: number;
  yTop: number;
  yBottom: number;
  stageWidth: number;
  stageHeight: number;
  markers: MarkerPosition[];
}

/**
 * Keeps the underlying Recharts line/area curve 100% stationary while:
 * 1) Auto-gliding a subtle telemetry point along the curve when idle (with NO moving line),
 * 2) Providing a cursor-following, draggable vertical scrubber line + live readout tooltip, and
 * 3) Providing interactive 'Point-at-Pulse' markers that display exact value & timestamp popovers.
 */
export function CurvePointerOverlay({
  children,
  accentColor = '#4F46E5',
  enabled = true,
  cycleMs = 4400,
  className = 'h-full w-full',
  scrubberSeries,
}: CurvePointerOverlayProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const pointerGroupRef = useRef<SVGGElement | null>(null);
  const haloRef = useRef<SVGCircleElement | null>(null);
  const ringRef = useRef<SVGCircleElement | null>(null);
  const dotRef = useRef<SVGCircleElement | null>(null);

  const colorRef = useRef<string>(accentColor);
  colorRef.current = accentColor;

  const [plotLayout, setPlotLayout] = useState<ChartPlotLayout | null>(null);
  const [hoverClientX, setHoverClientX] = useState<number | null>(null);
  const [hoverLocalPos, setHoverLocalPos] = useState<{ x: number; y: number } | null>(null);
  const [pinnedLocalX, setPinnedLocalX] = useState<number | null>(null);
  const [pinnedCurvePos, setPinnedCurvePos] = useState<{ x: number; y: number } | null>(null);
  const [isDraggingScrubber, setIsDraggingScrubber] = useState<boolean>(false);

  const [hoveredMarkerIdx, setHoveredMarkerIdx] = useState<number | null>(null);
  const [pinnedMarkerIdx, setPinnedMarkerIdx] = useState<number | null>(null);

  const dragOriginRef = useRef<{ clientX: number; moved: boolean } | null>(null);
  const isInteractingRef = useRef<boolean>(false);

  const getChartGeometry = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return null;
    const svgEl = stage.querySelector('svg.recharts-surface') as SVGSVGElement | null;
    const pathEl = svgEl?.querySelector(
      'path.recharts-area-curve, path.recharts-line-curve'
    ) as SVGPathElement | null;
    if (!svgEl || !pathEl) return null;

    const totalLen = pathEl.getTotalLength();
    if (!Number.isFinite(totalLen) || totalLen < 4) return null;

    const stageRect = stage.getBoundingClientRect();
    const svgRect = svgEl.getBoundingClientRect();
    if (svgRect.width <= 0 || svgRect.height <= 0) return null;

    const vb = svgEl.viewBox?.baseVal;
    const vbWidth = vb && vb.width > 0 ? vb.width : svgRect.width;
    const vbHeight = vb && vb.height > 0 ? vb.height : svgRect.height;
    const scaleX = svgRect.width / vbWidth;
    const scaleY = svgRect.height / vbHeight;

    const startSvgPt = pathEl.getPointAtLength(0);
    const endSvgPt = pathEl.getPointAtLength(totalLen);
    const plotLeft = svgRect.left - stageRect.left + startSvgPt.x * scaleX;
    const plotRight = svgRect.left - stageRect.left + endSvgPt.x * scaleX;

    const gridEl = svgEl.querySelector('.recharts-cartesian-grid');
    const gridRect = gridEl?.getBoundingClientRect();
    const yTop = gridRect ? Math.max(4, gridRect.top - stageRect.top) : 8;
    const yBottom = gridRect
      ? Math.min(stageRect.height - 8, gridRect.bottom - stageRect.top)
      : stageRect.height - 20;

    return {
      stage,
      svgEl,
      pathEl,
      totalLen,
      stageRect,
      svgRect,
      scaleX,
      scaleY,
      plotLeft,
      plotRight,
      yTop,
      yBottom,
    };
  }, []);

  const mapClientXToCurvePoint = useCallback(
    (clientX: number) => {
      const geo = getChartGeometry();
      if (!geo) return null;
      const rawStageX = clientX - geo.stageRect.left;
      const clampedStageX = Math.max(geo.plotLeft, Math.min(geo.plotRight, rawStageX));
      const targetSvgX =
        (clampedStageX - (geo.svgRect.left - geo.stageRect.left)) / geo.scaleX;
      const pt = findPathLengthAtX(geo.pathEl, targetSvgX);
      if (!pt) return null;
      return {
        x: geo.svgRect.left - geo.stageRect.left + pt.x * geo.scaleX,
        y: geo.svgRect.top - geo.stageRect.top + pt.y * geo.scaleY,
        geo,
      };
    },
    [getChartGeometry]
  );

  // Measure stationary marker positions along the curve whenever chart lays out or data changes
  const measureLayout = useCallback(() => {
    const geo = getChartGeometry();
    if (!geo) {
      setPlotLayout(null);
      return;
    }

    const pts = scrubberSeries?.points ?? [];
    const span = Math.max(1, geo.plotRight - geo.plotLeft);
    const markers: MarkerPosition[] = pts.map((point, index) => {
      const ratio = pts.length <= 1 ? 0.5 : index / (pts.length - 1);
      const targetStageX = geo.plotLeft + ratio * span;
      const targetSvgX =
        (targetStageX - (geo.svgRect.left - geo.stageRect.left)) / geo.scaleX;
      const curvePt = findPathLengthAtX(geo.pathEl, targetSvgX);
      const x = curvePt
        ? geo.svgRect.left - geo.stageRect.left + curvePt.x * geo.scaleX
        : targetStageX;
      const y = curvePt
        ? geo.svgRect.top - geo.stageRect.top + curvePt.y * geo.scaleY
        : (geo.yTop + geo.yBottom) * 0.5;
      return { index, x, y, point };
    });

    setPlotLayout({
      plotLeft: geo.plotLeft,
      plotRight: geo.plotRight,
      yTop: geo.yTop,
      yBottom: geo.yBottom,
      stageWidth: geo.stageRect.width,
      stageHeight: geo.stageRect.height,
      markers,
    });
  }, [getChartGeometry, scrubberSeries?.points]);

  useEffect(() => {
    if (!enabled) return;
    const stage = stageRef.current;
    if (!stage) return;

    const raf = window.requestAnimationFrame(measureLayout);
    const timer = window.setTimeout(measureLayout, 180);

    const resizeObs =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => measureLayout()) : null;
    resizeObs?.observe(stage);

    const mutObs =
      typeof MutationObserver !== 'undefined'
        ? new MutationObserver(() => measureLayout())
        : null;
    mutObs?.observe(stage, { childList: true, subtree: true, attributes: true });

    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      resizeObs?.disconnect();
      mutObs?.disconnect();
    };
  }, [enabled, measureLayout]);

  const scrubberActive =
    enabled &&
    (hoverLocalPos !== null || pinnedCurvePos !== null || isDraggingScrubber);
  isInteractingRef.current = scrubberActive;

  // Idle Auto-Moving Point ONLY (NO moving vertical line!)
  useEffect(() => {
    if (!enabled) {
      if (pointerGroupRef.current) {
        pointerGroupRef.current.style.opacity = '0';
      }
      return;
    }

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let animId = 0;
    const startTs = performance.now();

    const renderIdlePoint = (now: number) => {
      const group = pointerGroupRef.current;
      if (!group) return;

      // Hide idle auto-moving point when user scrubber line is actively tracking
      if (isInteractingRef.current) {
        group.style.opacity = '0';
        return;
      }

      const geo = getChartGeometry();
      if (!geo) {
        group.style.opacity = '0';
        return;
      }

      const progress = prefersReduced
        ? 0.85
        : computePointerSweepProgress(now - startTs, cycleMs);
      const sampled = geo.pathEl.getPointAtLength(progress * geo.totalLen);
      if (!sampled || !Number.isFinite(sampled.x) || !Number.isFinite(sampled.y)) {
        group.style.opacity = '0';
        return;
      }

      const x = geo.svgRect.left - geo.stageRect.left + sampled.x * geo.scaleX;
      const y = geo.svgRect.top - geo.stageRect.top + sampled.y * geo.scaleY;
      const strokeCol = geo.pathEl.getAttribute('stroke') || colorRef.current;

      group.style.opacity = '1';
      group.setAttribute('data-pointer-x', x.toFixed(1));
      group.setAttribute('data-pointer-y', y.toFixed(1));

      if (haloRef.current) {
        haloRef.current.setAttribute('cx', x.toFixed(1));
        haloRef.current.setAttribute('cy', y.toFixed(1));
        haloRef.current.setAttribute('fill', strokeCol);
      }
      if (ringRef.current) {
        ringRef.current.setAttribute('cx', x.toFixed(1));
        ringRef.current.setAttribute('cy', y.toFixed(1));
        ringRef.current.setAttribute('stroke', strokeCol);
      }
      if (dotRef.current) {
        dotRef.current.setAttribute('cx', x.toFixed(1));
        dotRef.current.setAttribute('cy', y.toFixed(1));
        dotRef.current.setAttribute('fill', strokeCol);
      }
    };

    const tick = (now: number) => {
      renderIdlePoint(now);
      if (!prefersReduced) {
        animId = window.requestAnimationFrame(tick);
      }
    };

    animId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(animId);
  }, [enabled, cycleMs, getChartGeometry]);

  // Active scrubber position (follows cursor when hovering/dragging; stays at pinnedLocalX when dragged)
  const activeScrubberPos = useMemo(() => {
    if (isDraggingScrubber || hoverLocalPos !== null) {
      return hoverLocalPos ?? pinnedCurvePos;
    }
    return pinnedCurvePos;
  }, [isDraggingScrubber, hoverLocalPos, pinnedCurvePos]);

  const activeScrubberRatio = useMemo(() => {
    if (!activeScrubberPos || !plotLayout) return null;
    const span = Math.max(1, plotLayout.plotRight - plotLayout.plotLeft);
    return clampProgress01((activeScrubberPos.x - plotLayout.plotLeft) / span);
  }, [activeScrubberPos, plotLayout]);

  const scrubberReadout = useMemo(() => {
    if (activeScrubberRatio === null || !scrubberSeries?.points.length) return null;
    return interpolateSeriesAtProgress(
      scrubberSeries.points,
      activeScrubberRatio,
      scrubberSeries.precision ?? 1,
      scrubberSeries.secondaryPrecision ?? 1
    );
  }, [activeScrubberRatio, scrubberSeries]);

  const activeMarkerIdx = hoveredMarkerIdx ?? pinnedMarkerIdx;
  const activeMarker =
    activeMarkerIdx !== null && plotLayout
      ? plotLayout.markers.find((m) => m.index === activeMarkerIdx) ?? null
      : null;

  const updateScrubberAtClientX = (clientX: number, alsoPin = false) => {
    setHoverClientX(clientX);
    const mapped = mapClientXToCurvePoint(clientX);
    if (!mapped) return;
    setHoverLocalPos({ x: mapped.x, y: mapped.y });
    if (alsoPin) {
      setPinnedLocalX(mapped.x);
      setPinnedCurvePos({ x: mapped.x, y: mapped.y });
    }
  };

  const handleStagePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!enabled) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest('[data-overlay-interactive="true"]')) {
      return;
    }
    dragOriginRef.current = { clientX: e.clientX, moved: false };
    setIsDraggingScrubber(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore if capture unsupported
    }
    updateScrubberAtClientX(e.clientX, true);
  };

  const handleStagePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!enabled) return;
    if (isDraggingScrubber && dragOriginRef.current) {
      if (Math.abs(e.clientX - dragOriginRef.current.clientX) >= 4) {
        dragOriginRef.current.moved = true;
      }
      updateScrubberAtClientX(e.clientX, true);
      return;
    }
    // Live hover scan: vertical scrubber line follows cursor smoothly
    updateScrubberAtClientX(e.clientX, false);
  };

  const handleStagePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingScrubber) return;
    setIsDraggingScrubber(false);
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // ignore
    }

    const origin = dragOriginRef.current;
    dragOriginRef.current = null;

    if (origin && !origin.moved && plotLayout && plotLayout.markers.length > 0) {
      // Short click: clear pinned scrubber unless user clicked close to a marker
      const clickX = e.clientX - (stageRef.current?.getBoundingClientRect().left ?? 0);
      let closest: MarkerPosition | null = null;
      let minDist = Infinity;
      for (const m of plotLayout.markers) {
        const d = Math.abs(m.x - clickX);
        if (d < minDist) {
          minDist = d;
          closest = m;
        }
      }
      if (closest && minDist <= 18) {
        setPinnedMarkerIdx((prev) => (prev === closest!.index ? null : closest!.index));
        setPinnedLocalX(null);
        setPinnedCurvePos(null);
      } else {
        setPinnedMarkerIdx(null);
        setPinnedLocalX(null);
        setPinnedCurvePos(null);
      }
    }
  };

  const handleStagePointerLeave = () => {
    if (isDraggingScrubber) return;
    setHoverClientX(null);
    setHoverLocalPos(null);
    setHoveredMarkerIdx(null);
  };

  const handleClearPinnedScrubber = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPinnedLocalX(null);
    setPinnedCurvePos(null);
  };

  const stageW = plotLayout?.stageWidth ?? 420;
  const stageH = plotLayout?.stageHeight ?? 220;
  const lineColor = accentColor;

  return (
    <div
      ref={stageRef}
      data-testid="curve-pointer-stage"
      className={`relative ${enabled ? 'cursor-crosshair' : ''} ${className}`}
      onPointerDown={handleStagePointerDown}
      onPointerMove={handleStagePointerMove}
      onPointerUp={handleStagePointerUp}
      onPointerLeave={handleStagePointerLeave}
      onDoubleClick={() => {
        setPinnedLocalX(null);
        setPinnedCurvePos(null);
        setPinnedMarkerIdx(null);
      }}
    >
      {children}

      {enabled && (
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full overflow-visible z-10"
          aria-hidden="true"
        >
          {/* Idle Auto-Moving Telemetry POINT ONLY — NO vertical line moves automatically */}
          <g
            ref={pointerGroupRef}
            data-testid="moving-curve-pointer"
            style={{ opacity: 0, transition: 'opacity 180ms ease' }}
          >
            <circle
              ref={haloRef}
              cx="0"
              cy="0"
              r="11"
              fill={lineColor}
              fillOpacity="0.16"
            />
            <circle
              ref={ringRef}
              cx="0"
              cy="0"
              r="6.5"
              fill="none"
              stroke={lineColor}
              strokeWidth="1.4"
              strokeOpacity="0.45"
            />
            <circle
              ref={dotRef}
              cx="0"
              cy="0"
              r="4.2"
              fill={lineColor}
              stroke="#FFFFFF"
              strokeWidth="2"
            />
          </g>

          {/* Draggable / Cursor-Following Vertical Scrubber Line */}
          {activeScrubberPos && plotLayout && (
            <g data-testid="chart-scrubber-line" data-scrubber-x={activeScrubberPos.x.toFixed(1)}>
              <line
                x1={activeScrubberPos.x}
                x2={activeScrubberPos.x}
                y1={plotLayout.yTop}
                y2={plotLayout.yBottom}
                stroke={lineColor}
                strokeWidth="1.6"
                strokeDasharray={pinnedLocalX !== null && hoverClientX === null ? 'none' : '4 3'}
                strokeOpacity="0.82"
              />
              <circle
                cx={activeScrubberPos.x}
                cy={activeScrubberPos.y}
                r="9.5"
                fill={lineColor}
                fillOpacity="0.16"
              />
              <circle
                cx={activeScrubberPos.x}
                cy={activeScrubberPos.y}
                r="4.8"
                fill={lineColor}
                stroke="#FFFFFF"
                strokeWidth="2"
              />
            </g>
          )}
        </svg>
      )}

      {/* Draggable Vertical Scrubber Handle + Live-Updating Tooltip */}
      {enabled && activeScrubberPos && plotLayout && (
        <div
          className="pointer-events-none absolute inset-0 z-20"
          aria-live="polite"
        >
          {/* Top Scrubber Drag Pill Handle */}
          <button
            type="button"
            data-overlay-interactive="true"
            data-testid="scrubber-drag-handle"
            aria-label="Drag vertical scrubber across chart"
            onPointerDown={(e) => {
              e.stopPropagation();
              dragOriginRef.current = { clientX: e.clientX, moved: false };
              setIsDraggingScrubber(true);
              stageRef.current?.setPointerCapture?.(e.pointerId);
            }}
            style={{
              left: `${activeScrubberPos.x}px`,
              top: `${Math.max(0, plotLayout.yTop - 8)}px`,
            }}
            className="pointer-events-auto absolute -translate-x-1/2 flex h-4 w-6 cursor-ew-resize items-center justify-center rounded-full border border-[var(--vs-border-strong)] bg-[var(--vs-surface)] shadow-xs"
          >
            <span className="flex gap-0.5">
              <span className="h-2 w-px bg-[var(--vs-accent)]" />
              <span className="h-2 w-px bg-[var(--vs-accent)]" />
            </span>
          </button>

          {/* Live-Updating Scrubber Readout Tooltip (Heart Rate / SpO2 / Timestamp) */}
          {scrubberReadout && !activeMarker && (
            <div
              data-testid="scrubber-tooltip"
              style={{
                left: `${
                  activeScrubberPos.x > stageW * 0.62
                    ? Math.max(8, activeScrubberPos.x - 12)
                    : Math.min(stageW - 8, activeScrubberPos.x + 12)
                }px`,
                top: `${Math.max(4, plotLayout.yTop + 2)}px`,
                transform:
                  activeScrubberPos.x > stageW * 0.62 ? 'translateX(-100%)' : 'translateX(0)',
              }}
              className="pointer-events-none absolute min-w-[162px] max-w-[220px] rounded-xl border border-[var(--vs-border-strong)] bg-[var(--vs-surface)]/95 px-3 py-2 shadow-md backdrop-blur-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono-num text-[10.5px] font-medium text-[var(--vs-text-muted)] truncate">
                  {scrubberReadout.timestamp}
                </span>
                {pinnedLocalX !== null && (
                  <button
                    type="button"
                    data-overlay-interactive="true"
                    onClick={handleClearPinnedScrubber}
                    className="pointer-events-auto rounded px-1 text-[10px] font-semibold text-[var(--vs-accent)] hover:bg-[var(--vs-accent-soft)]"
                  >
                    Unpin
                  </button>
                )}
              </div>

              <div className="mt-1 flex items-baseline justify-between gap-3">
                <span className="text-[11px] font-medium text-[var(--vs-text-secondary)]">
                  {scrubberSeries?.metricLabel}
                </span>
                <span className="vs-kpi-num text-xs font-bold text-[var(--vs-text)]">
                  {scrubberReadout.value}{' '}
                  <span className="text-[10.5px] font-normal text-[var(--vs-text-muted)]">
                    {scrubberSeries?.unit}
                  </span>
                </span>
              </div>

              {scrubberReadout.secondaryValue !== null && scrubberSeries?.secondaryLabel && (
                <div className="mt-0.5 flex items-baseline justify-between gap-3">
                  <span className="text-[11px] font-medium text-[var(--vs-text-secondary)]">
                    {scrubberSeries.secondaryLabel}
                  </span>
                  <span className="vs-kpi-num text-xs font-bold text-[var(--vs-text)]">
                    {scrubberReadout.secondaryValue}{' '}
                    <span className="text-[10.5px] font-normal text-[var(--vs-text-muted)]">
                      {scrubberSeries.secondaryUnit ?? ''}
                    </span>
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Interactive 'Point-at-Pulse' Markers along the stationary curve */}
      {enabled && plotLayout && plotLayout.markers.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-20">
          {plotLayout.markers.map((m) => {
            const isActive = activeMarkerIdx === m.index;
            return (
              <button
                key={`pulse-marker-${m.index}`}
                type="button"
                data-overlay-interactive="true"
                data-testid="point-at-pulse-marker"
                data-point-index={m.index}
                data-point-value={m.point.value}
                aria-label={`${scrubberSeries?.metricLabel ?? 'Reading'} ${m.point.value} ${scrubberSeries?.unit ?? ''} at ${formatPointTimestamp(m.point.timestamp, m.point.label)}`}
                onPointerEnter={() => setHoveredMarkerIdx(m.index)}
                onPointerLeave={() =>
                  setHoveredMarkerIdx((prev) => (prev === m.index ? null : prev))
                }
                onPointerDown={(e) => {
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setPinnedMarkerIdx((prev) => (prev === m.index ? null : m.index));
                }}
                style={{ left: `${m.x}px`, top: `${m.y}px` }}
                className="pointer-events-auto absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vs-accent)]"
              >
                <span
                  className={`block rounded-full transition-all ${
                    isActive
                      ? 'h-3.5 w-3.5 ring-4 ring-[var(--vs-accent)]/25 bg-[var(--vs-surface)] border-2 border-[var(--vs-accent)]'
                      : 'h-2.5 w-2.5 bg-transparent hover:bg-[var(--vs-accent)]/20'
                  }`}
                />
              </button>
            );
          })}
        </div>
      )}

      {/* Point-at-Pulse Exact Value & Timestamp Popover */}
      {enabled && activeMarker && plotLayout && scrubberSeries && (
        <div
          role="dialog"
          aria-label="Point at pulse details"
          data-testid="point-at-pulse-popover"
          data-overlay-interactive="true"
          style={{
            left: `${Math.max(88, Math.min(stageW - 96, activeMarker.x))}px`,
            top: `${
              activeMarker.y > stageH * 0.45
                ? Math.max(8, activeMarker.y - 12)
                : Math.min(stageH - 8, activeMarker.y + 14)
            }px`,
            transform:
              activeMarker.y > stageH * 0.45
                ? 'translate(-50%, -100%)'
                : 'translate(-50%, 0)',
          }}
          className="pointer-events-auto absolute z-30 min-w-[188px] max-w-[238px] rounded-xl border border-[var(--vs-border-strong)] bg-[var(--vs-surface)] px-3.5 py-2.5 shadow-lg"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--vs-accent)]">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: lineColor }}
              />
              Point-at-Pulse
            </span>
            {pinnedMarkerIdx !== null && (
              <button
                type="button"
                aria-label="Close point popover"
                onClick={(e) => {
                  e.stopPropagation();
                  setPinnedMarkerIdx(null);
                  setHoveredMarkerIdx(null);
                }}
                className="rounded p-0.5 text-[var(--vs-text-muted)] hover:bg-[var(--vs-bg-subtle)] hover:text-[var(--vs-text)]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <p className="mt-1 font-mono-num text-[11px] font-medium text-[var(--vs-text-muted)]">
            {formatPointTimestamp(activeMarker.point.timestamp, activeMarker.point.label)}
          </p>

          <div className="mt-1.5 flex items-baseline justify-between gap-3">
            <span className="text-xs font-medium text-[var(--vs-text-secondary)]">
              {scrubberSeries.metricLabel}
            </span>
            <span className="vs-kpi-num text-base font-bold text-[var(--vs-text)]">
              {activeMarker.point.value}{' '}
              <span className="text-xs font-normal text-[var(--vs-text-muted)]">
                {scrubberSeries.unit}
              </span>
            </span>
          </div>

          {typeof activeMarker.point.secondaryValue === 'number' &&
            scrubberSeries.secondaryLabel && (
              <div className="mt-0.5 flex items-baseline justify-between gap-3">
                <span className="text-xs font-medium text-[var(--vs-text-secondary)]">
                  {scrubberSeries.secondaryLabel}
                </span>
                <span className="vs-kpi-num text-xs font-semibold text-[var(--vs-text)]">
                  {activeMarker.point.secondaryValue}{' '}
                  <span className="text-[11px] font-normal text-[var(--vs-text-muted)]">
                    {scrubberSeries.secondaryUnit ?? ''}
                  </span>
                </span>
              </div>
            )}

          {(typeof scrubberSeries.baselineMean === 'number' ||
            typeof activeMarker.point.quality === 'number' ||
            activeMarker.point.note) && (
            <p className="mt-1.5 border-t border-[var(--vs-border)] pt-1 font-mono-num text-[10.5px] text-[var(--vs-text-secondary)]">
              {typeof scrubberSeries.baselineMean === 'number'
                ? (() => {
                    const diff = Number(
                      (activeMarker.point.value - scrubberSeries.baselineMean).toFixed(
                        scrubberSeries.precision ?? 1
                      )
                    );
                    return `${diff > 0 ? `+${diff}` : diff} ${scrubberSeries.unit} vs. normal`;
                  })()
                : activeMarker.point.note ?? `Quality ${activeMarker.point.quality}/100`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
