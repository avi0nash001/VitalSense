import { useState } from 'react';
import {
  Activity,
  ArrowRight,
  BellRing,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { motion } from 'motion/react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  LatestMetricSnapshot,
  MetricKey,
  VitalReading,
} from '../../lib/types';
import type { ThemeId } from '../../theme/themes';
import { CurvePointerOverlay } from '../charts/CurvePointerOverlay';
import { GlassChartTooltip } from '../charts/GlassChartShell';
import { LiveDeviationMeter } from './LiveSignalMotion';
import { HERO_SLIDE_INTERVAL_MS, HERO_STORY_SLIDES } from './heroCarouselConfig';

export { HERO_STORY_SLIDES };

export interface HeroSyncRow {
  key: MetricKey;
  code: string;
  label: string;
  nights: number;
  value: string;
  unit: string;
  baseline: string;
  deltaText: string;
  shifted: boolean;
}

export interface HeroPreviewData {
  sourceLabel: string;
  readings: VitalReading[];
  snapshots: LatestMetricSnapshot[];
  baselineSummary: {
    overallPct: number;
    statusLabel: string;
    establishedCount: number;
    totalMetrics: number;
    coverageDaysMax: number;
  };
}

interface HeroAutoSliderProps {
  themeId: ThemeId;
  activeSlide: number;
  direction: number;
  slideResetNonce: number;
  isHovered: boolean;
  onSelectSlide: (idx: number) => void;
  onHoverChange: (hovered: boolean) => void;
  previewData?: HeroPreviewData;
  syncRows: HeroSyncRow[];
  previewMetric: MetricKey;
  onSelectMetric: (metric: MetricKey) => void;
  onEnterWorkspace: (role?: 'member' | 'caregiver', route?: string) => void;
  enteringDemo: boolean;
}

export function HeroAutoSlider({
  activeSlide,
  direction,
  slideResetNonce,
  isHovered,
  onSelectSlide,
  onHoverChange,
  syncRows,
  onEnterWorkspace,
  enteringDemo,
}: HeroAutoSliderProps) {
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [baselineProfile, setBaselineProfile] = useState<'personal' | 'runner'>('personal');
  const [slide4Topic, setSlide4Topic] = useState<'why' | 'normal' | 'next'>('why');

  const currentMeta = HERO_STORY_SLIDES[activeSlide] ?? HERO_STORY_SLIDES[0];
  const mutedText = 'text-[var(--vs-text-muted)]';
  const secondaryText = 'text-[var(--vs-text-secondary)]';

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0]?.clientX ?? null);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null) return;
    const endX = e.changedTouches[0]?.clientX ?? touchStartX;
    const diff = endX - touchStartX;
    if (Math.abs(diff) > 42) {
      onSelectSlide(diff < 0 ? activeSlide + 1 : activeSlide - 1);
    }
    setTouchStartX(null);
  };

  const heartRow = syncRows.find((r) => r.key === 'heartRate');
  const spo2Row = syncRows.find((r) => r.key === 'spo2');

  const liveHeroHr = Number(heartRow?.value) || 69.7;
  const baselineNum = Number(heartRow?.baseline) || 62.9;
  const upperNormal = Number((baselineNum + 4.2).toFixed(1));
  const lowerNormal = Number((baselineNum - 4.2).toFixed(1));
  const hrDelta = Number((liveHeroHr - baselineNum).toFixed(1));
  const spo2Val = spo2Row?.value ?? '97.8';

  const slide1HeartSeries = [
    { day: 'Mon', timestamp: '2026-11-19T07:05:00.000Z', bpm: Number((baselineNum - 0.6).toFixed(1)), spo2: 98.1, steps: 7420 },
    { day: 'Tue', timestamp: '2026-11-20T07:05:00.000Z', bpm: Number((baselineNum + 0.4).toFixed(1)), spo2: 97.9, steps: 7180 },
    { day: 'Wed', timestamp: '2026-11-21T07:05:00.000Z', bpm: Number((baselineNum - 0.2).toFixed(1)), spo2: 98.0, steps: 7650 },
    { day: 'Thu', timestamp: '2026-11-22T07:05:00.000Z', bpm: Number((baselineNum + 0.3).toFixed(1)), spo2: 97.9, steps: 6980 },
    { day: 'Fri', timestamp: '2026-11-23T07:05:00.000Z', bpm: Number((baselineNum + 4.4).toFixed(1)), spo2: 97.8, steps: 5890 },
    { day: 'Sat', timestamp: '2026-11-24T07:05:00.000Z', bpm: Number((baselineNum + 5.5).toFixed(1)), spo2: 97.8, steps: 5410 },
    { day: 'Sun', timestamp: '2026-11-25T07:05:00.000Z', bpm: Number(liveHeroHr.toFixed(1)), spo2: Number(spo2Val) || 97.8, steps: 5140 },
  ];

  const baselineSeries =
    baselineProfile === 'personal'
      ? {
          mean: baselineNum,
          low: lowerNormal,
          high: upperNormal,
          note: `For Elena, readings between ${lowerNormal} and ${upperNormal} bpm are completely normal.`,
          data: [
            { day: 'D1', bpm: Number((baselineNum - 0.8).toFixed(1)) },
            { day: 'D2', bpm: Number((baselineNum + 0.5).toFixed(1)) },
            { day: 'D3', bpm: Number((baselineNum - 1.1).toFixed(1)) },
            { day: 'D4', bpm: Number((baselineNum + 0.2).toFixed(1)) },
            { day: 'D5', bpm: Number((baselineNum - 0.3).toFixed(1)) },
            { day: 'D6', bpm: Number((baselineNum + 0.9).toFixed(1)) },
            { day: 'D7', bpm: Number((baselineNum - 0.1).toFixed(1)) },
          ],
        }
      : {
          mean: 52.4,
          low: 48.6,
          high: 56.2,
          note: `For an endurance runner (52.4 bpm usual), ${baselineNum.toFixed(1)} bpm would immediately stand out as elevated.`,
          data: [
            { day: 'D1', bpm: 51.8 },
            { day: 'D2', bpm: 53.0 },
            { day: 'D3', bpm: 52.1 },
            { day: 'D4', bpm: 52.6 },
            { day: 'D5', bpm: 51.9 },
            { day: 'D6', bpm: 53.2 },
            { day: 'D7', bpm: 52.4 },
          ],
        };

  const earlyDetectionData = [
    { day: 'Fri', bpm: Number((baselineNum - 0.4).toFixed(1)), shifted: false },
    { day: 'Sat', bpm: Number((baselineNum + 0.3).toFixed(1)), shifted: false },
    { day: 'Mon', bpm: Number((baselineNum - 0.1).toFixed(1)), shifted: false },
    { day: 'Day 1', bpm: Number((baselineNum + 4.4).toFixed(1)), shifted: true },
    { day: 'Day 2', bpm: Number((baselineNum + 5.5).toFixed(1)), shifted: true },
    { day: 'Day 3', bpm: Number(liveHeroHr.toFixed(1)), shifted: true },
  ];

  const caregiverBarData = [
    { day: 'Mon', bpm: Number(baselineNum.toFixed(1)), status: 'Normal', shifted: false },
    { day: 'Tue', bpm: Number((baselineNum + 4.4).toFixed(1)), status: 'Day 1 shift', shifted: true },
    { day: 'Wed', bpm: Number((baselineNum + 5.5).toFixed(1)), status: 'Day 2 shift', shifted: true },
    { day: 'Thu', bpm: Number(liveHeroHr.toFixed(1)), status: 'Alert shared', shifted: true },
  ];

  const slideHeadlines: Array<{ title: string; subtitle: string; metricBadge: string }> = [
    {
      title: 'Daily Wearable Health Overview',
      subtitle: 'Track resting heart rate, blood oxygen, sleep duration, and daily steps in one calm place.',
      metricBadge: `${liveHeroHr.toFixed(1)} bpm · Usual ${baselineNum.toFixed(1)}`,
    },
    {
      title: 'Your Personal Normal Range',
      subtitle: 'VITALSENSE learns what is normal for you from your own wearable history.',
      metricBadge: `Usual ${lowerNormal}–${upperNormal} bpm`,
    },
    {
      title: 'Sustained Multi-Day Shifts',
      subtitle: 'One off-day stays quiet while multi-day changes outside your usual range stand out early.',
      metricBadge: `+${hrDelta} bpm · 3 days`,
    },
    {
      title: 'Plain-English Alert Reasons',
      subtitle: 'Every alert explains what changed, for how long, and compared against your own usual pattern.',
      metricBadge: 'Good coverage · 94%',
    },
    {
      title: 'Clear Updates for Caregivers',
      subtitle: 'Authorised family members receive simple summaries showing when a change began and follow-up status.',
      metricBadge: 'Checked in · 08:14',
    },
  ];

  const activeHeadline = slideHeadlines[activeSlide] ?? slideHeadlines[0];

  const axisTick = {
    fontSize: 12,
    fontWeight: 500,
    fill: '#475569',
    fontFamily: 'IBM Plex Mono, monospace',
  };

  return (
    <div
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      data-testid="hero-auto-slider"
      className="w-full max-w-[680px]"
    >
      <div className="vs-glass-shell relative overflow-hidden rounded-2xl p-5 sm:p-6">
        {/* Top Story Tabs + Previous / Next Arrows (No Play/Pause Buttons) */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div
            role="tablist"
            aria-label="VITALSENSE core features"
            className="flex flex-wrap items-center gap-1 rounded-xl border border-[var(--vs-border)] bg-[var(--vs-bg-subtle)] p-1"
          >
            {HERO_STORY_SLIDES.map((slide, idx) => {
              const active = idx === activeSlide;
              return (
                <button
                  key={slide.id}
                  role="tab"
                  aria-selected={active}
                  type="button"
                  onClick={() => onSelectSlide(idx)}
                  className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium whitespace-nowrap shrink-0 transition-colors ${
                    active
                      ? 'bg-[var(--vs-btn-primary-bg)] text-[var(--vs-btn-primary-text)]'
                      : `${mutedText} hover:text-[var(--vs-text)]`
                  }`}
                >
                  {slide.tabLabel}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => onSelectSlide(activeSlide - 1)}
              aria-label="Previous slide"
              className={`flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--vs-border)] bg-[var(--vs-surface)] ${secondaryText} hover:bg-[var(--vs-bg-subtle)] hover:text-[var(--vs-text)]`}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onSelectSlide(activeSlide + 1)}
              aria-label="Next slide"
              className={`flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--vs-border)] bg-[var(--vs-surface)] ${secondaryText} hover:bg-[var(--vs-bg-subtle)] hover:text-[var(--vs-text)]`}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Synchronized Slide Content */}
        <div className="relative min-h-[396px]">
          <motion.div
            key={activeSlide}
            initial={{ opacity: 0.72, x: direction * 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="w-full min-w-0 space-y-4"
          >
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2.5 sm:gap-4 border-b border-[var(--vs-border)] pb-3.5">
              <div className="min-w-0 flex-1 space-y-1">
                <p className="font-mono-num text-[11px] font-semibold text-[var(--vs-accent)]">
                  {currentMeta.eyebrow}
                </p>
                <h2 className="font-display text-lg sm:text-[20px] font-bold tracking-[-0.02em] text-[var(--vs-text)]">
                  {activeHeadline.title}
                </h2>
                <p className={`text-xs sm:text-[13.5px] leading-relaxed ${secondaryText}`}>
                  {activeHeadline.subtitle}
                </p>
              </div>
              <div className="sm:text-right shrink-0 pt-0.5 flex sm:block items-baseline gap-2">
                <p className={`text-[11px] font-medium ${mutedText}`}>Key reading</p>
                <p className="sm:mt-0.5 vs-kpi-num text-xs sm:text-sm font-semibold text-[var(--vs-text)] whitespace-nowrap">
                  {activeHeadline.metricBadge}
                </p>
              </div>
            </div>

            {/* SLIDE 1 — PERSONAL HEALTH (4 CORE METRICS + CLEAN 2D RECHARTS CHART) */}
            {activeSlide === 0 && (
              <div className="space-y-3">
                <div className="rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface)] p-3">
                  <div className="mb-1.5 flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-[var(--vs-text)]">
                      7-Day Resting Heart Rate
                    </span>
                    <span className="font-mono-num text-[var(--vs-text-muted)]">
                      Usual average: {baselineNum.toFixed(1)} bpm
                    </span>
                  </div>
                  <div style={{ width: '100%', height: 148 }}>
                    <CurvePointerOverlay
                      accentColor="#4F46E5"
                      scrubberSeries={{
                        metricLabel: 'Heart Rate',
                        unit: 'bpm',
                        precision: 1,
                        secondaryLabel: 'SpO₂',
                        secondaryUnit: '%',
                        secondaryPrecision: 1,
                        baselineMean: baselineNum,
                        points: slide1HeartSeries.map((pt) => ({
                          label: pt.day,
                          timestamp: pt.timestamp,
                          value: pt.bpm,
                          secondaryValue: pt.spo2,
                          note: `${pt.steps.toLocaleString()} steps`,
                        })),
                      }}
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={slide1HeartSeries} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                          <XAxis dataKey="day" tick={axisTick} tickLine={false} axisLine={{ stroke: '#E2E8F0' }} />
                          <YAxis domain={[58, 74]} tick={axisTick} tickLine={false} axisLine={false} width={44} />
                          <Tooltip content={() => null} />
                          <ReferenceLine y={baselineNum} stroke="#111827" strokeDasharray="4 4" strokeOpacity={0.45} />
                          <Area
                            type="monotone"
                            dataKey="bpm"
                            stroke="#4F46E5"
                            strokeWidth={2.2}
                            fill="#EEF2FF"
                            fillOpacity={0.85}
                            dot={{ r: 3, fill: '#FFFFFF', stroke: '#4F46E5', strokeWidth: 1.8 }}
                            isAnimationActive={false}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </CurvePointerOverlay>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {[
                    { label: 'Heart rate', value: liveHeroHr.toFixed(1), unit: 'bpm', note: `+${hrDelta} vs usual`, shifted: true },
                    { label: 'SpO₂', value: spo2Val, unit: '%', note: 'Normal range', shifted: false },
                    { label: 'Sleep', value: '6.8', unit: 'hrs', note: 'Slightly shorter', shifted: false },
                    { label: 'Daily steps', value: '5,140', unit: 'steps', note: 'Lower activity', shifted: true },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="rounded-xl border border-[var(--vs-border)] bg-[var(--vs-bg-subtle)] p-3"
                    >
                      <span className={`block text-[11.5px] font-medium ${mutedText}`}>
                        {item.label}
                      </span>
                      <p className="mt-1 vs-kpi-num text-[17px] font-bold text-[var(--vs-text)]">
                        {item.value}{' '}
                        <span className={`text-[11.5px] font-normal ${mutedText}`}>{item.unit}</span>
                      </p>
                      <span
                        className={`mt-1 block font-mono-num text-[10.5px] ${
                          item.shifted ? 'text-amber-700' : mutedText
                        }`}
                      >
                        {item.note}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SLIDE 2 — PERSONAL BASELINE (SHADED USUAL RANGE IN RECHARTS) */}
            {activeSlide === 1 && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className={`text-xs font-medium ${secondaryText}`}>
                    Switch profiles to see how personal baselines differ:
                  </p>
                  <div className="flex items-center gap-1 rounded-lg border border-[var(--vs-border)] bg-[var(--vs-bg-subtle)] p-0.5">
                    {(['personal', 'runner'] as const).map((key) => {
                      const active = baselineProfile === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setBaselineProfile(key)}
                          className={`rounded-md px-2.5 py-1 text-[11px] font-medium whitespace-nowrap transition-colors ${
                            active
                              ? 'bg-[var(--vs-btn-primary-bg)] text-[var(--vs-btn-primary-text)]'
                              : `${mutedText} hover:text-[var(--vs-text)]`
                          }`}
                        >
                          {key === 'personal' ? `Elena · ${baselineNum.toFixed(1)} bpm` : 'Runner · 52.4 bpm'}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface)] p-3.5 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-[var(--vs-text)]">
                      Personal Usual Range: {baselineSeries.low}–{baselineSeries.high} bpm
                    </span>
                    <span className="font-mono-num text-[11px] text-[#4F46E5]">
                      Typical average: {baselineSeries.mean.toFixed(1)} bpm
                    </span>
                  </div>

                  <div style={{ width: '100%', height: 175 }}>
                    <CurvePointerOverlay
                      accentColor="#2563EB"
                      scrubberSeries={{
                        metricLabel: 'Heart Rate',
                        unit: 'bpm',
                        precision: 1,
                        baselineMean: baselineSeries.mean,
                        points: baselineSeries.data.map((pt, i) => ({
                          label: pt.day,
                          timestamp: `2026-11-${String(19 + i).padStart(2, '0')}T07:05:00.000Z`,
                          value: pt.bpm,
                          note: `Usual range: ${baselineSeries.low}–${baselineSeries.high} bpm`,
                        })),
                      }}
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={baselineSeries.data} margin={{ top: 10, right: 14, left: -14, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                          <XAxis dataKey="day" tick={axisTick} tickLine={false} axisLine={{ stroke: '#E2E8F0' }} />
                          <YAxis domain={[45, 70]} tick={axisTick} tickLine={false} axisLine={false} width={44} />
                          <Tooltip content={() => null} />
                          <ReferenceArea
                            y1={baselineSeries.low}
                            y2={baselineSeries.high}
                            fill="#6366F1"
                            fillOpacity={0.12}
                          />
                          <ReferenceLine y={baselineSeries.mean} stroke="#4F46E5" strokeDasharray="4 4" />
                          <Area
                            type="monotone"
                            dataKey="bpm"
                            stroke="#2563EB"
                            strokeWidth={2.2}
                            fill="#EEF2FF"
                            fillOpacity={0.6}
                            dot={{ r: 3.5, fill: '#FFFFFF', stroke: '#2563EB', strokeWidth: 2 }}
                            isAnimationActive={false}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </CurvePointerOverlay>
                  </div>

                  <p className={`text-xs leading-relaxed ${secondaryText}`}>
                    {baselineSeries.note}
                  </p>
                </div>
              </div>
            )}

            {/* SLIDE 3 — EARLY DETECTION (MULTI-DAY SUSTAINED RISE) */}
            {activeSlide === 2 && (
              <div className="space-y-3">
                <div className="rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface)] p-3.5 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-[var(--vs-text)]">
                      3 Consecutive Days Above Usual Upper Range ({upperNormal} bpm)
                    </span>
                    <span className="font-mono-num text-[11px] font-semibold text-amber-700">
                      Sustained shift
                    </span>
                  </div>

                  <div style={{ width: '100%', height: 170 }}>
                    <CurvePointerOverlay
                      accentColor="#D97706"
                      scrubberSeries={{
                        metricLabel: 'Heart Rate',
                        unit: 'bpm',
                        precision: 1,
                        baselineMean: baselineNum,
                        points: earlyDetectionData.map((pt, i) => ({
                          label: pt.day,
                          timestamp: `2026-11-${String(20 + i).padStart(2, '0')}T07:05:00.000Z`,
                          value: pt.bpm,
                          note: pt.shifted ? 'Above usual upper range' : 'Within usual range',
                        })),
                      }}
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={earlyDetectionData} margin={{ top: 10, right: 14, left: -14, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                          <XAxis dataKey="day" tick={axisTick} tickLine={false} axisLine={{ stroke: '#E2E8F0' }} />
                          <YAxis domain={[57, 73]} tick={axisTick} tickLine={false} axisLine={false} width={44} />
                          <Tooltip content={() => null} />
                          <ReferenceArea y1={lowerNormal} y2={upperNormal} fill="#6366F1" fillOpacity={0.1} />
                          <ReferenceLine y={upperNormal} stroke="#4F46E5" strokeDasharray="4 4" />
                          <Area
                            type="monotone"
                            dataKey="bpm"
                            stroke="#D97706"
                            strokeWidth={2.4}
                            fill="#FEF3C7"
                            fillOpacity={0.45}
                            dot={(props) => {
                              const { cx, cy, payload, index } = props;
                              if (typeof cx !== 'number' || typeof cy !== 'number') return null;
                              const shifted = Boolean(payload?.shifted);
                              return (
                                <circle
                                  key={`det-${index}`}
                                  cx={cx}
                                  cy={cy}
                                  r={shifted ? 4.5 : 3.2}
                                  fill={shifted ? '#D97706' : '#4F46E5'}
                                  stroke="#FFFFFF"
                                  strokeWidth={1.6}
                                />
                              );
                            }}
                            isAnimationActive={false}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </CurvePointerOverlay>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono-num text-xs">
                  {[
                    { k: 'Your normal', v: `${baselineNum.toFixed(1)} bpm` },
                    { k: 'Recent reading', v: `${liveHeroHr.toFixed(1)} bpm` },
                    { k: 'How long', v: '3 days in a row' },
                    { k: 'First appeared', v: 'Tuesday' },
                  ].map((item) => (
                    <div
                      key={item.k}
                      className="rounded-xl border border-[var(--vs-border)] bg-[var(--vs-bg-subtle)] px-3 py-2"
                    >
                      <p className={`text-[10.5px] ${mutedText}`}>{item.k}</p>
                      <p className="mt-0.5 font-semibold text-[var(--vs-text)] truncate">{item.v}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SLIDE 4 — EXPLAINABLE AI (PREMIUM RANGE TRACKS + INTERACTIVE PLAIN-ENGLISH Q&A) */}
            {activeSlide === 3 && (
              <div className="space-y-3" data-testid="slide-4-explainable-ai">
                <div className="rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface)] p-3.5 sm:p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs border-b border-[var(--vs-border)] pb-2.5">
                    <span className="font-semibold text-[var(--vs-text)]">
                      Compared With Your Personal Normal Range
                    </span>
                    <div className="flex items-center gap-3 text-[10.5px] font-mono-num">
                      <span className="inline-flex items-center gap-1.5 text-[var(--vs-text-secondary)]">
                        <span className="h-2 w-3 rounded-xs bg-indigo-500/20 border border-indigo-500/40" />
                        Usual zone
                      </span>
                      <span className="text-[var(--vs-success)] font-semibold">
                        94% coverage
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    <LiveDeviationMeter
                      label="Resting Heart Rate"
                      reading={`${liveHeroHr.toFixed(1)} bpm vs ${baselineNum.toFixed(1)} usual`}
                      sigmaLabel={`+${hrDelta} bpm`}
                      offsetPct={34}
                      shifted
                      phaseOffset={0.4}
                      mutedClass={mutedText}
                    />
                    <LiveDeviationMeter
                      label="Nightly Sleep"
                      reading="6.3 hrs vs 7.3 usual"
                      sigmaLabel="-1.0 hr"
                      offsetPct={-28}
                      shifted
                      phaseOffset={1.2}
                      mutedClass={mutedText}
                    />
                    <LiveDeviationMeter
                      label="Daily Steps"
                      reading="5,140 vs 7,200 usual"
                      sigmaLabel="-29%"
                      offsetPct={-32}
                      shifted
                      phaseOffset={2.1}
                      mutedClass={mutedText}
                    />
                    <LiveDeviationMeter
                      label="Blood Oxygen (SpO₂)"
                      reading={`${spo2Val}% vs 97.9% usual`}
                      sigmaLabel="Normal"
                      offsetPct={4}
                      shifted={false}
                      phaseOffset={2.8}
                      mutedClass={mutedText}
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-[var(--vs-border-strong)] bg-[var(--vs-bg-subtle)] p-3.5 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--vs-accent)]">
                      <Sparkles className="h-3.5 w-3.5" />
                      Ask Explainable AI
                    </span>
                    <div className="flex flex-wrap items-center gap-1">
                      {(
                        [
                          ['why', 'Why this alert?'],
                          ['normal', 'My normal?'],
                          ['next', 'What next?'],
                        ] as const
                      ).map(([id, label]) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setSlide4Topic(id)}
                          className={`rounded-md px-2 py-0.5 text-[10.5px] font-medium transition-colors ${
                            slide4Topic === id
                              ? 'bg-[var(--vs-btn-primary-bg)] text-[var(--vs-btn-primary-text)]'
                              : 'bg-[var(--vs-surface)] text-[var(--vs-text-secondary)] hover:text-[var(--vs-text)]'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className={`text-xs leading-relaxed ${secondaryText}`}>
                    {slide4Topic === 'why' &&
                      `Your resting heart rate stayed higher (+${hrDelta} bpm) for three days while nightly sleep dropped by 1.0 hour and steps slowed down. Blood oxygen stayed normal at ${spo2Val}%.`}
                    {slide4Topic === 'normal' &&
                      `From your own past 14 days, your normal resting heart rate is around ${baselineNum.toFixed(1)} bpm (${lowerNormal}–${upperNormal} bpm) with about 7.3 hours of sleep.`}
                    {slide4Topic === 'next' &&
                      'This notice is not a medical diagnosis. Rest, drink water, and check in with a healthcare professional if you feel unwell or notice symptoms.'}
                  </p>
                </div>
              </div>
            )}

            {/* SLIDE 5 — CAREGIVER ALERTS (CLEAN RECHARTS BAR CHART + CONFIRMATION) */}
            {activeSlide === 4 && (
              <div className="space-y-3">
                <div className="rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface)] p-3.5 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-[var(--vs-text)]">
                      Monday → Thursday Alert Timeline Shared With Caregiver
                    </span>
                    <span className="font-mono-num text-[11px] text-[#4F46E5]">
                      Upper normal: {upperNormal} bpm
                    </span>
                  </div>

                  <div style={{ width: '100%', height: 170 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={caregiverBarData} margin={{ top: 10, right: 14, left: -14, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                        <XAxis dataKey="day" tick={axisTick} tickLine={false} axisLine={{ stroke: '#E2E8F0' }} />
                        <YAxis domain={[56, 74]} tick={axisTick} tickLine={false} axisLine={false} width={44} />
                        <Tooltip
                          cursor={{ fill: 'rgba(99, 102, 241, 0.08)' }}
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const pt = payload[0].payload as (typeof caregiverBarData)[number];
                            return (
                              <GlassChartTooltip
                                title={pt.day}
                                items={[
                                  {
                                    label: 'Heart rate',
                                    value: pt.bpm,
                                    unit: 'bpm',
                                    color: pt.shifted ? '#D97706' : '#4F46E5',
                                  },
                                ]}
                                footnote={pt.status}
                              />
                            );
                          }}
                        />
                        <ReferenceLine y={upperNormal} stroke="#4F46E5" strokeDasharray="4 4" />
                        <Bar dataKey="bpm" radius={[4, 4, 0, 0]} maxBarSize={42} isAnimationActive={false}>
                          {caregiverBarData.map((entry, idx) => (
                            <Cell
                              key={`cg-${idx}`}
                              fill={idx === 0 ? '#4F46E5' : idx === 3 ? '#D97706' : '#6366F1'}
                              fillOpacity={idx === 0 ? 0.8 : 0.88}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--vs-border)] bg-[var(--vs-bg-subtle)] px-3.5 py-2.5">
                  <div className="flex flex-1 items-center gap-2 min-w-0 text-xs">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--vs-success)]" />
                    <span className={`truncate ${secondaryText}`}>
                      Raw readings stay private · Summary viewed by Sarah Vance at 08:14
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onEnterWorkspace('caregiver', '/caregiver')}
                    disabled={enteringDemo}
                    className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-[var(--vs-accent)] hover:underline whitespace-nowrap"
                  >
                    Caregiver Centre →
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </div>

        {/* Synchronized 2.5-Second Progress Bar + Slide Dots + CTA */}
        <div className="mt-4 overflow-hidden rounded-xl border border-[var(--vs-border)] bg-[var(--vs-bg-subtle)]">
          <div className="h-1 w-full bg-[var(--vs-border)]">
            <div
              key={`${activeSlide}-${slideResetNonce}`}
              data-testid="hero-slide-progress-fill"
              className="h-full w-full origin-left bg-[var(--vs-accent)]"
              style={{
                animation: `vs-slide-progress ${HERO_SLIDE_INTERVAL_MS}ms linear forwards`,
                animationPlayState: isHovered ? 'paused' : 'running',
              }}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
            <div className="flex items-center gap-2 min-w-0 text-xs">
              {activeSlide === 1 ? (
                <TrendingUp className="h-3.5 w-3.5 shrink-0 text-[var(--vs-accent)]" />
              ) : activeSlide === 4 ? (
                <BellRing className="h-3.5 w-3.5 shrink-0 text-[var(--vs-accent)]" />
              ) : (
                <Activity className="h-3.5 w-3.5 shrink-0 text-[var(--vs-accent)]" />
              )}
              <p className="truncate">
                <span className="font-mono-num font-semibold">
                  {activeSlide + 1}/{HERO_STORY_SLIDES.length}
                </span>{' '}
                <span className="font-semibold">· {currentMeta.tabLabel}</span>{' '}
                <span className={mutedText}>
                  · {isHovered ? 'Hovered' : '2.5s auto'}
                </span>
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <div className="flex items-center gap-1.5" aria-label="Slide indicators">
                {HERO_STORY_SLIDES.map((s, idx) => {
                  const active = idx === activeSlide;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      aria-label={`Show slide ${s.tabLabel}`}
                      onClick={() => onSelectSlide(idx)}
                      className={`relative h-1.5 overflow-hidden rounded-full transition-all ${
                        active
                          ? 'w-7 bg-[var(--vs-border)]'
                          : 'w-1.5 bg-[var(--vs-border-strong)] hover:bg-[var(--vs-text-muted)]'
                      }`}
                    >
                      {active && (
                        <span
                          key={`dot-${activeSlide}-${slideResetNonce}`}
                          className="absolute inset-0 origin-left rounded-full bg-[var(--vs-accent)]"
                          style={{
                            animation: `vs-slide-progress ${HERO_SLIDE_INTERVAL_MS}ms linear forwards`,
                            animationPlayState: isHovered ? 'paused' : 'running',
                          }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() =>
                  onEnterWorkspace(
                    currentMeta.id === 'caregiver' ? 'caregiver' : 'member',
                    currentMeta.ctaTarget
                  )
                }
                disabled={enteringDemo}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--vs-accent)] hover:underline whitespace-nowrap"
              >
                {currentMeta.ctaLabel} <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
