import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bluetooth,
  Camera,
  CheckCircle2,
  FlaskConical,
  Play,
  ShieldAlert,
  ShieldCheck,
  Square,
  Trash2,
  VideoOff,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import {
  buildThirtyDayCalibrationBand,
  type CalibrationBandMode,
  type ThirtyDayCalibrationBand,
} from '../lib/baselineCalibration';
import { evaluateRppgSamples, WEARABLE_ADAPTERS } from '../lib/intelligenceEngine';
import type {
  LiveVitalSample,
  MetricBaseline,
  RppgMeasurement,
  SensorSession,
  VitalReading,
  WearableAdapterId,
} from '../lib/types';
import { BaselineCalibrationWidget } from '../components/dashboard/BaselineCalibrationWidget';
import { LiveWaveformCanvas } from '../components/landing/LiveWaveformCanvas';
import {
  DashboardSkeleton,
  formatDateTime,
  PageHeader,
  StateNotice,
  SurfaceCard,
} from '../components/ui/Primitives';
import { GlassRechartsFrame } from '../components/charts/GlassChartShell';
import { buildGlassChartTheme } from '../components/charts/streamingChartUtils';

interface LiveStatusResponse {
  restrictedByConsent: boolean;
  adapters: typeof WEARABLE_ADAPTERS;
  activeSession: SensorSession | null;
  recentSamples: LiveVitalSample[];
  baselineCalibration?: ThirtyDayCalibrationBand | null;
  heartRateBaseline?: MetricBaseline | null;
  historicalReadings?: VitalReading[];
}

interface RppgHistoryResponse {
  restrictedByConsent: boolean;
  measurements: RppgMeasurement[];
}

export function LiveVitalsPage() {
  const { token, apiFetch } = useAuth();
  const { theme } = useTheme();
  const glassTheme = buildGlassChartTheme(theme.tokens);
  const { pushToast } = useToast();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<'wearable' | 'rppg'>('wearable');
  const [selectedAdapter, setSelectedAdapter] = useState<WearableAdapterId>('simulated_stream');
  const [simScenario, setSimScenario] = useState<'normal' | 'gradual_drift' | 'noisy_gap'>('normal');
  const [liveFeed, setLiveFeed] = useState<LiveVitalSample[]>([]);
  const [sseConnected, setSseConnected] = useState<boolean>(false);
  const [bandMode, setBandMode] = useState<CalibrationBandMode>('typical');
  const [showCalibrationBand, setShowCalibrationBand] = useState<boolean>(true);

  // Experimental local rPPG state
  const [cameraConsent, setCameraConsent] = useState<boolean>(false);
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [latestRppg, setLatestRppg] = useState<RppgMeasurement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const greenBufferRef = useRef<number[]>([]);
  const prevLumaRef = useRef<number | null>(null);

  const { data: statusData, isLoading } = useQuery<LiveStatusResponse>({
    queryKey: ['live-status'],
    queryFn: () => apiFetch<LiveStatusResponse>('/api/live/status'),
  });

  const { data: rppgData } = useQuery<RppgHistoryResponse>({
    queryKey: ['rppg-history'],
    queryFn: () => apiFetch<RppgHistoryResponse>('/api/rppg/history'),
  });

  useEffect(() => {
    if (statusData?.recentSamples && liveFeed.length === 0) {
      setLiveFeed(statusData.recentSamples);
    }
  }, [statusData?.recentSamples, liveFeed.length]);

  const activeSession = statusData?.activeSession;
  const isSessionRunning = activeSession?.status === 'active';

  // Stream live updates via authenticated fetch-stream or SSE when session active
  useEffect(() => {
    if (!isSessionRunning || !token) {
      setSseConnected(false);
      return;
    }

    const controller = new AbortController();
    setSseConnected(true);

    const connectStream = async () => {
      try {
        const res = await fetch(`/api/live/stream?scenario=${simScenario}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!res.body) return;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() ?? '';
          for (const chunk of parts) {
            const eventLine = chunk.split('\n').find((l) => l.startsWith('event: '));
            const dataLine = chunk.split('\n').find((l) => l.startsWith('data: '));
            if (dataLine) {
              try {
                const payload = JSON.parse(dataLine.slice(6));
                if (eventLine === 'event: deviation' && Array.isArray(payload) && payload.length > 0) {
                  queryClient.invalidateQueries({ queryKey: ['realtime-deviations'] });
                  queryClient.invalidateQueries({ queryKey: ['alerts'] });
                  pushToast({
                    title: payload[0].title,
                    description: payload[0].plainEnglishReason,
                    variant: 'error',
                  });
                } else if (payload && payload.id) {
                  setLiveFeed((prev) => [...prev.slice(-29), payload as LiveVitalSample]);
                }
              } catch {
                // ignore keepalive parse
              }
            }
          }
        }
      } catch {
        setSseConnected(false);
      }
    };

    connectStream();
    return () => {
      controller.abort();
      setSseConnected(false);
    };
  }, [isSessionRunning, simScenario, token, pushToast, queryClient]);

  const startSessionMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ session: SensorSession }>('/api/live/session/start', {
        method: 'POST',
        body: JSON.stringify({
          adapterId: selectedAdapter,
          source: selectedAdapter === 'ble_heart_rate' ? 'real_sensor' : 'simulated',
        }),
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['live-status'] });
      pushToast({
        title: 'Live session started',
        description: `Connected to ${res.session.deviceName}.`,
        variant: 'success',
      });
    },
    onError: (err) => {
      pushToast({
        title: 'Unable to start sensor session',
        description: err instanceof Error ? err.message : 'Please retry.',
        variant: 'error',
      });
    },
  });

  const stopSessionMutation = useMutation({
    mutationFn: () =>
      apiFetch('/api/live/session/stop', {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['live-status'] });
      pushToast({
        title: 'Sensor session stopped',
        description: 'Live stream disconnected cleanly.',
        variant: 'info',
      });
    },
  });

  const saveRppgMutation = useMutation({
    mutationFn: (measurement: RppgMeasurement) =>
      apiFetch<{ measurement: RppgMeasurement }>('/api/rppg/measurement', {
        method: 'POST',
        body: JSON.stringify(measurement),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rppg-history'] });
    },
  });

  const clearRppgMutation = useMutation({
    mutationFn: () =>
      apiFetch('/api/rppg/history', {
        method: 'DELETE',
      }),
    onSuccess: () => {
      setLatestRppg(null);
      queryClient.invalidateQueries({ queryKey: ['rppg-history'] });
      pushToast({
        title: 'Camera rPPG records deleted',
        description: 'All stored optical pulse summaries were removed.',
        variant: 'info',
      });
    },
  });

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
    greenBufferRef.current = [];
    prevLumaRef.current = null;
  };

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const startLocalCameraRppg = async () => {
    setCameraError(null);
    if (!cameraConsent) {
      setCameraError('Grant explicit local camera consent first.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Browser camera access is unavailable in this environment. Use the controlled rPPG simulation below.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      await apiFetch('/api/consent/record', {
        method: 'POST',
        body: JSON.stringify({ scope: 'camera_rppg', granted: true }),
      }).catch(() => undefined);
    } catch {
      setCameraError('Camera permission was declined or no webcam device was detected. You can test the rPPG signal quality gates using the controlled simulator buttons.');
      setCameraActive(false);
    }
  };

  // Local-only canvas ROI extraction loop when webcam is active (never uploads frames)
  useEffect(() => {
    if (!cameraActive) return;
    const interval = window.setInterval(() => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) return;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      canvas.width = 160;
      canvas.height = 120;
      ctx.drawImage(video, 0, 0, 160, 120);
      // Sample central forehead/face ROI (50x30)
      const frame = ctx.getImageData(55, 28, 50, 30);
      let gSum = 0;
      let lumaSum = 0;
      const pxCount = frame.data.length / 4;
      for (let i = 0; i < frame.data.length; i += 4) {
        const r = frame.data[i];
        const g = frame.data[i + 1];
        const b = frame.data[i + 2];
        gSum += g;
        lumaSum += 0.299 * r + 0.587 * g + 0.114 * b;
      }
      const meanG = gSum / pxCount;
      const meanLuma = lumaSum / pxCount;
      const motionDelta = prevLumaRef.current !== null ? Math.abs(meanLuma - prevLumaRef.current) : 1;
      prevLumaRef.current = meanLuma;

      greenBufferRef.current.push(meanG);
      if (greenBufferRef.current.length > 90) {
        greenBufferRef.current.shift();
      }

      const measurement = evaluateRppgSamples({
        greenChannelSeries: greenBufferRef.current,
        fps: 10,
        meanLuminance: meanLuma,
        motionDelta,
        source: 'camera_rppg_experimental',
      });
      setLatestRppg(measurement);
    }, 100);

    return () => window.clearInterval(interval);
  }, [cameraActive]);

  const runControlledRppgDemo = (mode: 'good' | 'low_light' | 'motion') => {
    const fps = 30;
    const series = Array.from(
      { length: 150 },
      (_, i) => 126 + Math.sin((2 * Math.PI * 1.15 * i) / fps) * 2.8
    );
    const result = evaluateRppgSamples({
      greenChannelSeries: series,
      fps,
      meanLuminance: mode === 'low_light' ? 35 : 138,
      motionDelta: mode === 'motion' ? 22 : 1.5,
      source: 'simulated',
    });
    setLatestRppg(result);
    saveRppgMutation.mutate(result);
  };

  const connectWebBluetoothHr = async () => {
    const nav = navigator as Navigator & {
      bluetooth?: { requestDevice: (opts: unknown) => Promise<{ name?: string }> };
    };
    if (!nav.bluetooth) {
      pushToast({
        title: 'Web Bluetooth unavailable',
        description: 'Connect via Chromium with a BLE 0x180D heart-rate strap, or use Demo Multi-Channel Stream.',
        variant: 'info',
      });
      return;
    }
    try {
      const device = await nav.bluetooth.requestDevice({ filters: [{ services: ['heart_rate'] }] });
      await apiFetch('/api/live/session/start', {
        method: 'POST',
        body: JSON.stringify({
          adapterId: 'ble_heart_rate',
          deviceName: device.name || 'BLE Heart-Rate Strap',
          source: 'real_sensor',
        }),
      });
      queryClient.invalidateQueries({ queryKey: ['live-status'] });
    } catch {
      pushToast({
        title: 'Bluetooth pairing cancelled',
        description: 'No BLE device was selected.',
        variant: 'info',
      });
    }
  };

  if (isLoading) return <DashboardSkeleton />;

  const latestSample = liveFeed[liveFeed.length - 1] ?? null;
  const chartData = liveFeed.map((s) => ({
    time: new Date(s.timestamp).toLocaleTimeString([], { minute: '2-digit', second: '2-digit' }),
    heartRate: s.heartRate,
    spo2: s.spo2,
    respiratoryRate: s.respiratoryRate,
  }));

  const hrCalibrationBand: ThirtyDayCalibrationBand =
    statusData?.historicalReadings && statusData.historicalReadings.length > 0
      ? buildThirtyDayCalibrationBand({
          readings: statusData.historicalReadings,
          metric: 'heartRate',
          mode: bandMode,
          fallbackBaseline: statusData.heartRateBaseline ?? null,
          liveCurrentValue: latestSample?.heartRate ?? null,
        })
      : statusData?.baselineCalibration ??
        buildThirtyDayCalibrationBand({
          readings: [],
          metric: 'heartRate',
          mode: bandMode,
          fallbackBaseline: statusData?.heartRateBaseline ?? null,
          liveCurrentValue: latestSample?.heartRate ?? null,
        });

  const liveHrValues = chartData
    .map((d) => d.heartRate)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  const hasCalibrationBand =
    showCalibrationBand &&
    hrCalibrationBand.activeLow !== null &&
    hrCalibrationBand.activeHigh !== null;
  const liveRangeValues = [...liveHrValues];
  if (hasCalibrationBand) {
    liveRangeValues.push(
      hrCalibrationBand.activeLow as number,
      hrCalibrationBand.activeHigh as number
    );
    if (hrCalibrationBand.mean !== null) {
      liveRangeValues.push(hrCalibrationBand.mean);
    }
  }
  const liveYDomain: [number | 'auto', number | 'auto'] =
    liveRangeValues.length > 0
      ? [
          Math.floor(Math.min(...liveRangeValues) - 3),
          Math.ceil(Math.max(...liveRangeValues) + 3),
        ]
      : ['auto', 'auto'];

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Part 2 & 3 · Real-Time Sensor Adapters & Local Camera rPPG"
        title="Live Vital Intelligence"
        description="Monitor live physiological channels from compatible wearable adapters or test privacy-first browser-local camera pulse estimation."
        actions={
          <div className="flex max-w-full flex-wrap items-center gap-1 rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface)] p-1">
            <button
              type="button"
              onClick={() => setTab('wearable')}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap ${
                tab === 'wearable'
                  ? 'bg-[var(--vs-btn-primary-bg)] text-[var(--vs-btn-primary-text)]'
                  : 'text-[var(--vs-text-secondary)]'
              }`}
            >
              Wearable &amp; Live Stream
            </button>
            <button
              type="button"
              onClick={() => setTab('rppg')}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap ${
                tab === 'rppg'
                  ? 'bg-[var(--vs-btn-primary-bg)] text-[var(--vs-btn-primary-text)]'
                  : 'text-[var(--vs-text-secondary)]'
              }`}
            >
              Camera Pulse (rPPG Experimental)
            </button>
          </div>
        }
      />

      {tab === 'wearable' ? (
        <div className="space-y-6">
          {/* Adapter & Session Control Bar */}
          <SurfaceCard className="p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-semibold text-[var(--vs-text)]">
                  Sensor Adapter &amp; Stream Controls
                </h2>
                <p className="text-xs text-[var(--vs-text-muted)]">
                  Distinguishes real hardware measurements from explicitly labeled SIMULATED streams.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {selectedAdapter === 'ble_heart_rate' && (
                  <button
                    type="button"
                    onClick={connectWebBluetoothHr}
                    className="vs-btn-secondary inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-medium"
                  >
                    <Bluetooth className="h-3.5 w-3.5 text-[var(--vs-accent)]" />
                    Pair BLE Sensor
                  </button>
                )}

                {isSessionRunning ? (
                  <button
                    type="button"
                    onClick={() => stopSessionMutation.mutate()}
                    disabled={stopSessionMutation.isPending}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--vs-danger-soft)] px-4 py-2 text-xs font-semibold text-[var(--vs-danger)]"
                  >
                    <Square className="h-3.5 w-3.5" />
                    Stop Stream
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => startSessionMutation.mutate()}
                    disabled={startSessionMutation.isPending}
                    className="vs-btn-primary inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold"
                  >
                    <Play className="h-3.5 w-3.5" />
                    Start Live Session
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-5">
              {WEARABLE_ADAPTERS.map((adapter) => {
                const selected = selectedAdapter === adapter.id;
                return (
                  <button
                    key={adapter.id}
                    type="button"
                    onClick={() => setSelectedAdapter(adapter.id)}
                    className={`rounded-xl border p-3 text-left transition-colors ${
                      selected
                        ? 'border-[var(--vs-accent)] bg-[var(--vs-accent-soft)]/50'
                        : 'border-[var(--vs-border)] bg-[var(--vs-surface-muted)] hover:border-[var(--vs-border-strong)]'
                    }`}
                  >
                    <p className="text-xs font-semibold text-[var(--vs-text)]">{adapter.name}</p>
                    <p className="mt-1 text-[11px] text-[var(--vs-text-muted)]">{adapter.category}</p>
                    <p className="mt-2 text-[10px] text-[var(--vs-text-secondary)]">
                      {adapter.supportedMetrics.slice(0, 3).join(' · ')}
                    </p>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--vs-border)] pt-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-[var(--vs-text-secondary)]">
                  Simulated Stream Condition:
                </span>
                {(['normal', 'gradual_drift', 'noisy_gap'] as const).map((sc) => (
                  <button
                    key={sc}
                    type="button"
                    onClick={() => setSimScenario(sc)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
                      simScenario === sc
                        ? 'bg-[var(--vs-accent)] text-[var(--vs-accent-contrast)]'
                        : 'bg-[var(--vs-surface-muted)] text-[var(--vs-text-secondary)]'
                    }`}
                  >
                    {sc === 'normal'
                      ? 'Normal Baseline'
                      : sc === 'gradual_drift'
                        ? 'Gradual Drift'
                        : 'Missing-Data Test'}
                  </button>
                ))}
              </div>

              <span className="font-mono-num text-[var(--vs-text-muted)]">
                Stream Status: {sseConnected ? 'Connected (SSE Live)' : 'Idle'} · Last update{' '}
                {latestSample ? formatDateTime(latestSample.timestamp) : '—'}
              </span>
            </div>
          </SurfaceCard>

          {/* Live Readout Cards + Missing Data & Quality Indicator */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {[
              {
                label: 'Heart Rate',
                val: latestSample?.heartRate !== null && latestSample?.heartRate !== undefined ? `${latestSample.heartRate} bpm` : 'Missing',
              },
              {
                label: 'SpO2',
                val: latestSample?.spo2 !== null && latestSample?.spo2 !== undefined ? `${latestSample.spo2}%` : 'Missing',
              },
              {
                label: 'Resp. Rate',
                val: latestSample?.respiratoryRate !== null && latestSample?.respiratoryRate !== undefined ? `${latestSample.respiratoryRate} br/m` : 'Missing',
              },
              {
                label: 'Skin Temp',
                val: latestSample?.temperature !== null && latestSample?.temperature !== undefined ? `${latestSample.temperature} °C` : 'Missing',
              },
              {
                label: 'Activity / Sleep',
                val: `${latestSample?.activityCadence ?? 0} spm · ${latestSample?.sleepHours ?? 7.4}h`,
              },
              {
                label: 'Signal Quality',
                val: `${latestSample?.signalQuality ?? 0}/100`,
              },
            ].map((card) => (
              <SurfaceCard key={card.label} className="p-4">
                <p className="text-xs text-[var(--vs-text-muted)]">{card.label}</p>
                <p className="mt-1.5 font-mono-num text-lg font-semibold text-[var(--vs-text)]">
                  {card.val}
                </p>
                <p className="mt-1 text-[10px] font-medium text-[var(--vs-warning)]">
                  {latestSample?.source === 'real_sensor' ? 'REAL SENSOR' : 'SIMULATED'}
                </p>
              </SurfaceCard>
            ))}
          </div>

          {latestSample && latestSample.missingChannels.length > 0 && (
            <StateNotice
              variant="warning"
              title="Missing Sensor Channels Detected"
              message={`Missing channels: ${latestSample.missingChannels.join(', ')}. ${latestSample.reliabilityNote}`}
            />
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="lg:col-span-5 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[var(--vs-text-secondary)]">
                  2D Pulse Waveform
                </span>
                <span className="font-mono-num text-[11px] text-[var(--vs-text-muted)]">
                  Live beat preview
                </span>
              </div>

              <LiveWaveformCanvas
                heartRateBpm={latestSample?.heartRate ?? 64}
                spo2Pct={latestSample?.spo2 ?? 97.8}
                sourceLabel={latestSample?.deviceName ?? 'Simulated Stream'}
                isSimulated={latestSample?.source !== 'real_sensor'}
                height={264}
              />
            </div>

            <SurfaceCard className="lg:col-span-7 p-5 space-y-3.5">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-sm font-semibold text-[var(--vs-text)]">
                  Live Rolling Telemetry Chart
                </h3>
                <span className="font-mono-num text-xs font-medium text-[var(--vs-warning)]">
                  {latestSample?.source === 'real_sensor' ? 'MEASURED' : 'SIMULATED'}
                </span>
              </div>

              <BaselineCalibrationWidget
                band={hrCalibrationBand}
                mode={bandMode}
                onModeChange={setBandMode}
                showBand={showCalibrationBand}
                onToggleBand={() => setShowCalibrationBand((prev) => !prev)}
                compact
              />

              <GlassRechartsFrame
                accentColor={glassTheme.strokeColor}
                height={195}
                compact
                scrubberSeries={{
                  metricLabel: 'Heart Rate',
                  unit: 'bpm',
                  precision: 1,
                  secondaryLabel: 'SpO₂',
                  secondaryUnit: '%',
                  secondaryPrecision: 1,
                  baselineMean: hrCalibrationBand.mean,
                  points: liveFeed
                    .filter((s) => typeof s.heartRate === 'number')
                    .map((s) => ({
                      label: new Date(s.timestamp).toLocaleTimeString([], {
                        minute: '2-digit',
                        second: '2-digit',
                      }),
                      timestamp: s.timestamp,
                      value: s.heartRate as number,
                      secondaryValue: typeof s.spo2 === 'number' ? s.spo2 : null,
                      quality: s.signalQuality,
                    })),
                }}
                headerLeft={
                  hasCalibrationBand ? (
                    <span className="inline-flex items-center gap-2 text-xs text-[var(--vs-text-secondary)]">
                      <span
                        className="inline-block h-2.5 w-4 rounded-xs border"
                        style={{
                          backgroundColor: glassTheme.bandColor,
                          opacity: 0.35,
                          borderColor: glassTheme.bandColor,
                        }}
                      />
                      <span>
                        Shaded: 30-Day HR Range ({hrCalibrationBand.activeLow}–
                        {hrCalibrationBand.activeHigh} bpm)
                      </span>
                    </span>
                  ) : (
                    <span className="text-xs text-[var(--vs-text-muted)]">
                      30-day shaded band hidden
                    </span>
                  )
                }
                headerRight="Click dots to pin · Drag line to scrub"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 10, right: 16, left: -8, bottom: 2 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={glassTheme.gridColor} />
                    <XAxis
                      dataKey="time"
                      tick={glassTheme.tickStyle}
                      tickLine={false}
                      axisLine={{ stroke: glassTheme.gridColor }}
                    />
                    <YAxis
                      domain={liveYDomain}
                      tick={glassTheme.tickStyle}
                      tickLine={false}
                      axisLine={false}
                      width={48}
                    />
                    <Tooltip content={() => null} />
                    {hasCalibrationBand && (
                      <ReferenceArea
                        y1={hrCalibrationBand.activeLow as number}
                        y2={hrCalibrationBand.activeHigh as number}
                        fill={glassTheme.bandColor}
                        fillOpacity={0.18}
                        stroke={glassTheme.bandColor}
                        strokeOpacity={0.38}
                        strokeDasharray="3 3"
                        ifOverflow="extendDomain"
                      />
                    )}
                    {hrCalibrationBand.mean !== null && (
                      <ReferenceLine
                        y={hrCalibrationBand.mean}
                        stroke={glassTheme.refColor}
                        strokeDasharray="4 4"
                        strokeOpacity={0.5}
                      />
                    )}
                    <Line
                      type="monotone"
                      dataKey="heartRate"
                      name="Heart Rate (bpm)"
                      stroke={glassTheme.strokeColor}
                      strokeWidth={2.4}
                      dot={(dotProps) => {
                        const { cx, cy, index } = dotProps;
                        if (typeof cx !== 'number' || typeof cy !== 'number') return null;
                        const isLast = index === chartData.length - 1;
                        return (
                          <circle
                            key={`live-dot-${index}`}
                            cx={cx}
                            cy={cy}
                            r={isLast ? 4.4 : 2.6}
                            fill={isLast ? glassTheme.strokeColor : glassTheme.surfaceColor}
                            stroke={glassTheme.strokeColor}
                            strokeWidth={isLast ? 2 : 1.5}
                          />
                        );
                      }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </GlassRechartsFrame>
            </SurfaceCard>
          </div>
        </div>
      ) : (
        /* EXPERIMENTAL CAMERA rPPG WORKFLOW */
        <div className="space-y-6">
          <StateNotice
            variant="info"
            title="Privacy-First Experimental Camera Pulse Estimation"
            message="Video frames are processed locally inside your browser only, never uploaded or recorded, and never used to create identity profiles. This is NOT a validated pulse oximeter, blood pressure monitor, or diagnostic device."
          />

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <SurfaceCard className="lg:col-span-6 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-base font-semibold text-[var(--vs-text)]">
                  Local Camera ROI &amp; Consent Controls
                </h2>
                <span
                  className={`text-xs font-semibold ${
                    cameraActive ? 'text-[var(--vs-danger)]' : 'text-[var(--vs-text-muted)]'
                  }`}
                >
                  {cameraActive ? 'Camera Indicator: ACTIVE' : 'Camera Indicator: OFF'}
                </span>
              </div>

              <label className="flex items-start gap-2.5 rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface-muted)] p-3 text-xs text-[var(--vs-text-secondary)]">
                <input
                  type="checkbox"
                  checked={cameraConsent}
                  onChange={(e) => setCameraConsent(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  I consent to browser-local optical skin-ROI processing for experimental heart-rate estimation. Zero frames leave my device.
                </span>
              </label>

              <div className="flex flex-wrap gap-2">
                {cameraActive ? (
                  <button
                    type="button"
                    onClick={stopCamera}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--vs-danger-soft)] px-4 py-2 text-xs font-semibold text-[var(--vs-danger)]"
                  >
                    <VideoOff className="h-4 w-4" />
                    Stop Camera Immediately
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startLocalCameraRppg}
                    className="vs-btn-primary inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold"
                  >
                    <Camera className="h-4 w-4" />
                    Start Local Camera rPPG
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => runControlledRppgDemo('good')}
                  className="vs-btn-secondary inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium"
                >
                  <FlaskConical className="h-3.5 w-3.5" />
                  Test Clean Signal (SIMULATED)
                </button>
                <button
                  type="button"
                  onClick={() => runControlledRppgDemo('low_light')}
                  className="vs-btn-secondary rounded-xl px-3 py-2 text-xs font-medium"
                >
                  Test Low-Light Rejection
                </button>
              </div>

              {cameraError && (
                <p className="rounded-xl border border-[var(--vs-warning)]/30 bg-[var(--vs-warning-soft)] p-3 text-xs text-[var(--vs-warning)]">
                  {cameraError}
                </p>
              )}

              <div className="relative overflow-hidden rounded-xl border border-[var(--vs-border)] bg-[#0E1916] min-h-[200px] flex items-center justify-center">
                <video
                  ref={videoRef}
                  muted
                  playsInline
                  className={`h-52 w-full object-cover ${cameraActive ? 'block' : 'hidden'}`}
                />
                <canvas ref={canvasRef} className="hidden" />
                {!cameraActive && (
                  <div className="p-6 text-center space-y-2 text-slate-300">
                    <ShieldCheck className="mx-auto h-7 w-7 text-emerald-400" />
                    <p className="text-sm font-medium">Camera feed inactive</p>
                    <p className="text-xs text-slate-400">
                      Only extracted green-channel pulse variance is analyzed locally.
                    </p>
                  </div>
                )}
              </div>
            </SurfaceCard>

            <SurfaceCard className="lg:col-span-6 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-base font-semibold text-[var(--vs-text)]">
                  Signal Quality Assessment &amp; History
                </h2>
                {(rppgData?.measurements.length ?? 0) > 0 && (
                  <button
                    type="button"
                    onClick={() => clearRppgMutation.mutate()}
                    className="inline-flex items-center gap-1 text-xs font-medium text-[var(--vs-danger)] hover:underline"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete Stored Summaries
                  </button>
                )}
              </div>

              {latestRppg ? (
                <div className="rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface-muted)] p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[var(--vs-text)]">
                      {latestRppg.passedQualityCheck
                        ? 'Quality Check Passed (Experimental Estimate)'
                        : 'Estimate Withheld by Quality Gate'}
                    </span>
                    <span className="font-mono-num text-[11px] font-semibold text-[var(--vs-warning)]">
                      {latestRppg.source === 'simulated' ? 'SIMULATED' : 'LOCAL CAMERA'}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="rounded-lg bg-[var(--vs-surface)] p-2.5 border border-[var(--vs-border)]">
                      <p className="text-[var(--vs-text-muted)]">Pulse Estimate</p>
                      <p className="mt-1 font-mono-num text-base font-semibold text-[var(--vs-text)]">
                        {latestRppg.estimatedHeartRate ? `${latestRppg.estimatedHeartRate} bpm` : 'Withheld'}
                      </p>
                    </div>
                    <div className="rounded-lg bg-[var(--vs-surface)] p-2.5 border border-[var(--vs-border)]">
                      <p className="text-[var(--vs-text-muted)]">Lighting</p>
                      <p className="mt-1 font-semibold text-[var(--vs-text)]">
                        {latestRppg.lightingStatus.replace('_', ' ')}
                      </p>
                    </div>
                    <div className="rounded-lg bg-[var(--vs-surface)] p-2.5 border border-[var(--vs-border)]">
                      <p className="text-[var(--vs-text-muted)]">Confidence</p>
                      <p className="mt-1 font-mono-num font-semibold text-[var(--vs-text)]">
                        {latestRppg.confidencePct}%
                      </p>
                    </div>
                  </div>

                  {latestRppg.failureReason && (
                    <p className="flex items-center gap-1.5 text-xs text-[var(--vs-warning)]">
                      <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                      {latestRppg.failureReason}
                    </p>
                  )}

                  <p className="text-[11px] text-[var(--vs-text-muted)]">{latestRppg.disclaimer}</p>
                </div>
              ) : (
                <StateNotice
                  variant="empty"
                  title="No experimental camera reading yet"
                  message="Grant local camera consent or run a controlled quality-gate simulation to inspect how lighting and motion control estimate visibility."
                />
              )}

              <div className="space-y-2">
                <p className="text-xs font-semibold text-[var(--vs-text-secondary)]">
                  Saved Derived Summaries ({rppgData?.measurements.length ?? 0})
                </p>
                {(rppgData?.measurements ?? []).slice(0, 4).map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface-muted)] px-3 py-2 text-xs"
                  >
                    <span className="flex items-center gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-[var(--vs-accent)]" />
                      {m.estimatedHeartRate ? `${m.estimatedHeartRate} bpm` : 'Withheld (Low quality)'} ·{' '}
                      {m.lightingStatus}
                    </span>
                    <span className="font-mono-num text-[11px] text-[var(--vs-text-muted)]">
                      {formatDateTime(m.timestamp)}
                    </span>
                  </div>
                ))}
              </div>
            </SurfaceCard>
          </div>
        </div>
      )}
    </div>
  );
}
