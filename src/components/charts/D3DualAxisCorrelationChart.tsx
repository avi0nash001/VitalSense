import { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { Activity, Layers, StickyNote, Thermometer } from 'lucide-react';
import { buildThirtyDayCalibrationBand } from '../../lib/baselineCalibration';
import {
  buildDualAxisCorrelationSeries,
  CORRELATION_METRICS,
  SEVERITY_LABELS,
  summarizeSymptomBiometricCorrelation,
  type CorrelationMetricKey,
  type CorrelationOverlayMode,
  type DualAxisCorrelationPoint,
} from '../../lib/symptomCorrelation';
import type {
  ChartAnnotation,
  MetricBaseline,
  MetricKey,
  SymptomLog,
  SymptomSeverity,
  VitalReading,
} from '../../lib/types';
import { SurfaceCard } from '../ui/Primitives';

interface D3DualAxisCorrelationChartProps {
  readings: VitalReading[];
  baselines: Record<MetricKey, MetricBaseline> | null;
  symptoms: SymptomLog[];
  annotations: ChartAnnotation[];
  onSelectDate?: (dateKey: string) => void;
}

const CHART_HEIGHT = 316;
const MARGIN = { top: 28, right: 56, bottom: 38, left: 52 };

export function D3DualAxisCorrelationChart({
  readings,
  baselines,
  symptoms,
  annotations,
  onSelectDate,
}: D3DualAxisCorrelationChartProps) {
  const [selectedMetric, setSelectedMetric] =
    useState<CorrelationMetricKey>('heartRate');
  const [overlayMode, setOverlayMode] =
    useState<CorrelationOverlayMode>('combined');
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(680);

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.floor(entry.contentRect.width);
        if (w > 240) setContainerWidth(w);
      }
    });
    observer.observe(el);
    setContainerWidth(Math.max(320, Math.floor(el.clientWidth || 680)));
    return () => observer.disconnect();
  }, []);

  const points = useMemo(
    () =>
      buildDualAxisCorrelationSeries({
        readings,
        metric: selectedMetric,
        symptoms,
        annotations,
      }),
    [readings, selectedMetric, symptoms, annotations]
  );

  const metricMeta = CORRELATION_METRICS[selectedMetric];

  const metricBaselineMean = useMemo(() => {
    if (selectedMetric === 'sleepHours') {
      const vals = points
        .map((p) => p.metricValue)
        .filter((v): v is number => v !== null);
      if (vals.length === 0) return 7.2;
      return Number(
        (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)
      );
    }
    return baselines?.[selectedMetric]?.mean ?? null;
  }, [baselines, points, selectedMetric]);

  const calibrationBand = useMemo(() => {
    if (selectedMetric === 'sleepHours') {
      return { low: 6.8, high: 8.0, mean: metricBaselineMean };
    }
    const band = buildThirtyDayCalibrationBand({
      readings,
      metric: selectedMetric,
      mode: 'typical',
      fallbackBaseline: baselines?.[selectedMetric] ?? null,
    });
    return {
      low: band.activeLow,
      high: band.activeHigh,
      mean: band.mean,
    };
  }, [baselines, metricBaselineMean, readings, selectedMetric]);

  const correlationSummary = useMemo(
    () =>
      summarizeSymptomBiometricCorrelation(
        points,
        selectedMetric,
        metricBaselineMean
      ),
    [metricBaselineMean, points, selectedMetric]
  );

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();

    const width = Math.max(320, containerWidth);
    const height = CHART_HEIGHT;
    const innerW = Math.max(120, width - MARGIN.left - MARGIN.right);
    const innerH = Math.max(120, height - MARGIN.top - MARGIN.bottom);

    svg.attr('viewBox', `0 0 ${width} ${height}`);

    if (points.length === 0) return;

    const root = svg
      .append('g')
      .attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

    // X Scale
    const xScale = d3
      .scalePoint<string>()
      .domain(points.map((p) => p.dateKey))
      .range([0, innerW])
      .padding(0.45);

    // Left Y Scale (Biometric Metric)
    const validMetricVals = points
      .map((p) => p.metricValue)
      .filter((v): v is number => v !== null);
    if (calibrationBand.low !== null) validMetricVals.push(calibrationBand.low);
    if (calibrationBand.high !== null) validMetricVals.push(calibrationBand.high);
    if (calibrationBand.mean !== null) validMetricVals.push(calibrationBand.mean);

    const minY = validMetricVals.length > 0 ? Math.min(...validMetricVals) : 50;
    const maxY = validMetricVals.length > 0 ? Math.max(...validMetricVals) : 90;
    const yPad = Math.max((maxY - minY) * 0.22, selectedMetric === 'spo2' ? 0.6 : 2.5);

    const yLeft = d3
      .scaleLinear()
      .domain([minY - yPad, maxY + yPad])
      .nice()
      .range([innerH, 0]);

    // Right Y Scale (Symptom Severity 0..5 OR Daily Steps)
    const maxSteps = Math.max(
      10000,
      d3.max(points, (p) => p.steps ?? 0) ?? 10000
    );
    const yRightSteps = d3
      .scaleLinear()
      .domain([0, Math.ceil(maxSteps / 2000) * 2000])
      .range([innerH, 0]);

    const yRightSymptoms = d3
      .scaleLinear()
      .domain([0, 5.5])
      .range([innerH, 0]);

    const useStepsOnRight = overlayMode === 'steps';

    // Gridlines
    root
      .append('g')
      .attr('class', 'd3-gridlines')
      .call(
        d3
          .axisLeft(yLeft)
          .ticks(5)
          .tickSize(-innerW)
          .tickFormat(() => '')
      )
      .call((g) => g.select('.domain').remove())
      .call((g) =>
        g
          .selectAll('line')
          .attr('stroke', 'currentColor')
          .attr('stroke-opacity', 0.1)
          .attr('stroke-dasharray', '3,3')
      );

    // 30-Day Normal Band
    if (calibrationBand.low !== null && calibrationBand.high !== null) {
      const bandTop = yLeft(calibrationBand.high);
      const bandBottom = yLeft(calibrationBand.low);
      root
        .append('rect')
        .attr('x', 0)
        .attr('y', bandTop)
        .attr('width', innerW)
        .attr('height', Math.max(2, bandBottom - bandTop))
        .attr('rx', 4)
        .attr('fill', metricMeta.color)
        .attr('fill-opacity', 0.08);
    }

    // Personal Normal Dashed Line
    if (calibrationBand.mean !== null) {
      root
        .append('line')
        .attr('x1', 0)
        .attr('x2', innerW)
        .attr('y1', yLeft(calibrationBand.mean))
        .attr('y2', yLeft(calibrationBand.mean))
        .attr('stroke', metricMeta.color)
        .attr('stroke-opacity', 0.45)
        .attr('stroke-width', 1.25)
        .attr('stroke-dasharray', '5,4');
    }

    // Right-Axis Bars: Steps (background when combined or primary when steps)
    const stepBarWidth = Math.max(
      8,
      Math.min(18, (innerW / Math.max(points.length, 1)) * 0.42)
    );

    if (overlayMode === 'steps' || overlayMode === 'combined') {
      root
        .selectAll('rect.d3-steps-bar')
        .data(points.filter((p) => p.steps !== null))
        .join('rect')
        .attr('class', 'd3-steps-bar')
        .attr('x', (d) => (xScale(d.dateKey) ?? 0) - stepBarWidth / 2)
        .attr('y', (d) =>
          overlayMode === 'combined'
            ? innerH - (innerH - yRightSteps(d.steps ?? 0)) * 0.45
            : yRightSteps(d.steps ?? 0)
        )
        .attr('width', stepBarWidth)
        .attr('height', (d) =>
          overlayMode === 'combined'
            ? Math.max(2, (innerH - yRightSteps(d.steps ?? 0)) * 0.45)
            : Math.max(2, innerH - yRightSteps(d.steps ?? 0))
        )
        .attr('rx', 3)
        .attr('fill', '#10B981')
        .attr('fill-opacity', overlayMode === 'steps' ? 0.28 : 0.14);
    }

    // Right-Axis Bars: Symptom Severity (0..5)
    if (overlayMode === 'symptoms' || overlayMode === 'combined') {
      const symBarWidth = Math.max(
        7,
        Math.min(14, (innerW / Math.max(points.length, 1)) * 0.34)
      );
      root
        .selectAll('rect.d3-symptom-bar')
        .data(points.filter((p) => p.maxSymptomSeverity > 0))
        .join('rect')
        .attr('class', 'd3-symptom-bar')
        .attr('data-testid', 'd3-symptom-bar')
        .attr('x', (d) => (xScale(d.dateKey) ?? 0) - symBarWidth / 2)
        .attr('y', (d) => yRightSymptoms(d.maxSymptomSeverity))
        .attr('width', symBarWidth)
        .attr('height', (d) =>
          Math.max(4, innerH - yRightSymptoms(d.maxSymptomSeverity))
        )
        .attr('rx', 4)
        .attr('fill', '#D97706')
        .attr('fill-opacity', 0.28)
        .attr('stroke', '#D97706')
        .attr('stroke-opacity', 0.65)
        .attr('stroke-width', 1);
    }

    // Left-Axis Area & Stationary Curve
    const defs = svg.append('defs');
    const gradId = `d3-area-grad-${selectedMetric}`;
    const grad = defs
      .append('linearGradient')
      .attr('id', gradId)
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%');
    grad
      .append('stop')
      .attr('offset', '0%')
      .attr('stop-color', metricMeta.color)
      .attr('stop-opacity', 0.22);
    grad
      .append('stop')
      .attr('offset', '100%')
      .attr('stop-color', metricMeta.color)
      .attr('stop-opacity', 0.01);

    const areaGen = d3
      .area<DualAxisCorrelationPoint>()
      .defined((d) => d.metricValue !== null)
      .x((d) => xScale(d.dateKey) ?? 0)
      .y0(innerH)
      .y1((d) => yLeft(d.metricValue as number))
      .curve(d3.curveMonotoneX);

    const lineGen = d3
      .line<DualAxisCorrelationPoint>()
      .defined((d) => d.metricValue !== null)
      .x((d) => xScale(d.dateKey) ?? 0)
      .y((d) => yLeft(d.metricValue as number))
      .curve(d3.curveMonotoneX);

    root
      .append('path')
      .datum(points)
      .attr('d', areaGen)
      .attr('fill', `url(#${gradId})`);

    root
      .append('path')
      .datum(points)
      .attr('d', lineGen)
      .attr('fill', 'none')
      .attr('stroke', metricMeta.color)
      .attr('stroke-width', 2.5)
      .attr('stroke-linecap', 'round');

    // Data point dots + Symptom / Context badges on curve
    const validPoints = points.filter((p) => p.metricValue !== null);
    root
      .selectAll('circle.d3-metric-dot')
      .data(validPoints)
      .join('circle')
      .attr('class', 'd3-metric-dot')
      .attr('cx', (d) => xScale(d.dateKey) ?? 0)
      .attr('cy', (d) => yLeft(d.metricValue as number))
      .attr('r', (d) => (d.symptomCount > 0 ? 5.5 : d.annotations.length > 0 ? 4.5 : 3))
      .attr('fill', (d) =>
        d.symptomCount > 0
          ? '#D97706'
          : d.annotations.length > 0
            ? '#7C3AED'
            : '#FFFFFF'
      )
      .attr('stroke', (d) =>
        d.symptomCount > 0 ? '#FFFFFF' : metricMeta.color
      )
      .attr('stroke-width', (d) => (d.symptomCount > 0 ? 2 : 1.75));

    // Context Note Diamond Pins above curve points
    const notePoints = validPoints.filter((d) => d.annotations.length > 0);
    root
      .selectAll('rect.d3-note-diamond')
      .data(notePoints)
      .join('rect')
      .attr('class', 'd3-note-diamond')
      .attr('x', -4)
      .attr('y', -4)
      .attr('width', 8)
      .attr('height', 8)
      .attr('rx', 1.5)
      .attr('transform', (d) => {
        const cx = xScale(d.dateKey) ?? 0;
        const cy = Math.max(10, yLeft(d.metricValue as number) - 14);
        return `translate(${cx},${cy}) rotate(45)`;
      })
      .attr('fill', '#7C3AED')
      .attr('stroke', '#FFFFFF')
      .attr('stroke-width', 1.25);

    // X Axis
    const maxXTicks = innerW < 340 ? 4 : 7;
    const tickStride = Math.max(1, Math.ceil(points.length / maxXTicks));
    const tickValues = points
      .filter((_, idx) => {
        if (idx === points.length - 1) return true;
        if (idx % tickStride !== 0) return false;
        return points.length - 1 - idx >= Math.max(2, Math.floor(tickStride * 0.6));
      })
      .map((p) => p.dateKey);

    root
      .append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(
        d3
          .axisBottom(xScale)
          .tickValues(tickValues)
          .tickFormat((dk) => points.find((p) => p.dateKey === dk)?.label ?? dk)
      )
      .call((g) => g.select('.domain').attr('stroke-opacity', 0.2))
      .call((g) => g.selectAll('.tick line').attr('stroke-opacity', 0.2))
      .call((g) =>
        g
          .selectAll('text')
          .attr('font-size', '11px')
          .attr('fill', 'currentColor')
          .attr('fill-opacity', 0.72)
      );

    // Left Y Axis
    root
      .append('g')
      .attr('data-testid', 'd3-left-axis')
      .call(d3.axisLeft(yLeft).ticks(5))
      .call((g) => g.select('.domain').attr('stroke', metricMeta.color).attr('stroke-opacity', 0.35))
      .call((g) => g.selectAll('.tick line').attr('stroke', metricMeta.color).attr('stroke-opacity', 0.35))
      .call((g) =>
        g
          .selectAll('text')
          .attr('font-size', '11px')
          .attr('font-weight', '600')
          .attr('fill', metricMeta.color)
      );

    // Left Axis Title
    root
      .append('text')
      .attr('x', 0)
      .attr('y', -12)
      .attr('font-size', '10px')
      .attr('font-weight', '600')
      .attr('fill', metricMeta.color)
      .text(`${metricMeta.shortLabel} (${metricMeta.unit})`);

    // Right Y Axis
    const rightAxisGen = useStepsOnRight
      ? d3
          .axisRight(yRightSteps)
          .ticks(4)
          .tickFormat((d) => `${Math.round(Number(d) / 1000)}k`)
      : d3
          .axisRight(yRightSymptoms)
          .tickValues([0, 1, 2, 3, 4, 5])
          .tickFormat((d) => `${Number(d)}`);

    const rightColor = useStepsOnRight ? '#059669' : '#D97706';

    root
      .append('g')
      .attr('data-testid', 'd3-right-axis')
      .attr('transform', `translate(${innerW},0)`)
      .call(rightAxisGen)
      .call((g) => g.select('.domain').attr('stroke', rightColor).attr('stroke-opacity', 0.35))
      .call((g) => g.selectAll('.tick line').attr('stroke', rightColor).attr('stroke-opacity', 0.35))
      .call((g) =>
        g
          .selectAll('text')
          .attr('font-size', '11px')
          .attr('font-weight', '600')
          .attr('fill', rightColor)
      );

    // Right Axis Title
    root
      .append('text')
      .attr('x', innerW)
      .attr('y', -12)
      .attr('text-anchor', 'end')
      .attr('font-size', '10px')
      .attr('font-weight', '600')
      .attr('fill', rightColor)
      .text(useStepsOnRight ? 'Daily Steps' : 'Symptom Intensity (1–5)');

    // Active Crosshair Highlight
    if (hoveredIndex !== null && points[hoveredIndex]) {
      const activePt = points[hoveredIndex];
      const cx = xScale(activePt.dateKey) ?? 0;
      root
        .append('line')
        .attr('x1', cx)
        .attr('x2', cx)
        .attr('y1', 0)
        .attr('y2', innerH)
        .attr('stroke', 'currentColor')
        .attr('stroke-opacity', 0.35)
        .attr('stroke-width', 1.25)
        .attr('stroke-dasharray', '3,3');
    }

    // Invisible Hit Columns for clean hover & click interaction
    const colWidth = Math.max(16, innerW / Math.max(points.length, 1));
    root
      .selectAll('rect.d3-hit-col')
      .data(points)
      .join('rect')
      .attr('class', 'd3-hit-col')
      .attr('x', (d) => (xScale(d.dateKey) ?? 0) - colWidth / 2)
      .attr('y', 0)
      .attr('width', colWidth)
      .attr('height', innerH)
      .attr('fill', 'transparent')
      .style('cursor', 'pointer')
      .on('mouseenter', (_event, d) => {
        const idx = points.findIndex((p) => p.dateKey === d.dateKey);
        if (idx >= 0) setHoveredIndex(idx);
      })
      .on('click', (_event, d) => {
        const idx = points.findIndex((p) => p.dateKey === d.dateKey);
        if (idx >= 0) setHoveredIndex(idx);
        onSelectDate?.(d.dateKey);
      });
  }, [
    calibrationBand.high,
    calibrationBand.low,
    calibrationBand.mean,
    containerWidth,
    hoveredIndex,
    metricMeta.color,
    metricMeta.shortLabel,
    metricMeta.unit,
    onSelectDate,
    overlayMode,
    points,
    selectedMetric,
  ]);

  const activePoint =
    hoveredIndex !== null && points[hoveredIndex]
      ? points[hoveredIndex]
      : points.find((p) => p.symptomCount > 0) ?? points[points.length - 1] ?? null;

  return (
    <SurfaceCard className="p-6 space-y-5" data-testid="d3-dual-axis-card">
      <div className="flex flex-col gap-4 border-b border-[var(--vs-border)] pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-[var(--vs-accent)]">
            <Layers className="h-4 w-4" />
            Dual-Axis Biometric &amp; Symptom Correlation (D3)
          </div>
          <h2 className="font-display text-lg font-semibold text-[var(--vs-text)]">
            Compare Wearable Readings With Feelings &amp; Daily Activity
          </h2>
          <p className="text-xs text-[var(--vs-text-secondary)]">
            Left axis tracks your wearable curve and normal range; right axis overlays logged symptoms (1–5) and daily steps.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 shrink-0">
          {(Object.keys(CORRELATION_METRICS) as CorrelationMetricKey[]).map((key) => {
            const m = CORRELATION_METRICS[key];
            const active = selectedMetric === key;
            return (
              <button
                key={key}
                type="button"
                data-testid={`d3-metric-btn-${key}`}
                onClick={() => setSelectedMetric(key)}
                className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'border-[var(--vs-accent)] bg-[var(--vs-accent-soft)] text-[var(--vs-accent-soft-text)]'
                    : 'border-[var(--vs-border)] bg-[var(--vs-surface-muted)] text-[var(--vs-text-secondary)] hover:text-[var(--vs-text)]'
                }`}
              >
                {m.shortLabel}
              </button>
            );
          })}
        </div>
      </div>

      {/* Overlay Mode Controls + Quantitative Correlation Summary */}
      <div className="flex flex-col gap-2.5 2xl:flex-row 2xl:items-center 2xl:justify-between">
        <div
          data-testid="d3-overlay-tabs"
          className="inline-flex w-fit max-w-full flex-nowrap items-center gap-1 rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface-muted)] p-1"
          role="group"
          aria-label="Right axis overlay mode"
        >
          {(
            [
              { id: 'combined', label: 'All Context' },
              { id: 'symptoms', label: 'Symptoms (1–5)' },
              { id: 'steps', label: 'Daily Steps' },
            ] as const
          ).map((tab) => {
            const active = overlayMode === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                data-testid={`d3-overlay-btn-${tab.id}`}
                onClick={() => setOverlayMode(tab.id)}
                className={`rounded-lg px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-[var(--vs-surface)] text-[var(--vs-text)] shadow-xs'
                    : 'text-[var(--vs-text-secondary)] hover:text-[var(--vs-text)]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          {correlationSummary.symptomDayAvg !== null && (
            <span className="font-mono-num text-[var(--vs-text)]">
              Symptom days avg:{' '}
              <strong className="text-amber-700 dark:text-amber-400">
                {correlationSummary.symptomDayAvg} {correlationSummary.unit}
              </strong>
            </span>
          )}
          {correlationSummary.symptomFreeDayAvg !== null && (
            <span className="font-mono-num text-[var(--vs-text-secondary)]">
              Calm days avg:{' '}
              <strong>
                {correlationSummary.symptomFreeDayAvg} {correlationSummary.unit}
              </strong>
            </span>
          )}
        </div>
      </div>

      {/* D3 Dual-Axis SVG Viewport */}
      <div
        ref={wrapperRef}
        className="relative rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface-muted)]/60 p-3 text-[var(--vs-text)]"
        onMouseLeave={() => setHoveredIndex(null)}
      >
        <svg
          ref={svgRef}
          data-testid="d3-dual-axis-chart"
          role="img"
          aria-label={`Dual-axis D3 chart comparing ${metricMeta.label} with logged symptoms and daily activity`}
          className="w-full h-[316px] overflow-visible block"
        />

        {/* Legend */}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--vs-border)] pt-2.5 text-[11px] text-[var(--vs-text-secondary)]">
          <div className="flex flex-wrap items-center gap-4">
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: metricMeta.color }}
              />
              {metricMeta.shortLabel} ({metricMeta.unit})
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-xs bg-amber-500/70 border border-amber-600" />
              Logged Feeling Intensity (1–5)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-xs bg-emerald-500/45" />
              Daily Steps
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rotate-45 rounded-[2px] bg-violet-600" />
              Context Note
            </span>
          </div>
          <span className="text-[var(--vs-text-muted)]">
            Hover or click any day to inspect paired readings
          </span>
        </div>
      </div>

      {/* Selected / Hovered Day Detail Bar + Correlation Pattern Summary */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {activePoint && (
          <div
            data-testid="d3-correlation-tooltip"
            className="lg:col-span-5 rounded-xl border border-[var(--vs-border)] bg-[var(--vs-bg-subtle)] p-4 space-y-2"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono-num text-xs font-semibold text-[var(--vs-accent)]">
                {activePoint.label} ({activePoint.dateKey})
              </span>
              <span className="font-mono-num text-xs text-[var(--vs-text-muted)]">
                {activePoint.steps !== null
                  ? `${activePoint.steps.toLocaleString()} steps`
                  : 'Steps N/A'}
              </span>
            </div>

            <p className="font-mono-num text-base font-bold text-[var(--vs-text)]">
              {activePoint.metricValue !== null
                ? `${activePoint.metricValue} ${metricMeta.unit}`
                : 'No reading'}{' '}
              <span className="text-xs font-normal text-[var(--vs-text-muted)]">
                {metricMeta.shortLabel}
              </span>
            </p>

            {activePoint.symptoms.length > 0 ? (
              <div className="space-y-1 pt-1">
                {activePoint.symptoms.map((sym) => (
                  <div
                    key={sym.id}
                    className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-950"
                  >
                    <Thermometer className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" />
                    <div>
                      <span className="font-semibold">{sym.symptom}</span> ·{' '}
                      <span className="font-mono-num">
                        {sym.severity}/5 ({SEVERITY_LABELS[sym.severity as SymptomSeverity]})
                      </span>
                      {sym.activityContext && (
                        <span className="text-amber-800"> · {sym.activityContext}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[var(--vs-text-muted)]">
                No symptoms logged on this day. Click this day on the chart to pre-fill the Symptom Logger.
              </p>
            )}

            {activePoint.annotations.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {activePoint.annotations.map((ann) => (
                  <span
                    key={ann.id}
                    className="inline-flex items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] text-violet-900"
                  >
                    <StickyNote className="h-3 w-3" />
                    {ann.note}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        <div
          data-testid="d3-correlation-summary"
          className="lg:col-span-7 rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface-muted)] p-4 flex flex-col justify-between gap-2"
        >
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--vs-accent)]">
              <Activity className="h-3.5 w-3.5" />
              Pattern Correlation Summary
            </div>
            <p className="text-sm font-semibold text-[var(--vs-text)]">
              {correlationSummary.headline}
            </p>
            <p className="text-xs leading-relaxed text-[var(--vs-text-secondary)]">
              {correlationSummary.detail}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4 border-t border-[var(--vs-border)] pt-2.5 font-mono-num text-[11px] text-[var(--vs-text-muted)]">
            <span>{correlationSummary.totalSymptomsLogged} total feeling(s) logged</span>
            <span>·</span>
            <span>{annotations.length} chart context note(s)</span>
            <span>·</span>
            <span>{points.length} days plotted</span>
          </div>
        </div>
      </div>
    </SurfaceCard>
  );
}
