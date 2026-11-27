import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useTheme } from '../../context/ThemeContext';
import type {
  ChartAnnotation,
  ChartAnnotationCategory,
  MetricKey,
  VitalReading,
} from '../../lib/types';
import { matchAnnotationsForPoint } from '../../lib/chartAnnotations';
import { METRIC_DEFINITIONS } from '../../lib/vitalsEngine';
import { formatShortDate } from '../ui/Primitives';
import { GlassRechartsFrame } from './GlassChartShell';
import { buildGlassChartTheme } from './streamingChartUtils';

interface CalibrationBandInput {
  low: number | null;
  high: number | null;
  mean: number | null;
  modeLabel?: string;
}

interface VitalTrendChartProps {
  readings: VitalReading[];
  metric: MetricKey;
  baselineMean?: number | null;
  baselineStdDev?: number | null;
  calibrationBand?: CalibrationBandInput | null;
  showCalibrationBand?: boolean;
  height?: number;
  accentColor?: string;
  annotations?: ChartAnnotation[];
  onAddAnnotation?: (params: {
    timestamp: string;
    note: string;
    category?: ChartAnnotationCategory;
  }) => Promise<void> | void;
  onDeleteAnnotation?: (id: string) => Promise<void> | void;
  isSavingAnnotation?: boolean;
}

export function VitalTrendChart({
  readings,
  metric,
  baselineMean = null,
  baselineStdDev = null,
  calibrationBand = null,
  showCalibrationBand = true,
  height = 272,
  accentColor,
  annotations = [],
  onAddAnnotation,
  onDeleteAnnotation,
  isSavingAnnotation = false,
}: VitalTrendChartProps) {
  const { theme } = useTheme();
  const def = METRIC_DEFINITIONS[metric];
  const glassTheme = buildGlassChartTheme(theme.tokens, accentColor);
  const { strokeColor, bandColor, gridColor, refColor, tickColor, tickStyle } = glassTheme;

  const filteredReadings = readings.filter(
    (r) => typeof r[metric] === 'number' && Number.isFinite(r[metric])
  );

  const data = filteredReadings.map((r) => ({
    date: formatShortDate(r.timestamp),
    rawDate: r.timestamp,
    value: r[metric] as number,
    spo2Value: typeof r.spo2 === 'number' && Number.isFinite(r.spo2) ? r.spo2 : null,
    hrValue:
      typeof r.heartRate === 'number' && Number.isFinite(r.heartRate) ? r.heartRate : null,
    quality: r.qualityScore,
    source: r.source,
  }));

  if (data.length === 0) {
    return (
      <div
        className="vs-glass-chart-pane flex items-center justify-center rounded-xl text-sm text-[var(--vs-text-muted)]"
        style={{ height }}
      >
        No readings available for {def.label}
      </div>
    );
  }

  const effectiveMean = calibrationBand?.mean ?? baselineMean;
  const bandLow =
    calibrationBand && calibrationBand.low !== null
      ? calibrationBand.low
      : baselineMean !== null && baselineStdDev !== null
        ? baselineMean - Math.max(baselineStdDev, def.minFloorStd * 0.6)
        : null;
  const bandHigh =
    calibrationBand && calibrationBand.high !== null
      ? calibrationBand.high
      : baselineMean !== null && baselineStdDev !== null
        ? baselineMean + Math.max(baselineStdDev, def.minFloorStd * 0.6)
        : null;

  const vals = data.map((d) => d.value);
  if (effectiveMean !== null) vals.push(effectiveMean);
  if (showCalibrationBand && bandLow !== null && bandHigh !== null) {
    vals.push(bandLow, bandHigh);
  }
  const minVal = Math.min(...vals);
  const maxVal = Math.max(...vals);
  const pad = Math.max((maxVal - minVal) * 0.22, def.minFloorStd * 1.2);

  const gradientId = `vitalGrad_${metric}_${theme.id}`;
  const lastIndex = data.length - 1;
  const hasVisibleBand = showCalibrationBand && bandLow !== null && bandHigh !== null;

  const scrubberSeries = {
    metricLabel: def.shortLabel,
    unit: def.unit,
    precision: def.precision,
    secondaryLabel: metric === 'spo2' ? 'Heart Rate' : 'SpO₂',
    secondaryUnit: metric === 'spo2' ? 'bpm' : '%',
    secondaryPrecision: 1,
    baselineMean: effectiveMean,
    points: data.map((d) => {
      const pointAnnotations = matchAnnotationsForPoint({
        annotations,
        timestamp: d.rawDate,
        metric,
      });
      return {
        label: d.date,
        timestamp: d.rawDate,
        value: d.value,
        secondaryValue: metric === 'spo2' ? d.hrValue : d.spo2Value,
        quality: d.quality,
        annotations: pointAnnotations,
      };
    }),
  };

  const headerLeft = hasVisibleBand ? (
    <span className="inline-flex items-center gap-2 text-xs text-[var(--vs-text-secondary)]">
      <span
        className="inline-block h-2.5 w-4 rounded-xs border"
        style={{
          backgroundColor: bandColor,
          opacity: 0.35,
          borderColor: bandColor,
        }}
      />
      <span>
        Shaded: {calibrationBand?.modeLabel ?? '30-Day Range'} ({bandLow}–{bandHigh} {def.unit})
      </span>
    </span>
  ) : (
    <span className="text-xs text-[var(--vs-text-muted)]">30-day shaded band hidden</span>
  );

  return (
    <GlassRechartsFrame
      accentColor={strokeColor}
      height={height}
      headerLeft={headerLeft}
      headerRight="Click dot to add note · Drag line to scrub"
      scrubberSeries={scrubberSeries}
      annotationHandlers={
        onAddAnnotation || onDeleteAnnotation
          ? {
              onAddNote: onAddAnnotation,
              onDeleteNote: onDeleteAnnotation,
              isSaving: isSavingAnnotation,
            }
          : undefined
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 14, right: 24, left: -4, bottom: 4 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={strokeColor} stopOpacity={0.14} />
              <stop offset="95%" stopColor={strokeColor} stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
          <XAxis
            dataKey="date"
            padding={{ left: 10, right: 16 }}
            tick={tickStyle}
            tickLine={false}
            axisLine={{ stroke: gridColor }}
            minTickGap={24}
          />
          <YAxis
            domain={[
              Number((minVal - pad).toFixed(def.precision)),
              Number((maxVal + pad).toFixed(def.precision)),
            ]}
            tick={tickStyle}
            tickLine={false}
            axisLine={false}
            width={58}
          />
          <Tooltip content={() => null} />
          {hasVisibleBand && (
            <ReferenceArea
              y1={bandLow}
              y2={bandHigh}
              fill={bandColor}
              fillOpacity={0.16}
              stroke={bandColor}
              strokeOpacity={0.38}
              strokeDasharray="3 3"
              ifOverflow="extendDomain"
            />
          )}
          {effectiveMean !== null && (
            <ReferenceLine
              y={effectiveMean}
              stroke={refColor}
              strokeDasharray="4 4"
              strokeOpacity={0.55}
              label={{
                value: `Avg ${effectiveMean}`,
                position: 'insideBottomLeft',
                fill: tickColor,
                fontSize: 11.5,
                fontWeight: 600,
                fontFamily: 'IBM Plex Mono, monospace',
              }}
            />
          )}
          <Area
            type="monotone"
            dataKey="value"
            stroke={strokeColor}
            strokeWidth={2.2}
            fill={`url(#${gradientId})`}
            dot={(dotProps) => {
              const { cx, cy, index } = dotProps;
              if (typeof cx !== 'number' || typeof cy !== 'number') return null;
              const isLast = index === lastIndex;
              return (
                <circle
                  key={`dot-${index}`}
                  cx={cx}
                  cy={cy}
                  r={isLast ? 4.5 : 2.6}
                  fill={isLast ? strokeColor : glassTheme.surfaceColor}
                  stroke={strokeColor}
                  strokeWidth={isLast ? 2 : 1.6}
                />
              );
            }}
            activeDot={{
              r: 5,
              fill: strokeColor,
              stroke: glassTheme.surfaceColor,
              strokeWidth: 2,
            }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </GlassRechartsFrame>
  );
}
