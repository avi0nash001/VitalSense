import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useTheme } from '../../context/ThemeContext';
import type { VitalReading } from '../../lib/types';
import { formatShortDate } from '../ui/Primitives';
import { GlassChartTooltip, GlassRechartsFrame } from './GlassChartShell';
import { buildGlassChartTheme } from './streamingChartUtils';

interface SleepPatternChartProps {
  readings: VitalReading[];
  targetHours?: number;
  height?: number;
}

export function SleepPatternChart({
  readings,
  targetHours = 7.0,
  height = 240,
}: SleepPatternChartProps) {
  const { theme } = useTheme();
  const chartTheme = buildGlassChartTheme(theme.tokens, '#4F46E5');

  const data = readings
    .filter((r) => typeof r.sleepHours === 'number' && Number.isFinite(r.sleepHours))
    .map((r) => ({
      date: formatShortDate(r.timestamp),
      hours: Number((r.sleepHours as number).toFixed(1)),
    }));

  if (data.length === 0) {
    return (
      <div
        className="vs-glass-chart-pane flex items-center justify-center rounded-xl px-4 text-center text-sm text-[var(--vs-text-muted)]"
        style={{ height }}
      >
        No nightly sleep duration values are included in this dataset yet.
      </div>
    );
  }

  return (
    <GlassRechartsFrame height={height}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 14, right: 20, left: -10, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartTheme.gridColor} />
          <XAxis
            dataKey="date"
            tick={chartTheme.tickStyle}
            tickLine={false}
            axisLine={{ stroke: chartTheme.gridColor }}
            minTickGap={20}
          />
          <YAxis
            domain={[0, 10]}
            tick={chartTheme.tickStyle}
            tickLine={false}
            axisLine={false}
            width={44}
            unit="h"
          />
          <Tooltip
            cursor={{ fill: 'rgba(99, 102, 241, 0.08)' }}
            content={({ active, payload }) => {
              if (!active || !payload || payload.length === 0) return null;
              const point = payload[0].payload as (typeof data)[number];
              const diff = Number((point.hours - targetHours).toFixed(1));
              return (
                <GlassChartTooltip
                  title={point.date}
                  items={[
                    {
                      label: 'Sleep duration',
                      value: point.hours,
                      unit: 'hrs',
                      color: point.hours < 6 ? '#D97706' : '#4F46E5',
                    },
                  ]}
                  footnote={
                    diff === 0
                      ? 'Right on your usual sleep target'
                      : `${diff > 0 ? `+${diff}` : diff} hrs vs. ${targetHours.toFixed(1)} hrs usual`
                  }
                />
              );
            }}
          />
          <ReferenceLine
            y={targetHours}
            stroke={chartTheme.refColor}
            strokeDasharray="4 4"
            strokeOpacity={0.45}
            label={{
              value: `Usual ${targetHours.toFixed(1)}h`,
              position: 'insideTopRight',
              fill: chartTheme.tickColor,
              fontSize: 11.5,
              fontWeight: 600,
              fontFamily: 'IBM Plex Mono, monospace',
            }}
          />
          <Bar dataKey="hours" radius={[4, 4, 0, 0]} maxBarSize={26}>
            {data.map((entry, idx) => (
              <Cell
                key={`sleep-${idx}`}
                fill={entry.hours < 6 ? '#D97706' : '#4F46E5'}
                fillOpacity={entry.hours < 6 ? 0.88 : 0.84}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </GlassRechartsFrame>
  );
}

interface DailyStepsBarChartProps {
  readings: VitalReading[];
  usualSteps?: number;
  height?: number;
}

export function DailyStepsBarChart({
  readings,
  usualSteps = 7200,
  height = 240,
}: DailyStepsBarChartProps) {
  const { theme } = useTheme();
  const chartTheme = buildGlassChartTheme(theme.tokens, '#2563EB');

  const data = readings
    .filter((r) => typeof r.steps === 'number' && Number.isFinite(r.steps))
    .map((r) => ({
      date: formatShortDate(r.timestamp),
      steps: Math.round(r.steps as number),
    }));

  if (data.length === 0) {
    return (
      <div
        className="vs-glass-chart-pane flex items-center justify-center rounded-xl px-4 text-center text-sm text-[var(--vs-text-muted)]"
        style={{ height }}
      >
        No daily step count values are included in this dataset yet.
      </div>
    );
  }

  return (
    <GlassRechartsFrame height={height}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 14, right: 20, left: -2, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartTheme.gridColor} />
          <XAxis
            dataKey="date"
            tick={chartTheme.tickStyle}
            tickLine={false}
            axisLine={{ stroke: chartTheme.gridColor }}
            minTickGap={20}
          />
          <YAxis
            tick={chartTheme.tickStyle}
            tickLine={false}
            axisLine={false}
            width={52}
            tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v))}
          />
          <Tooltip
            cursor={{ fill: 'rgba(79, 70, 229, 0.08)' }}
            content={({ active, payload }) => {
              if (!active || !payload || payload.length === 0) return null;
              const point = payload[0].payload as (typeof data)[number];
              const pct = Math.round(((point.steps - usualSteps) / Math.max(1, usualSteps)) * 100);
              return (
                <GlassChartTooltip
                  title={point.date}
                  items={[
                    {
                      label: 'Daily steps',
                      value: point.steps.toLocaleString(),
                      unit: 'steps',
                      color: point.steps < usualSteps * 0.72 ? '#D97706' : '#4F46E5',
                    },
                  ]}
                  footnote={`${pct > 0 ? `+${pct}%` : `${pct}%`} vs. usual ${usualSteps.toLocaleString()} steps`}
                />
              );
            }}
          />
          <ReferenceLine
            y={usualSteps}
            stroke={chartTheme.refColor}
            strokeDasharray="4 4"
            strokeOpacity={0.45}
            label={{
              value: `Usual ${usualSteps.toLocaleString()}`,
              position: 'insideTopRight',
              fill: chartTheme.tickColor,
              fontSize: 11.5,
              fontWeight: 600,
              fontFamily: 'IBM Plex Mono, monospace',
            }}
          />
          <Bar dataKey="steps" radius={[4, 4, 0, 0]} maxBarSize={26}>
            {data.map((entry, idx) => (
              <Cell
                key={`steps-${idx}`}
                fill={entry.steps < usualSteps * 0.72 ? '#D97706' : '#4F46E5'}
                fillOpacity={0.86}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </GlassRechartsFrame>
  );
}
