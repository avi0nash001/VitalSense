import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  ArrowRight,
  BellRing,
  CheckCircle2,
  Clock,
  Footprints,
  HeartPulse,
  Lock,
  Moon,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Wind,
} from 'lucide-react';
import { motion } from 'motion/react';
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
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import type { LatestMetricSnapshot, MetricKey, VitalReading } from '../lib/types';
import { METRIC_DEFINITIONS } from '../lib/vitalsEngine';
import { CurvePointerOverlay } from '../components/charts/CurvePointerOverlay';
import { DailyStepsBarChart } from '../components/charts/HealthMetricsCharts';
import { HeroAtmosphere } from '../components/landing/HeroAtmosphere';
import { HERO_STORY_SLIDES, HeroAutoSlider } from '../components/landing/HeroAutoSlider';
import {
  HERO_SLIDE_INTERVAL_MS,
  getSlideDirection,
  normalizeSlideIndex,
} from '../components/landing/heroCarouselConfig';

interface PublicPreviewResponse {
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

const HERO_SYNC_FALLBACK: Array<{
  key: MetricKey;
  code: string;
  label: string;
  nights: number;
  value: string;
  unit: string;
  baseline: string;
  deltaText: string;
  shifted: boolean;
}> = [
  {
    key: 'heartRate',
    code: 'H',
    label: 'Resting Heart Rate',
    nights: 17,
    value: '69.7',
    unit: 'bpm',
    baseline: '62.9',
    deltaText: '+6.8 bpm',
    shifted: true,
  },
  {
    key: 'spo2',
    code: 'S',
    label: 'Blood Oxygen (SpO₂)',
    nights: 17,
    value: '97.8',
    unit: '%',
    baseline: '97.9',
    deltaText: 'Within normal range',
    shifted: false,
  },
  {
    key: 'temperature',
    code: 'T',
    label: 'Skin Temperature',
    nights: 17,
    value: '36.88',
    unit: '°C',
    baseline: '36.63',
    deltaText: '+0.25 °C',
    shifted: true,
  },
  {
    key: 'respiratoryRate',
    code: 'R',
    label: 'Breathing Rate',
    nights: 17,
    value: '15.6',
    unit: 'br/min',
    baseline: '14.5',
    deltaText: '+1.1 br/min',
    shifted: false,
  },
  {
    key: 'hrv',
    code: 'V',
    label: 'HRV (Recovery)',
    nights: 17,
    value: '44.7',
    unit: 'ms',
    baseline: '50.9',
    deltaText: '-6.2 ms',
    shifted: true,
  },
];

const FIRST_DETECTED_TIMELINE = [
  {
    day: 'Monday',
    label: 'Normal pattern',
    reading: '62.9 bpm',
    detail: 'Heart rate, sleep (7.3 hrs), and daily steps (7,420) all matched Elena’s usual pattern.',
    status: 'Normal',
  },
  {
    day: 'Tuesday',
    label: 'First unusual reading',
    reading: '67.3 bpm',
    detail: 'Resting heart rate stepped outside her usual upper range for the first time.',
    status: 'Day 1',
  },
  {
    day: 'Wednesday',
    label: 'Change continued',
    reading: '68.4 bpm',
    detail: 'Readings stayed higher for a second day alongside shorter sleep (6.4 hrs).',
    status: 'Day 2',
  },
  {
    day: 'Thursday',
    label: 'Multi-day shift confirmed',
    reading: '69.7 bpm',
    detail: 'Three consecutive days outside her normal pattern confirmed across good wearable coverage.',
    status: 'Day 3',
  },
  {
    day: 'Thursday · 07:02',
    label: 'Alert shared',
    reading: 'Summary ready',
    detail: 'A clear plain-English explanation and caregiver update were sent with permission.',
    status: 'Shared',
  },
];

const PERSONAL_BASELINE_EXAMPLES = {
  elena: {
    name: 'Elena · Usual 62.9 bpm',
    mean: 62.9,
    bandLow: 58.7,
    bandHigh: 67.1,
    points: [
      { day: 'D-7', bpm: 62.4 },
      { day: 'D-6', bpm: 63.1 },
      { day: 'D-5', bpm: 61.9 },
      { day: 'D-4', bpm: 63.5 },
      { day: 'D-3', bpm: 62.8 },
      { day: 'D-2', bpm: 63.0 },
      { day: 'D-1', bpm: 62.5 },
      { day: 'Now', bpm: 69.7 },
    ],
    current: 69.7,
    explanation:
      'Elena’s usual range comes from her own wearable history (58.7–67.1 bpm). At 69.7 bpm, her recent readings sit clearly above what is normal for her.',
  },
  arjun: {
    name: 'Arjun · Usual 54.2 bpm',
    mean: 54.2,
    bandLow: 50.6,
    bandHigh: 57.8,
    points: [
      { day: 'D-7', bpm: 54.0 },
      { day: 'D-6', bpm: 54.8 },
      { day: 'D-5', bpm: 53.6 },
      { day: 'D-4', bpm: 54.4 },
      { day: 'D-3', bpm: 54.1 },
      { day: 'D-2', bpm: 54.5 },
      { day: 'D-1', bpm: 54.3 },
      { day: 'Now', bpm: 54.6 },
    ],
    current: 54.6,
    explanation:
      'Arjun is a regular runner with a naturally lower resting heart rate (50.6–57.8 bpm). At 54.6 bpm, his readings sit comfortably inside his own normal range.',
  },
};

const EARLY_DETECTION_CHART_DATA = [
  { day: 'Fri', bpm: 62.7, shifted: false },
  { day: 'Sat', bpm: 63.1, shifted: false },
  { day: 'Mon', bpm: 62.9, shifted: false },
  { day: 'Day 1', bpm: 67.3, shifted: true },
  { day: 'Day 2', bpm: 68.4, shifted: true },
  { day: 'Day 3', bpm: 69.7, shifted: true },
];

const TIMELINE_CURVE_DATA = [
  { day: 'Mon', bpm: 62.9, label: 'Normal' },
  { day: 'Tue', bpm: 67.3, label: 'Day 1 shift' },
  { day: 'Wed', bpm: 68.4, label: 'Day 2 shift' },
  { day: 'Thu', bpm: 69.7, label: 'Day 3 shift' },
  { day: '07:02', bpm: 69.7, label: 'Alert shared' },
];

export function LandingPage() {
  const { user, loginDemo } = useAuth();
  const { themeId } = useTheme();
  const navigate = useNavigate();

  const [previewMetric, setPreviewMetric] = useState<MetricKey>('heartRate');
  const [enteringDemo, setEnteringDemo] = useState<boolean>(false);
  const [baselineDemoKey, setBaselineDemoKey] = useState<'elena' | 'arjun'>('elena');
  const [activeTimelineIdx, setActiveTimelineIdx] = useState<number>(3);

  const [heroSlideState, setHeroSlideState] = useState<{
    index: number;
    direction: 1 | -1;
    resetNonce: number;
  }>({ index: 0, direction: 1, resetNonce: 0 });
  const [isSlideHovered, setIsSlideHovered] = useState<boolean>(false);

  const remainingMsRef = useRef<number>(HERO_SLIDE_INTERVAL_MS);
  const slideStartedAtRef = useRef<number>(typeof performance !== 'undefined' ? performance.now() : 0);

  const activeSlide = heroSlideState.index;
  const slideDirection = heroSlideState.direction;

  useEffect(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (isSlideHovered || prefersReduced) {
      const elapsedSinceStart = Math.max(0, performance.now() - slideStartedAtRef.current);
      remainingMsRef.current = Math.max(150, remainingMsRef.current - elapsedSinceStart);
      return;
    }

    slideStartedAtRef.current = performance.now();
    const waitMs = Math.max(150, remainingMsRef.current);

    const timer = window.setTimeout(() => {
      remainingMsRef.current = HERO_SLIDE_INTERVAL_MS;
      slideStartedAtRef.current = performance.now();
      setHeroSlideState((prev) => ({
        index: normalizeSlideIndex(prev.index + 1, HERO_STORY_SLIDES.length),
        direction: 1,
        resetNonce: prev.resetNonce + 1,
      }));
    }, waitMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [isSlideHovered, heroSlideState.index, heroSlideState.resetNonce]);

  const handleSelectSlide = (nextIdx: number) => {
    remainingMsRef.current = HERO_SLIDE_INTERVAL_MS;
    slideStartedAtRef.current = performance.now();
    setHeroSlideState((prev) => {
      const normalized = normalizeSlideIndex(nextIdx, HERO_STORY_SLIDES.length);
      return {
        index: normalized,
        direction: getSlideDirection(prev.index, normalized),
        resetNonce: prev.resetNonce + 1,
      };
    });
  };

  const { data: previewData } = useQuery<PublicPreviewResponse>({
    queryKey: ['public-preview'],
    queryFn: async () => {
      const res = await fetch('/api/public/preview');
      if (!res.ok) throw new Error('Failed to load preview');
      return res.json();
    },
  });

  const handleQuickDemo = async (
    role: 'member' | 'caregiver' = 'member',
    targetRoute?: string
  ) => {
    setEnteringDemo(true);
    try {
      await loginDemo(role);
      navigate(targetRoute ?? (role === 'caregiver' ? '/caregiver' : '/app/dashboard'));
    } finally {
      setEnteringDemo(false);
    }
  };

  const syncRows = HERO_SYNC_FALLBACK.map((fallback) => {
    const live = previewData?.snapshots.find((s) => s.metric === fallback.key);
    const def = METRIC_DEFINITIONS[fallback.key];
    if (!live) return fallback;
    const delta = live.deltaFromBaseline ?? 0;
    const isShifted = Math.abs(delta) > (fallback.key === 'spo2' ? 0.5 : 0.2);
    const sign = delta > 0 ? '+' : '';
    return {
      key: fallback.key,
      code: fallback.code,
      label: def.label,
      nights: previewData?.baselineSummary.coverageDaysMax ?? fallback.nights,
      value: String(live.latestValue),
      unit: def.unit,
      baseline: live.baselineMean !== null ? String(live.baselineMean) : fallback.baseline,
      deltaText: isShifted ? `${sign}${delta} ${def.unit}` : 'Within normal range',
      shifted: isShifted,
    };
  });

  const baselineExample = PERSONAL_BASELINE_EXAMPLES[baselineDemoKey];
  const activeTimelineStep = FIRST_DETECTED_TIMELINE[activeTimelineIdx] ?? FIRST_DETECTED_TIMELINE[3];

  const heartRateSnapshot = syncRows.find((r) => r.key === 'heartRate');
  const spo2Snapshot = syncRows.find((r) => r.key === 'spo2');
  const liveHrVal = heartRateSnapshot?.value ?? '69.7';
  const liveBaselineVal = heartRateSnapshot?.baseline ?? '62.9';

  const latestReading = previewData?.readings[previewData.readings.length - 1];
  const latestSleepStr =
    typeof latestReading?.sleepHours === 'number' ? latestReading.sleepHours.toFixed(1) : '6.3';
  const latestStepsStr =
    typeof latestReading?.steps === 'number' ? latestReading.steps.toLocaleString() : '5,140';

  const chartAxisTick = {
    fontSize: 12,
    fontWeight: 500,
    fill: '#475569',
    fontFamily: 'IBM Plex Mono, monospace',
  };

  return (
    <div id="top" className="min-h-screen bg-[var(--vs-bg)] text-[var(--vs-text)]">
      {/* Fixed Single-Row 3-Zone Header */}
      <header className="fixed top-0 inset-x-0 z-50 border-b border-[var(--vs-border)] bg-[var(--vs-bg)]/95 backdrop-blur-sm">
        <div className="mx-auto flex h-14 sm:h-16 lg:h-[72px] max-w-[1280px] items-center justify-between gap-6 px-4 sm:px-6 lg:px-8">
          <Link
            to="/"
            className="flex items-center gap-2.5 font-display text-lg font-bold tracking-tight text-[var(--vs-text)] whitespace-nowrap shrink-0"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--vs-btn-primary-bg)] text-[var(--vs-btn-primary-text)]">
              <Activity className="h-4 w-4" />
            </span>
            VITALSENSE
          </Link>

          <nav
            aria-label="Primary navigation"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-[var(--vs-text-secondary)]"
          >
            <a href="#how-it-works" className="hover:text-[var(--vs-text)] transition-colors whitespace-nowrap shrink-0">
              How It Works
            </a>
            <a href="#baseline-section" className="hover:text-[var(--vs-text)] transition-colors whitespace-nowrap shrink-0">
              Baseline
            </a>
            <a href="#early-detection" className="hover:text-[var(--vs-text)] transition-colors whitespace-nowrap shrink-0">
              Detection
            </a>
            <a href="#timeline-preview" className="hover:text-[var(--vs-text)] transition-colors whitespace-nowrap shrink-0">
              Timeline
            </a>
            <a href="#caregiver-summary" className="hover:text-[var(--vs-text)] transition-colors whitespace-nowrap shrink-0">
              Caregivers
            </a>
          </nav>

          <div className="shrink-0">
            <button
              type="button"
              onClick={() =>
                user
                  ? navigate(user.role === 'caregiver' ? '/caregiver' : '/app/dashboard')
                  : handleQuickDemo('member')
              }
              disabled={enteringDemo}
              className="vs-btn-primary inline-flex items-center gap-2 rounded-full px-5 py-2 sm:py-2.5 text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0"
            >
              {user ? 'Open Workspace' : enteringDemo ? 'Opening...' : 'Explore Your Health'}
            </button>
          </div>
        </div>
      </header>

      <main className="pt-14 sm:pt-16 lg:pt-[72px]">
        {/* SECTION 1 — HERO (WHITE -> SOFT LAVENDER GRID) */}
        <section className="relative overflow-hidden border-b border-[var(--vs-border)] min-h-[600px] lg:min-h-[650px] flex flex-col justify-center">
          <HeroAtmosphere themeId={themeId} activeSlide={activeSlide} />

          <div className="relative z-20 mx-auto w-full max-w-[1280px] px-4 pt-8 pb-16 sm:px-6 lg:px-8 lg:pt-10 lg:pb-20">
            <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-center">
              <div className="lg:col-span-5 space-y-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--vs-accent)]">
                  Wearable Early Health Warning System
                </p>

                <h1 className="font-display max-w-lg text-[clamp(2.25rem,3.9vw,3.4rem)] font-extrabold leading-[1.06] tracking-[-0.036em] text-balance text-[var(--vs-text)]">
                  Understand Your Health{' '}
                  <span className="font-editorial italic font-medium text-[var(--vs-accent)]">
                    Before Changes Go Unnoticed.
                  </span>
                </h1>

                <p className="max-w-md text-[15.5px] sm:text-[17px] leading-relaxed text-[var(--vs-text-secondary)]">
                  VITALSENSE tracks Heart Rate, SpO₂, Sleep, and Daily Steps from your wearable, learns what is normal for you, and alerts you and your caregivers early in plain English.
                </p>

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => handleQuickDemo('member', '/app/dashboard')}
                    disabled={enteringDemo}
                    className="vs-btn-primary inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold whitespace-nowrap"
                  >
                    {enteringDemo ? 'Opening...' : 'Explore Your Health'}
                    <ArrowRight className="h-4 w-4" />
                  </button>

                  <a
                    href="#how-it-works"
                    className="vs-btn-secondary inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold whitespace-nowrap"
                  >
                    See How It Works
                  </a>
                </div>

                <div className="pt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-medium text-[var(--vs-text-secondary)]">
                  <span>Showing: {HERO_STORY_SLIDES[activeSlide]?.tabLabel}</span>
                  <span aria-hidden="true">·</span>
                  <button
                    type="button"
                    onClick={() => handleQuickDemo('caregiver', '/caregiver')}
                    disabled={enteringDemo}
                    className="underline decoration-current/40 underline-offset-4 hover:opacity-80 whitespace-nowrap"
                  >
                    Caregiver View
                  </button>
                  <span aria-hidden="true">·</span>
                  <Link
                    to="/login"
                    className="underline decoration-current/40 underline-offset-4 hover:opacity-80 whitespace-nowrap"
                  >
                    Sign in
                  </Link>
                </div>
              </div>

              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="lg:col-span-7 flex lg:justify-end"
              >
                <HeroAutoSlider
                  themeId={themeId}
                  activeSlide={activeSlide}
                  direction={slideDirection}
                  slideResetNonce={heroSlideState.resetNonce}
                  isHovered={isSlideHovered}
                  onSelectSlide={handleSelectSlide}
                  onHoverChange={setIsSlideHovered}
                  previewData={previewData}
                  syncRows={syncRows}
                  previewMetric={previewMetric}
                  onSelectMetric={setPreviewMetric}
                  onEnterWorkspace={handleQuickDemo}
                  enteringDemo={enteringDemo}
                />
              </motion.div>
            </div>
          </div>
        </section>

        {/* SECTION 2 — HOW IT WORKS (WHITE) */}
        <section
          id="how-it-works"
          className="scroll-mt-20 border-b border-[var(--vs-border)] bg-[var(--vs-bg)] py-16 lg:py-20"
        >
          <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--vs-accent)]">
                1 · Personal Health &amp; Workflow
              </p>
              <h2 className="mt-2 font-display text-3xl sm:text-[2.15rem] lg:text-[2.35rem] font-bold tracking-[-0.024em] text-[var(--vs-text)] text-balance">
                Simple Health Monitoring. Smarter Insights.
              </h2>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  idx: '01',
                  num: 'Collect',
                  body: 'Heart rate, SpO₂, sleep hours, and daily steps are gathered from your wearable or CSV export.',
                  icon: Activity,
                },
                {
                  idx: '02',
                  num: 'Learn',
                  body: 'VITALSENSE learns what is normal for you over time rather than using one-size-fits-all limits.',
                  icon: TrendingUp,
                },
                {
                  idx: '03',
                  num: 'Detect',
                  body: 'Sustained changes lasting multiple days are separated from brief one-night spikes.',
                  icon: Clock,
                },
                {
                  idx: '04',
                  num: 'Inform',
                  body: 'Clear, everyday-English summaries keep both you and authorised caregivers aware.',
                  icon: BellRing,
                },
              ].map((step) => {
                const Icon = step.icon;
                return (
                  <div key={step.num} className="vs-glass-card p-6 space-y-3.5">
                    <div className="flex items-center justify-between">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--vs-accent-soft)] text-[var(--vs-accent)]">
                        <Icon className="h-4 w-4" />
                      </div>
                      <span className="font-mono-num text-xs font-semibold text-[var(--vs-text-muted)]">
                        {step.idx}
                      </span>
                    </div>
                    <h3 className="font-display text-lg font-semibold text-[var(--vs-text)]">
                      {step.num}
                    </h3>
                    <p className="text-sm leading-relaxed text-[var(--vs-text-secondary)]">
                      {step.body}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* SECTION 3 — PERSONAL BASELINE (SOFT LAVENDER) */}
        <section
          id="baseline-section"
          className="scroll-mt-20 border-b border-[var(--vs-border)] bg-[var(--vs-bg-subtle)] py-16 lg:py-24"
        >
          <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-center">
              <div className="lg:col-span-5 space-y-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--vs-accent)]">
                  2 · Personal Baseline
                </p>
                <h2 className="font-display text-3xl sm:text-[2.15rem] lg:text-[2.35rem] font-bold tracking-[-0.024em] text-[var(--vs-text)] text-balance">
                  Your Normal Is Different From Everyone Else&apos;s.
                </h2>
                <p className="text-sm sm:text-base leading-relaxed text-[var(--vs-text-secondary)]">
                  VITALSENSE learns your personal health patterns from your own wearable history instead of comparing everyone to generic numbers.
                </p>

                <div className="flex flex-wrap gap-2 pt-2">
                  {(['elena', 'arjun'] as const).map((key) => {
                    const active = baselineDemoKey === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setBaselineDemoKey(key)}
                        className={`rounded-xl border px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                          active
                            ? 'border-[var(--vs-accent)] bg-[var(--vs-accent)] text-[var(--vs-accent-contrast)]'
                            : 'border-[var(--vs-border)] bg-[var(--vs-surface)] text-[var(--vs-text-secondary)] hover:text-[var(--vs-text)]'
                        }`}
                      >
                        {PERSONAL_BASELINE_EXAMPLES[key].name}
                      </button>
                    );
                  })}
                </div>

                <p className="rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface)] px-4 py-3 text-xs leading-relaxed text-[var(--vs-text-secondary)]">
                  {baselineExample.explanation}
                </p>
              </div>

              <div className="lg:col-span-7 vs-glass-card p-6 sm:p-8 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--vs-border)] pb-3.5">
                  <div>
                    <p className="text-sm font-semibold text-[var(--vs-text)]">
                      Your Usual Range vs. Recent Reading
                    </p>
                    <p className="text-xs text-[var(--vs-text-muted)]">
                      Learned dynamically from your rolling 14-day wearable history.
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-[var(--vs-text-secondary)]">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-indigo-500/20 border border-indigo-500" />
                      Usual range
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${
                          baselineDemoKey === 'elena' ? 'bg-amber-500' : 'bg-[#4F46E5]'
                        }`}
                      />
                      Latest reading
                    </span>
                  </div>
                </div>

                <div className="rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface)] p-3">
                  <div style={{ width: '100%', height: 220 }}>
                    <CurvePointerOverlay
                      accentColor={baselineDemoKey === 'elena' ? '#D97706' : '#4F46E5'}
                      scrubberSeries={{
                        metricLabel: 'Heart Rate',
                        unit: 'bpm',
                        precision: 1,
                        baselineMean: baselineExample.mean,
                        points: baselineExample.points.map((pt, i) => ({
                          label: pt.day,
                          timestamp: `2026-11-${String(18 + i).padStart(2, '0')}T07:05:00.000Z`,
                          value: pt.bpm,
                          note: `Usual range: ${baselineExample.bandLow}–${baselineExample.bandHigh} bpm`,
                        })),
                      }}
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={baselineExample.points} margin={{ top: 12, right: 18, left: -12, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                          <XAxis dataKey="day" tick={chartAxisTick} tickLine={false} axisLine={{ stroke: '#E2E8F0' }} />
                          <YAxis domain={[48, 74]} tick={chartAxisTick} tickLine={false} axisLine={false} width={44} />
                          <Tooltip content={() => null} />
                          <ReferenceArea
                            y1={baselineExample.bandLow}
                            y2={baselineExample.bandHigh}
                            fill="#6366F1"
                            fillOpacity={0.11}
                          />
                          <ReferenceLine y={baselineExample.mean} stroke="#4F46E5" strokeDasharray="4 4" />
                          <Area
                            type="monotone"
                            dataKey="bpm"
                            stroke={baselineDemoKey === 'elena' ? '#D97706' : '#4F46E5'}
                            strokeWidth={2.2}
                            fill="#EEF2FF"
                            fillOpacity={0.5}
                            dot={(props) => {
                              const { cx, cy, payload, index } = props;
                              if (typeof cx !== 'number' || typeof cy !== 'number') return null;
                              const isNow = payload?.day === 'Now';
                              const color = isNow && baselineDemoKey === 'elena' ? '#D97706' : '#4F46E5';
                              return (
                                <circle
                                  key={`bpt-${index}`}
                                  cx={cx}
                                  cy={cy}
                                  r={isNow ? 5 : 3}
                                  fill={isNow ? color : '#FFFFFF'}
                                  stroke={color}
                                  strokeWidth={2}
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

                <div className="grid grid-cols-3 gap-3 border-t border-[var(--vs-border)] pt-4 text-xs">
                  <div className="rounded-xl border border-[var(--vs-border)] bg-[var(--vs-bg-subtle)] px-3 py-2.5">
                    <p className="text-[11px] text-[var(--vs-text-muted)]">Usual average</p>
                    <p className="mt-0.5 font-mono-num text-sm font-semibold">{baselineExample.mean} bpm</p>
                  </div>
                  <div className="rounded-xl border border-[var(--vs-border)] bg-[var(--vs-bg-subtle)] px-3 py-2.5">
                    <p className="text-[11px] text-[var(--vs-text-muted)]">Normal range</p>
                    <p className="mt-0.5 font-mono-num text-sm font-semibold">
                      {baselineExample.bandLow}–{baselineExample.bandHigh} bpm
                    </p>
                  </div>
                  <div className="rounded-xl border border-[var(--vs-border)] bg-[var(--vs-bg-subtle)] px-3 py-2.5">
                    <p className="text-[11px] text-[var(--vs-text-muted)]">Latest reading</p>
                    <p className="mt-0.5 font-mono-num text-sm font-semibold">
                      {baselineExample.current} bpm
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 4 — EARLY DETECTION (WHITE) */}
        <section
          id="early-detection"
          className="scroll-mt-20 border-b border-[var(--vs-border)] bg-[var(--vs-bg)] py-16 lg:py-24"
        >
          <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--vs-accent)]">
                3 · Early Detection
              </p>
              <h2 className="font-display text-3xl sm:text-[2.15rem] lg:text-[2.35rem] font-bold tracking-[-0.024em] text-[var(--vs-text)] text-balance">
                Notice Changes That Last.
              </h2>
              <p className="text-sm sm:text-base leading-relaxed text-[var(--vs-text-secondary)]">
                One unusual night may not mean much. VITALSENSE filters brief noise and highlights steady changes across multiple days.
              </p>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-center">
              <div className="lg:col-span-5 space-y-3">
                {[
                  {
                    day: 'Day 1',
                    title: 'First higher reading noticed',
                    reading: '67.3 bpm vs 62.9 bpm usual',
                    note: 'A single higher morning is recorded quietly without creating an unnecessary alarm.',
                    highlighted: false,
                  },
                  {
                    day: 'Day 2',
                    title: 'Change continues',
                    reading: '68.4 bpm · 2nd day higher',
                    note: 'The elevated heart rate remains outside Elena’s usual range for a second consecutive day.',
                    highlighted: false,
                  },
                  {
                    day: 'Day 3',
                    title: 'Sustained change confirmed',
                    reading: '69.7 bpm · Day 3',
                    note: 'Because the change lasted three days in a row with good wearable coverage, VITALSENSE prepares a clear notice.',
                    highlighted: true,
                  },
                ].map((item) => (
                  <div
                    key={item.day}
                    className={`rounded-2xl border p-4 ${
                      item.highlighted
                        ? 'border-amber-300 bg-amber-50/70'
                        : 'border-[var(--vs-border)] bg-[var(--vs-bg-subtle)]'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                      <span className="font-mono-num text-xs font-semibold text-[var(--vs-accent)]">
                        {item.day}: {item.title}
                      </span>
                      <span className="font-mono-num text-xs text-[var(--vs-text-muted)]">
                        {item.reading}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-[var(--vs-text-secondary)]">
                      {item.note}
                    </p>
                  </div>
                ))}
              </div>

              <div className="lg:col-span-7 vs-glass-card p-6 sm:p-8 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--vs-border)] pb-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--vs-text)]">
                      Personal Usual Range vs. 3-Day Sustained Shift
                    </p>
                    <p className="font-mono-num text-[11px] text-[var(--vs-text-muted)]">
                      Upper usual range: 67.1 bpm · Day 3: 69.7 bpm
                    </p>
                  </div>
                  <span className="font-mono-num text-xs font-semibold text-amber-700">
                    3 days above normal
                  </span>
                </div>

                <div className="rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface)] p-3">
                  <div style={{ width: '100%', height: 215 }}>
                    <CurvePointerOverlay
                      accentColor="#D97706"
                      scrubberSeries={{
                        metricLabel: 'Heart Rate',
                        unit: 'bpm',
                        precision: 1,
                        baselineMean: 62.9,
                        points: EARLY_DETECTION_CHART_DATA.map((pt, i) => ({
                          label: pt.day,
                          timestamp: `2026-11-${String(19 + i).padStart(2, '0')}T07:10:00.000Z`,
                          value: pt.bpm,
                          note: pt.shifted ? 'Outside usual range' : 'Within usual range',
                        })),
                      }}
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={EARLY_DETECTION_CHART_DATA} margin={{ top: 10, right: 16, left: -12, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                          <XAxis dataKey="day" tick={chartAxisTick} tickLine={false} axisLine={{ stroke: '#E2E8F0' }} />
                          <YAxis domain={[57, 73]} tick={chartAxisTick} tickLine={false} axisLine={false} width={44} />
                          <Tooltip content={() => null} />
                          <ReferenceArea y1={58.7} y2={67.1} fill="#6366F1" fillOpacity={0.1} />
                          <ReferenceLine y={67.1} stroke="#4F46E5" strokeDasharray="4 4" />
                          <Area
                            type="monotone"
                            dataKey="bpm"
                            stroke="#D97706"
                            strokeWidth={2.3}
                            fill="#FEF3C7"
                            fillOpacity={0.4}
                            dot={(props) => {
                              const { cx, cy, payload, index } = props;
                              if (typeof cx !== 'number' || typeof cy !== 'number') return null;
                              const shifted = Boolean(payload?.shifted);
                              return (
                                <circle
                                  key={`early-${index}`}
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

                <p className="rounded-xl border border-[var(--vs-border)] bg-[var(--vs-bg-subtle)] px-4 py-2.5 text-xs text-[var(--vs-text-secondary)]">
                  Informational pattern tracking only: highlights multi-day shifts outside your usual wearable pattern without making medical diagnoses.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 5 — EXPLAINABLE AI (SOFT LAVENDER) */}
        <section
          id="explainable-alerts"
          className="scroll-mt-20 border-b border-[var(--vs-border)] bg-[var(--vs-bg-subtle)] py-16 lg:py-24"
        >
          <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-center">
              <div className="lg:col-span-5 space-y-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--vs-accent)]">
                  4 · Explainable AI
                </p>
                <h2 className="font-display text-3xl sm:text-[2.15rem] lg:text-[2.35rem] font-bold tracking-[-0.024em] text-[var(--vs-text)] text-balance">
                  Every Alert Comes With a Clear Reason.
                </h2>
                <p className="text-sm sm:text-base leading-relaxed text-[var(--vs-text-secondary)]">
                  Instead of cryptic numbers or unexplained scores, every alert shows what changed, how long it lasted, what it was compared against, and lets you ask follow-up questions in plain English.
                </p>
                <button
                  type="button"
                  onClick={() => handleQuickDemo('member', '/app/insights')}
                  disabled={enteringDemo}
                  className="vs-btn-primary inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-xs sm:text-sm font-semibold"
                >
                  Ask About Your Data
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>

              <div className="lg:col-span-7">
                <div className="vs-glass-card p-6 sm:p-8 space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--vs-border)] pb-4">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                        <BellRing className="h-5 w-5" />
                      </span>
                      <div>
                        <p className="text-xs text-[var(--vs-text-muted)]">Plain-English Alert Summary</p>
                        <h3 className="font-display text-lg font-semibold text-[var(--vs-text)]">
                          Unusual Heart Rate &amp; Activity Pattern
                        </h3>
                      </div>
                    </div>
                    <span className="font-mono-num text-xs font-medium text-[var(--vs-success)]">
                      Good coverage · 94%
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="rounded-xl border border-[var(--vs-border)] bg-[var(--vs-bg-subtle)] p-4">
                      <p className="text-xs font-semibold text-[var(--vs-text-muted)]">What changed?</p>
                      <p className="mt-1 text-sm text-[var(--vs-text)]">
                        Resting heart rate rose to {liveHrVal} bpm (+{(Number(liveHrVal) - Number(liveBaselineVal)).toFixed(1)} bpm higher than usual) while daily steps dropped to {latestStepsStr}.
                      </p>
                    </div>
                    <div className="rounded-xl border border-[var(--vs-border)] bg-[var(--vs-bg-subtle)] p-4">
                      <p className="text-xs font-semibold text-[var(--vs-text-muted)]">How long?</p>
                      <p className="mt-1 text-sm text-[var(--vs-text)]">
                        Continued across 3 consecutive days (Tuesday to Thursday).
                      </p>
                    </div>
                    <div className="rounded-xl border border-[var(--vs-border)] bg-[var(--vs-bg-subtle)] p-4">
                      <p className="text-xs font-semibold text-[var(--vs-text-muted)]">Compared with?</p>
                      <p className="mt-1 text-sm text-[var(--vs-text)]">
                        Elena’s personal baseline of {liveBaselineVal} bpm learned from her past 14 days.
                      </p>
                    </div>
                    <div className="rounded-xl border border-[var(--vs-border)] bg-[var(--vs-bg-subtle)] p-4">
                      <p className="text-xs font-semibold text-[var(--vs-text-muted)]">Data quality</p>
                      <p className="mt-1 text-sm text-[var(--vs-text)]">
                        Good coverage (94% valid wearable readings with SpO₂ stable at {spo2Snapshot?.value ?? '97.8'}%).
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 6 — HEALTH TIMELINE PREVIEW (WHITE + LAVENDER CARDS — NO DARK GLASS) */}
        <section
          id="timeline-preview"
          className="scroll-mt-20 border-b border-[var(--vs-border)] bg-[var(--vs-bg)] py-16 lg:py-24"
        >
          <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div className="max-w-2xl space-y-3">
                <p className="font-mono-num text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--vs-accent)]">
                  Health Timeline
                </p>
                <h2 className="font-display text-3xl font-bold tracking-tight text-[var(--vs-text)] sm:text-4xl text-balance">
                  See When the Change First Appeared.
                </h2>
                <p className="text-sm sm:text-base leading-relaxed text-[var(--vs-text-secondary)]">
                  Follow the exact progression from a normal Monday to the moment a sustained change was noticed and shared.
                </p>
              </div>

              <button
                type="button"
                onClick={() => handleQuickDemo('member', '/app/timeline')}
                disabled={enteringDemo}
                className="vs-btn-primary inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold"
              >
                Explore Health Timeline
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-8 rounded-2xl border border-[var(--vs-border-strong)] bg-[var(--vs-bg-subtle)] p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-[var(--vs-text)]">
                  Day-by-Day Progression
                </span>
                <span className="font-mono-num text-[11px] font-semibold text-[var(--vs-accent)]">
                  Selected: {activeTimelineStep.day} · {activeTimelineStep.reading}
                </span>
              </div>

              <div className="rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface)] p-3">
                <div style={{ width: '100%', height: 155 }}>
                  <CurvePointerOverlay
                    accentColor="#4F46E5"
                    scrubberSeries={{
                      metricLabel: 'Heart Rate',
                      unit: 'bpm',
                      precision: 1,
                      baselineMean: 62.9,
                      points: TIMELINE_CURVE_DATA.map((pt, i) => ({
                        label: pt.day,
                        timestamp: `2026-11-${String(21 + Math.min(3, i)).padStart(2, '0')}T07:02:00.000Z`,
                        value: pt.bpm,
                        note: pt.label,
                      })),
                    }}
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={TIMELINE_CURVE_DATA} margin={{ top: 8, right: 16, left: -12, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                        <XAxis dataKey="day" tick={chartAxisTick} tickLine={false} axisLine={{ stroke: '#E2E8F0' }} />
                        <YAxis domain={[58, 72]} tick={chartAxisTick} tickLine={false} axisLine={false} width={44} />
                        <Tooltip content={() => null} />
                        <ReferenceArea y1={58.7} y2={67.1} fill="#6366F1" fillOpacity={0.09} />
                        <ReferenceLine y={67.1} stroke="#4F46E5" strokeDasharray="4 4" />
                        <Area
                          type="monotone"
                          dataKey="bpm"
                          stroke="#4F46E5"
                          strokeWidth={2.2}
                          fill="#EEF2FF"
                          fillOpacity={0.8}
                          dot={{ r: 4, fill: '#FFFFFF', stroke: '#4F46E5', strokeWidth: 2 }}
                          isAnimationActive={false}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CurvePointerOverlay>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
                {FIRST_DETECTED_TIMELINE.map((step, idx) => {
                  const active = activeTimelineIdx === idx;
                  return (
                    <button
                      key={step.day}
                      type="button"
                      onClick={() => setActiveTimelineIdx(idx)}
                      className={`rounded-xl border p-4 text-left transition-colors ${
                        active
                          ? 'border-[var(--vs-accent)] bg-[var(--vs-surface)] shadow-xs'
                          : 'border-[var(--vs-border)] bg-[var(--vs-surface)]/80 hover:bg-[var(--vs-surface)]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono-num text-xs font-semibold text-[var(--vs-accent)]">
                          {step.day}
                        </span>
                        <span className="font-mono-num text-[11px] text-[var(--vs-text-muted)]">
                          {step.status}
                        </span>
                      </div>
                      <p className="mt-2 font-display text-sm font-semibold text-[var(--vs-text)]">
                        {step.label}
                      </p>
                      <p className="mt-1 font-mono-num text-xs text-[var(--vs-text-secondary)]">
                        {step.reading}
                      </p>
                    </button>
                  );
                })}
              </div>

              <div className="rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface)] p-4 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="font-mono-num text-xs font-semibold text-[var(--vs-accent)]">
                    {activeTimelineStep.day} — {activeTimelineStep.label}
                  </p>
                  <p className="mt-1 text-sm text-[var(--vs-text-secondary)]">{activeTimelineStep.detail}</p>
                </div>
                <span className="font-mono-num text-sm font-semibold text-[var(--vs-text)]">
                  {activeTimelineStep.reading}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 7 — CAREGIVER ALERTS (SOFT LAVENDER) */}
        <section
          id="caregiver-summary"
          className="scroll-mt-20 border-b border-[var(--vs-border)] bg-[var(--vs-bg-subtle)] py-16 lg:py-24"
        >
          <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-center">
              <div className="lg:col-span-5 space-y-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--vs-accent)]">
                  5 · Caregiver Alerts
                </p>
                <h2 className="font-display text-3xl sm:text-[2.15rem] lg:text-[2.35rem] font-bold tracking-[-0.024em] text-[var(--vs-text)] text-balance">
                  Clear Information for the People Who Care.
                </h2>
                <p className="text-sm sm:text-base leading-relaxed text-[var(--vs-text-secondary)]">
                  Caregivers see a simple reason, when the change was noticed, and follow-up status without having to interpret raw medical charts.
                </p>

                <button
                  type="button"
                  onClick={() => handleQuickDemo('caregiver', '/caregiver')}
                  disabled={enteringDemo}
                  className="vs-btn-secondary inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-xs sm:text-sm font-semibold"
                >
                  Open Caregiver Centre
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>

              <div className="lg:col-span-7 vs-glass-card p-6 sm:p-8 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--vs-border)] pb-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--vs-border-strong)] bg-[var(--vs-accent-soft)] font-display text-xs font-bold text-[var(--vs-accent-soft-text)]">
                      SV
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-[var(--vs-text)]">
                        Caregiver Summary for Elena Rostova
                      </p>
                      <p className="text-xs text-[var(--vs-text-muted)]">
                        Shared with Sarah Vance (Daughter) · Checked in at 08:14
                      </p>
                    </div>
                  </div>
                  <CheckCircle2 className="h-5 w-5 text-[var(--vs-success)] shrink-0" />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs">
                  <div className="rounded-xl border border-[var(--vs-border)] bg-[var(--vs-bg-subtle)] p-3.5">
                    <p className="font-semibold text-[var(--vs-text-muted)]">Clear reason</p>
                    <p className="mt-1 text-sm text-[var(--vs-text)]">
                      Resting heart rate averaged {liveHrVal} bpm instead of Elena’s usual {liveBaselineVal} bpm.
                    </p>
                  </div>
                  <div className="rounded-xl border border-[var(--vs-border)] bg-[var(--vs-bg-subtle)] p-3.5">
                    <p className="font-semibold text-[var(--vs-text-muted)]">Time noticed</p>
                    <p className="mt-1 text-sm text-[var(--vs-text)]">
                      First noticed Tuesday and continued through Thursday (3 days).
                    </p>
                  </div>
                  <div className="rounded-xl border border-[var(--vs-border)] bg-[var(--vs-bg-subtle)] p-3.5">
                    <p className="font-semibold text-[var(--vs-text-muted)]">Signals involved</p>
                    <p className="mt-1 text-sm text-[var(--vs-text)]">
                      Heart rate, shorter sleep ({latestSleepStr} hrs), and fewer steps ({latestStepsStr}).
                    </p>
                  </div>
                  <div className="rounded-xl border border-[var(--vs-border)] bg-[var(--vs-bg-subtle)] p-3.5">
                    <p className="font-semibold text-[var(--vs-text-muted)]">Follow-up status</p>
                    <p className="mt-1 text-sm text-[var(--vs-text)]">
                      Sarah acknowledged the alert and checked in by phone.
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-[var(--vs-border-strong)] bg-[var(--vs-bg-subtle)] p-4 flex items-start gap-3">
                  <Sparkles className="h-4 w-4 shrink-0 text-[var(--vs-accent)] mt-0.5" />
                  <p className="text-xs leading-relaxed text-[var(--vs-text-secondary)]">
                    <span className="font-semibold text-[var(--vs-text)]">Next step:</span>{' '}
                    Encourage rest, fluids, and a calm check-in today. If this pattern continues, share the summary with a doctor. Informational support only — not a medical diagnosis.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 8 — HEALTH DASHBOARD PREVIEW (WHITE) */}
        <section
          id="dashboard-preview"
          className="scroll-mt-20 border-b border-[var(--vs-border)] bg-[var(--vs-bg)] py-16 lg:py-24"
        >
          <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="max-w-2xl">
                <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--vs-accent)]">
                  Health Overview Preview
                </p>
                <h2 className="mt-2 font-display text-3xl sm:text-[2.15rem] lg:text-[2.35rem] font-bold tracking-[-0.024em] text-[var(--vs-text)] text-balance">
                  Your 4 Core Wearable Signals in One Place.
                </h2>
              </div>
              <button
                type="button"
                onClick={() => handleQuickDemo('member', '/app/dashboard')}
                disabled={enteringDemo}
                className="vs-btn-primary inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-xs sm:text-sm font-semibold"
              >
                Open Full Dashboard
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>

            <div className="vs-glass-card mt-8 p-6 sm:p-8 space-y-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  {
                    label: 'Heart rate',
                    value: `${liveHrVal} bpm`,
                    sub: `Usual average: ${liveBaselineVal} bpm`,
                    pct: 82,
                    shifted: true,
                    icon: HeartPulse,
                  },
                  {
                    label: 'Blood Oxygen (SpO₂)',
                    value: `${spo2Snapshot?.value ?? '97.8'}%`,
                    sub: 'Inside normal range',
                    pct: 95,
                    shifted: false,
                    icon: Wind,
                  },
                  {
                    label: 'Sleep',
                    value: `${latestSleepStr} hrs`,
                    sub: 'Slightly shorter last 3 nights',
                    pct: 64,
                    shifted: true,
                    icon: Moon,
                  },
                  {
                    label: 'Daily steps',
                    value: `${latestStepsStr}`,
                    sub: 'Down from 7,200 usual steps',
                    pct: 58,
                    shifted: true,
                    icon: Footprints,
                  },
                ].map((metric) => {
                  const Icon = metric.icon;
                  return (
                    <div
                      key={metric.label}
                      className="rounded-xl border border-[var(--vs-border)] bg-[var(--vs-bg-subtle)] p-4"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[13px] font-medium text-[var(--vs-text-secondary)]">
                          {metric.label}
                        </span>
                        <Icon className="h-4 w-4 text-[var(--vs-accent)]" />
                      </div>
                      <p className="mt-2 vs-kpi-num text-2xl font-bold text-[var(--vs-text)]">
                        {metric.value}
                      </p>
                      <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--vs-border)]">
                        <div
                          className={`h-full rounded-full ${metric.shifted ? 'bg-amber-500' : 'bg-[var(--vs-accent)]'}`}
                          style={{ width: `${metric.pct}%` }}
                        />
                      </div>
                      <p className="mt-1.5 text-xs text-[var(--vs-text-muted)]">{metric.sub}</p>
                    </div>
                  );
                })}
              </div>

              {previewData?.readings && previewData.readings.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold text-[var(--vs-text-secondary)]">
                    Recent Daily Steps (17-Day Wearable Log)
                  </p>
                  <DailyStepsBarChart readings={previewData.readings} height={200} />
                </div>
              )}
            </div>
          </div>
        </section>

        {/* SECTION 9 — PRIVACY & TRUST (SOFT LAVENDER) */}
        <section
          id="privacy"
          className="scroll-mt-20 border-b border-[var(--vs-border)] bg-[var(--vs-bg-subtle)] py-16 lg:py-20"
        >
          <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-start">
              <div className="lg:col-span-4 space-y-2">
                <div className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--vs-accent)]">
                  <ShieldCheck className="h-4 w-4" />
                  Privacy &amp; Trust
                </div>
                <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[var(--vs-text)] text-balance">
                  Your Health Data Stays Under Your Control.
                </h2>
              </div>

              <div className="lg:col-span-8 grid grid-cols-1 gap-6 sm:grid-cols-3">
                {[
                  {
                    icon: Lock,
                    title: 'Private by default',
                    body: 'Your wearable readings remain in your personal account unless you choose to share them.',
                  },
                  {
                    icon: ShieldCheck,
                    title: 'Caregiver permission controls',
                    body: 'You decide which caregivers can view summaries or alerts, and you can pause sharing anytime.',
                  },
                  {
                    icon: Sparkles,
                    title: 'Clear explanations',
                    body: 'Every alert explains what changed against your own baseline in everyday language.',
                  },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.title} className="vs-glass-card p-5 space-y-2.5">
                      <Icon className="h-4 w-4 text-[var(--vs-accent)]" />
                      <h3 className="font-display text-sm font-semibold text-[var(--vs-text)]">
                        {item.title}
                      </h3>
                      <p className="text-xs sm:text-sm leading-relaxed text-[var(--vs-text-secondary)]">
                        {item.body}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 10 — FINAL CTA (WHITE) */}
        <section className="bg-[var(--vs-bg)] py-16 lg:py-20">
          <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="font-display text-3xl font-bold tracking-tight text-[var(--vs-text)] sm:text-4xl text-balance">
              Stay Aware of What Changes.
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm sm:text-base text-[var(--vs-text-secondary)]">
              Understand your personal patterns across heart rate, SpO₂, sleep, and daily steps before gradual shifts go unnoticed.
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => handleQuickDemo('member', '/app/dashboard')}
                disabled={enteringDemo}
                className="vs-btn-primary inline-flex items-center gap-2 rounded-full px-7 py-3 text-sm font-semibold"
              >
                {enteringDemo ? 'Opening...' : 'Explore VITALSENSE'}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--vs-border)] bg-[var(--vs-bg-subtle)] py-10">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-4 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5 font-display text-sm font-bold text-[var(--vs-text)]">
            <Activity className="h-4 w-4 text-[var(--vs-accent)]" />
            VITALSENSE
          </div>
          <p className="text-xs text-[var(--vs-text-muted)]">
            Wearable health pattern early-warning prototype · Informational support only, not a medical diagnosis.
          </p>
          <div className="flex items-center gap-5 text-xs font-medium text-[var(--vs-text-secondary)]">
            <Link to="/login" className="hover:text-[var(--vs-text)]">
              Sign In
            </Link>
            <Link to="/signup" className="hover:text-[var(--vs-text)]">
              Create Account
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
