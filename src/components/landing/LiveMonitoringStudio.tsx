import { useEffect, useState } from 'react';
import {
  Activity,
  ArrowRight,
  Camera,
  HeartHandshake,
  Lock,
  ShieldCheck,
  Smile,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { generateSimulatedLiveSample } from '../../lib/intelligenceEngine';
import type { MetricKey, VitalReading } from '../../lib/types';
import { VitalTrendChart } from '../charts/VitalTrendChart';
import { LiveWaveformCanvas } from './LiveWaveformCanvas';

interface LiveMonitoringStudioProps {
  readings: VitalReading[];
  onOpenWorkspace: (role?: 'member' | 'caregiver', route?: string) => void;
}

type StudioTab = 'vitals' | 'camera' | 'wellbeing';

const STUDIO_TABS: { id: StudioTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'vitals', label: 'Wearable Stream', icon: Activity },
  { id: 'camera', label: 'Camera Pulse Check', icon: Camera },
  { id: 'wellbeing', label: 'Sleep & Wellbeing', icon: HeartHandshake },
];

export function LiveMonitoringStudio({
  readings,
  onOpenWorkspace,
}: LiveMonitoringStudioProps) {
  const [activeTab, setActiveTab] = useState<StudioTab>('vitals');
  const [simScenario, setSimScenario] = useState<'normal' | 'gradual_drift' | 'noisy_gap'>('normal');
  const [step, setStep] = useState<number>(0);
  const [chartMetric, setChartMetric] = useState<MetricKey>('heartRate');

  const [cameraConsentGranted, setCameraConsentGranted] = useState<boolean>(false);
  const [lightingMode, setLightingMode] = useState<'good' | 'low_light'>('good');

  const [selectedMood, setSelectedMood] = useState<'calm' | 'tired' | 'isolated'>('calm');
  const [wellbeingImgFailed, setWellbeingImgFailed] = useState<boolean>(false);

  useEffect(() => {
    const id = window.setInterval(() => {
      setStep((prev) => prev + 1);
    }, 2500);
    return () => window.clearInterval(id);
  }, []);

  const currentSample = generateSimulatedLiveSample({
    sessionId: 'studio_preview',
    deviceName: 'Simulated Wearable Feed',
    stepIndex: step,
    scenario: simScenario,
  });

  return (
    <section
      id="live-studio"
      className="border-b border-[var(--vs-border)] bg-[var(--vs-bg)] py-16 lg:py-20"
    >
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-lg">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--vs-accent)]">
              Interactive Health Studio
            </p>
            <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-[var(--vs-text)] sm:text-3xl text-balance">
              Test wearable trends, camera pulse checks, and daily wellbeing in one place.
            </h2>
          </div>

          <div
            role="tablist"
            aria-label="Live Monitoring Studio modules"
            className="flex flex-wrap lg:flex-nowrap shrink-0 items-center gap-1 rounded-xl border border-[var(--vs-border)] bg-[var(--vs-bg-subtle)] p-1.5"
          >
            {STUDIO_TABS.map((tab) => {
              const Icon = tab.icon;
              const isSelected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    isSelected
                      ? 'bg-[var(--vs-btn-primary-bg)] text-[var(--vs-btn-primary-text)]'
                      : 'text-[var(--vs-text-secondary)] hover:bg-[var(--vs-surface)] hover:text-[var(--vs-text)]'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-8 vs-surface-card p-5 sm:p-7">
          <AnimatePresence mode="wait" initial={false}>
            {activeTab === 'vitals' && (
              <motion.div
                key="studio-vitals"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.24 }}
                className="grid grid-cols-1 gap-6 lg:grid-cols-12"
              >
                <div className="lg:col-span-5 space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono-num text-[11px] font-semibold uppercase tracking-wider text-[var(--vs-warning)]">
                      Simulated Wearable Preview
                    </span>
                    <span className="font-mono-num text-xs text-[var(--vs-text-muted)]">
                      Coverage {currentSample.signalQuality}/100
                    </span>
                  </div>

                  <h3 className="font-display text-xl font-semibold text-[var(--vs-text)]">
                    Continuous wearable awareness compared with your usual range
                  </h3>
                  <p className="text-sm leading-relaxed text-[var(--vs-text-secondary)]">
                    Switch sample modes below to see how VITALSENSE tracks heart rate and blood
                    oxygen, notices multi-day changes, and flags missing wearable readings clearly.
                  </p>

                  <div className="flex flex-wrap gap-1.5">
                    {(
                      [
                        ['normal', 'Normal Pattern'],
                        ['gradual_drift', '3-Day Change'],
                        ['noisy_gap', 'Missing Sensor Data'],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setSimScenario(id)}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                          simScenario === id
                            ? 'border-[var(--vs-accent)] bg-[var(--vs-accent-soft)] text-[var(--vs-accent-soft-text)]'
                            : 'border-[var(--vs-border)] bg-[var(--vs-surface-muted)] text-[var(--vs-text-secondary)]'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 text-xs">
                    <div className="rounded-xl border border-[var(--vs-border)] bg-[var(--vs-bg-subtle)] p-3">
                      <p className="text-[var(--vs-text-muted)]">Heart Rate</p>
                      <p className="mt-1 font-mono-num text-lg font-semibold text-[var(--vs-text)]">
                        {currentSample.heartRate ?? '—'} <span className="text-xs font-normal">bpm</span>
                      </p>
                    </div>
                    <div className="rounded-xl border border-[var(--vs-border)] bg-[var(--vs-bg-subtle)] p-3">
                      <p className="text-[var(--vs-text-muted)]">Blood Oxygen (SpO₂)</p>
                      <p className="mt-1 font-mono-num text-lg font-semibold text-[var(--vs-text)]">
                        {currentSample.spo2 !== null ? `${currentSample.spo2}%` : 'Unavailable'}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onOpenWorkspace('member', '/app/live-vitals')}
                    className="vs-btn-primary inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold whitespace-nowrap"
                  >
                    Open Live Readings View
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="lg:col-span-7 space-y-4">
                  <LiveWaveformCanvas
                    heartRateBpm={currentSample.heartRate ?? 64}
                    spo2Pct={currentSample.spo2 ?? 97.8}
                    sourceLabel={currentSample.deviceName}
                    isSimulated
                    height={145}
                  />

                  <div className="rounded-xl border border-[var(--vs-border)] bg-[var(--vs-bg-subtle)] p-3.5">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-[var(--vs-text)]">
                        Recent Readings vs. Usual Pattern
                      </span>
                      <div className="flex gap-1">
                        {(['heartRate', 'spo2', 'hrv'] as MetricKey[]).map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setChartMetric(m)}
                            className={`rounded-md px-2 py-1 text-[11px] font-medium ${
                              chartMetric === m
                                ? 'bg-[var(--vs-accent)] text-[var(--vs-accent-contrast)]'
                                : 'text-[var(--vs-text-secondary)]'
                            }`}
                          >
                            {m === 'heartRate' ? 'Heart Rate' : m === 'spo2' ? 'SpO₂' : 'Recovery'}
                          </button>
                        ))}
                      </div>
                    </div>
                    <VitalTrendChart
                      readings={readings}
                      metric={chartMetric}
                      baselineMean={chartMetric === 'heartRate' ? 62.9 : chartMetric === 'spo2' ? 97.9 : 53.4}
                      baselineStdDev={chartMetric === 'heartRate' ? 2.1 : chartMetric === 'spo2' ? 0.5 : 3.4}
                      height={190}
                    />
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'camera' && (
              <motion.div
                key="studio-camera"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.24 }}
                className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-center"
              >
                <div className="lg:col-span-6 space-y-4">
                  <span className="font-mono-num text-[11px] font-semibold uppercase tracking-wider text-[var(--vs-accent)]">
                    Optional Browser Pulse Check
                  </span>
                  <h3 className="font-display text-xl font-semibold text-[var(--vs-text)]">
                    Private camera pulse check when your wearable is charging
                  </h3>
                  <p className="text-sm leading-relaxed text-[var(--vs-text-secondary)]">
                    Camera frames stay strictly inside your browser memory and are never saved as
                    video. Readings are only shown when lighting and steadiness pass clear quality checks.
                  </p>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setCameraConsentGranted((c) => !c)}
                      className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-colors ${
                        cameraConsentGranted
                          ? 'bg-[var(--vs-danger-soft)] text-[var(--vs-danger)]'
                          : 'vs-btn-primary'
                      }`}
                    >
                      <Lock className="h-3.5 w-3.5" />
                      {cameraConsentGranted ? 'Stop & Turn Off Preview' : 'Allow Preview Camera Check'}
                    </button>

                    <button
                      type="button"
                      onClick={() => setLightingMode((l) => (l === 'good' ? 'low_light' : 'good'))}
                      className="vs-btn-secondary rounded-xl px-3 py-2 text-xs font-medium"
                    >
                      Test Lighting: {lightingMode === 'good' ? 'Bright' : 'Too Dim'}
                    </button>
                  </div>
                </div>

                <div className="lg:col-span-6 rounded-2xl border border-[var(--vs-border)] bg-[var(--vs-bg-subtle)] p-5 space-y-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[var(--vs-text)]">
                      {cameraConsentGranted ? 'Simulated Camera Preview Active' : 'Permission Required'}
                    </span>
                    <span className="font-mono-num text-[var(--vs-warning)]">DEMO PREVIEW</span>
                  </div>

                  {!cameraConsentGranted ? (
                    <div className="rounded-xl border border-dashed border-[var(--vs-border-strong)] bg-[var(--vs-surface)] p-6 text-center space-y-2">
                      <ShieldCheck className="mx-auto h-6 w-6 text-[var(--vs-accent)]" />
                      <p className="text-sm font-medium text-[var(--vs-text)]">
                        Camera stays off until you explicitly turn it on
                      </p>
                      <p className="text-xs text-[var(--vs-text-muted)]">
                        No video recorded · Optional pulse estimate only
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div className="rounded-lg bg-[var(--vs-surface)] p-2.5 border border-[var(--vs-border)]">
                          <p className="text-[var(--vs-text-muted)]">Lighting</p>
                          <p className={`mt-1 font-semibold ${lightingMode === 'good' ? 'text-[var(--vs-success)]' : 'text-[var(--vs-warning)]'}`}>
                            {lightingMode === 'good' ? 'Clear' : 'Too Dim'}
                          </p>
                        </div>
                        <div className="rounded-lg bg-[var(--vs-surface)] p-2.5 border border-[var(--vs-border)]">
                          <p className="text-[var(--vs-text-muted)]">Movement</p>
                          <p className="mt-1 font-semibold text-[var(--vs-success)]">Steady</p>
                        </div>
                        <div className="rounded-lg bg-[var(--vs-surface)] p-2.5 border border-[var(--vs-border)]">
                          <p className="text-[var(--vs-text-muted)]">Pulse Estimate</p>
                          <p className="mt-1 font-mono-num font-semibold text-[var(--vs-text)]">
                            {lightingMode === 'good' ? '68 bpm' : 'Paused'}
                          </p>
                        </div>
                      </div>
                      <p className="text-xs text-[var(--vs-text-secondary)]">
                        {lightingMode === 'good'
                          ? 'Good lighting (84/100). Optional pulse estimate only — not a medical device.'
                          : 'Lighting is too dim for a reliable estimate, so no number is guessed.'}
                      </p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === 'wellbeing' && (
              <motion.div
                key="studio-wellbeing"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.24 }}
                className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-center"
              >
                <div className="lg:col-span-6 space-y-4">
                  <span className="font-mono-num text-[11px] font-semibold uppercase tracking-wider text-[var(--vs-accent)]">
                    Sleep, Energy &amp; Daily Check-Ins
                  </span>
                  <h3 className="font-display text-xl font-semibold text-[var(--vs-text)]">
                    Pair wearable sleep and step patterns with simple daily check-ins
                  </h3>
                  <p className="text-sm leading-relaxed text-[var(--vs-text-secondary)]">
                    Log how rested and connected you feel alongside your sleep hours and daily steps.
                    When energy stays low, VITALSENSE gently suggests rest or reaching out to someone you trust.
                  </p>

                  <button
                    type="button"
                    onClick={() => onOpenWorkspace('member', '/app/wellbeing')}
                    className="vs-btn-primary inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold"
                  >
                    Open Wellbeing &amp; Sleep Check-In
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="lg:col-span-6 space-y-4">
                  <div className="relative h-[210px] w-full overflow-hidden rounded-2xl border border-[var(--vs-border)] bg-[var(--vs-bg-subtle)]">
                    {!wellbeingImgFailed ? (
                      <img
                        src="/src/assets/images/wellbeing_editorial_rest_1795451860142.jpg"
                        alt="Calm sunlit oak table with ceramic tea cup and open linen journal representing restful wellbeing check-ins"
                        referrerPolicy="no-referrer"
                        onError={() => setWellbeingImgFailed(true)}
                        className="h-full w-full object-cover object-center"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center p-6 text-center">
                        <Smile className="h-8 w-8 text-[var(--vs-accent)]" />
                      </div>
                    )}
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#111827]/75 to-transparent"
                    />
                    <div className="pointer-events-none absolute inset-x-4 bottom-3 flex items-center justify-between text-xs text-white">
                      <span className="font-medium">Daily Reflection · Self-Reported</span>
                      <span className="font-mono-num text-indigo-200">
                        {selectedMood === 'calm'
                          ? 'Well Rested'
                          : selectedMood === 'tired'
                            ? 'Rest Suggested'
                            : 'Trusted Reach-Out'}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[var(--vs-border)] bg-[var(--vs-bg-subtle)] p-5 space-y-4">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 font-semibold text-[var(--vs-text)]">
                        <Smile className="h-4 w-4 text-[var(--vs-accent)]" />
                        Interactive Check-In Preview
                      </span>
                      <span className="text-[var(--vs-text-muted)]">Voluntary note</span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {(
                        [
                          ['calm', 'Rested & Connected'],
                          ['tired', 'Low Energy / Short Sleep'],
                          ['isolated', 'Feeling Less Connected'],
                        ] as const
                      ).map(([id, label]) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setSelectedMood(id)}
                          className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                            selectedMood === id
                              ? 'border-[var(--vs-accent)] bg-[var(--vs-accent)] text-[var(--vs-accent-contrast)]'
                              : 'border-[var(--vs-border)] bg-[var(--vs-surface)] text-[var(--vs-text-secondary)]'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    <div className="rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface)] p-4 text-xs leading-relaxed text-[var(--vs-text-secondary)]">
                      {selectedMood === 'calm' &&
                        'Recorded steady sleep and energy. Your trusted contacts only receive summaries when you allow sharing.'}
                      {selectedMood === 'tired' &&
                        'Recent nights show shorter sleep (6.1 hrs) and lower energy. Consider an earlier rest window tonight.'}
                      {selectedMood === 'isolated' &&
                        'Your recent check-ins show feeling less connected than usual. Would you like to message a trusted contact?'}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
