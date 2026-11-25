import type {
  LiveVitalSample,
  RestRecommendation,
  RppgMeasurement,
  SafetyAlertRecord,
  TimelineEvent,
  UnifiedPredictiveObservation,
  WearableAdapterInfo,
  WellbeingCheckin,
  WellbeingTrendSummary,
} from './types.ts';

export const WEARABLE_ADAPTERS: WearableAdapterInfo[] = [
  {
    id: 'simulated_stream',
    name: 'Demo Multi-Channel Stream (SIMULATED)',
    category: 'Controlled Simulator',
    supportedMetrics: ['Heart Rate', 'SpO2', 'Resp. Rate', 'Skin Temp', 'HRV', 'Activity'],
    hardwareRequired: 'None — generates labeled synthetic signals',
    supportsBrowserLive: true,
  },
  {
    id: 'ble_heart_rate',
    name: 'Bluetooth Heart-Rate Strap (Web Bluetooth 0x180D)',
    category: 'Bluetooth LE Chest / Arm Strap',
    supportedMetrics: ['Heart Rate', 'RR Intervals (HRV)'],
    hardwareRequired: 'BLE Heart Rate Service (0x180D) + Chromium Web Bluetooth',
    supportsBrowserLive: true,
  },
  {
    id: 'smartwatch_sync',
    name: 'Smartwatch Nightly & Live Bridge',
    category: 'Smartwatch Adapter',
    supportedMetrics: ['Heart Rate', 'SpO2', 'Skin Temp', 'Sleep Duration', 'Activity'],
    hardwareRequired: 'Companion wearable CSV/webhook or BLE bridge',
    supportsBrowserLive: false,
  },
  {
    id: 'fitness_band',
    name: 'Fitness Band Telemetry Adapter',
    category: 'Wrist Fitness Band',
    supportedMetrics: ['Heart Rate', 'Activity Cadence', 'Sleep Duration'],
    hardwareRequired: 'Companion export sync or mobile BLE relay',
    supportsBrowserLive: false,
  },
  {
    id: 'pulse_oximeter',
    name: 'Finger Pulse Oximeter Adapter',
    category: 'Medical / Wellness Pulse Oximeter',
    supportedMetrics: ['SpO2', 'Pulse Rate'],
    hardwareRequired: 'BLE Pulse Oximeter (0x1822) or CSV log',
    supportsBrowserLive: false,
  },
];

/**
 * Generates an illustrative PPG/ECG-style waveform value for live telemetry visualization.
 * Explicitly non-diagnostic unless backed by real ECG hardware.
 */
export function computeIllustrativeWaveformPoint(
  phaseRad: number,
  heartRateBpm: number,
  noiseAmplitude = 0.02
): number {
  const beatPhase = ((phaseRad % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const t = beatPhase / (Math.PI * 2);
  // P-QRS-T synthetic morphology curve
  const pWave = 0.14 * Math.exp(-Math.pow((t - 0.18) / 0.045, 2));
  const qDip = -0.18 * Math.exp(-Math.pow((t - 0.34) / 0.015, 2));
  const rPeak = 1.0 * Math.exp(-Math.pow((t - 0.38) / 0.018, 2));
  const sDip = -0.28 * Math.exp(-Math.pow((t - 0.42) / 0.018, 2));
  const tWave = 0.28 * Math.exp(-Math.pow((t - 0.64) / 0.07, 2));
  const rateScale = Math.max(0.85, Math.min(1.15, heartRateBpm / 70));
  const deterministicJitter = Math.sin(phaseRad * 7.3) * noiseAmplitude;
  return Number(((pWave + qDip + rPeak + sDip + tWave) * rateScale + deterministicJitter).toFixed(4));
}

export function generateSimulatedLiveSample(params: {
  sessionId: string;
  deviceName: string;
  stepIndex: number;
  scenario: 'normal' | 'gradual_drift' | 'noisy_gap';
  timestamp?: string;
}): LiveVitalSample {
  const { sessionId, deviceName, stepIndex, scenario } = params;
  const ts = params.timestamp ?? new Date().toISOString();
  const wave = Math.sin(stepIndex * 0.45);
  const subWave = Math.cos(stepIndex * 0.23);

  let heartRate: number | null = Number((63.5 + wave * 2.2).toFixed(1));
  let spo2: number | null = Number((98.0 + subWave * 0.3).toFixed(1));
  let respiratoryRate: number | null = Number((14.8 + wave * 0.6).toFixed(1));
  let temperature: number | null = Number((36.48 + subWave * 0.05).toFixed(2));
  let hrv: number | null = Number((53.5 - wave * 3.1).toFixed(1));
  let signalQuality = 94;
  const missingChannels: string[] = [];

  if (scenario === 'gradual_drift') {
    const progression = Math.min(8, stepIndex * 0.45);
    heartRate = Number((63.5 + progression + wave * 1.4).toFixed(1));
    temperature = Number((36.48 + progression * 0.055).toFixed(2));
    respiratoryRate = Number((14.8 + progression * 0.2).toFixed(1));
    hrv = Number(Math.max(28, 53.5 - progression * 1.4).toFixed(1));
  } else if (scenario === 'noisy_gap') {
    if (stepIndex % 5 === 3) {
      spo2 = null;
      hrv = null;
      missingChannels.push('SpO2', 'HRV');
      signalQuality = 52;
    } else {
      signalQuality = 68;
      heartRate = Number((64 + wave * 5.2).toFixed(1));
    }
  }

  return {
    id: `live_${sessionId}_${stepIndex}`,
    sessionId,
    timestamp: ts,
    source: 'simulated',
    deviceName,
    heartRate,
    spo2,
    respiratoryRate,
    temperature,
    hrv,
    activityCadence: scenario === 'noisy_gap' ? 18 : 4,
    sleepHours: 7.4,
    signalQuality,
    missingChannels,
    reliabilityNote:
      signalQuality >= 85
        ? 'SIMULATED: Stable contact across active channels'
        : signalQuality >= 65
          ? 'SIMULATED: Motion artifact lowering optical accuracy'
          : 'SIMULATED: Intermittent dropout — missing channels flagged',
  };
}

/**
 * Pure rPPG spectral pulse estimator from green-channel ROI intensity samples.
 * Rejects estimates when signal quality, lighting, or motion stability are insufficient.
 */
export function evaluateRppgSamples(params: {
  greenChannelSeries: number[];
  fps: number;
  meanLuminance: number; // 0..255
  motionDelta: number; // average frame-to-frame pixel shift proxy
  source?: 'camera_rppg_experimental' | 'simulated';
  timestamp?: string;
}): RppgMeasurement {
  const {
    greenChannelSeries,
    fps,
    meanLuminance,
    motionDelta,
    source = 'camera_rppg_experimental',
    timestamp = new Date().toISOString(),
  } = params;

  const lightingStatus: RppgMeasurement['lightingStatus'] =
    meanLuminance < 55
      ? 'low_light'
      : meanLuminance > 232
        ? 'overexposed'
        : 'good';
  const motionStatus: RppgMeasurement['motionStatus'] =
    motionDelta > 16
      ? 'excessive_motion'
      : motionDelta > 7
        ? 'moderate_motion'
        : 'steady';

  const disclaimer =
    'Experimental camera rPPG pulse estimate only. Not a validated pulse oximeter, blood pressure monitor, or diagnostic device.';

  if (greenChannelSeries.length < Math.max(45, Math.round(fps * 3))) {
    return {
      id: `rppg_${Date.now()}`,
      timestamp,
      source,
      estimatedHeartRate: null,
      confidencePct: 0,
      signalQuality: 25,
      lightingStatus,
      motionStatus,
      passedQualityCheck: false,
      failureReason: 'Collecting minimum 3-second steady ROI window before estimating pulse.',
      roiLabel: 'Forehead / Cheek Local ROI (processed in-browser)',
      disclaimer,
    };
  }

  if (lightingStatus !== 'good') {
    return {
      id: `rppg_${Date.now()}`,
      timestamp,
      source,
      estimatedHeartRate: null,
      confidencePct: 18,
      signalQuality: 30,
      lightingStatus,
      motionStatus,
      passedQualityCheck: false,
      failureReason:
        lightingStatus === 'low_light'
          ? 'Ambient lighting is too dim for reliable optical pulse extraction.'
          : 'Frame is overexposed — reduce direct glare behind subject.',
      roiLabel: 'Forehead / Cheek Local ROI (processed in-browser)',
      disclaimer,
    };
  }

  if (motionStatus === 'excessive_motion') {
    return {
      id: `rppg_${Date.now()}`,
      timestamp,
      source,
      estimatedHeartRate: null,
      confidencePct: 22,
      signalQuality: 32,
      lightingStatus,
      motionStatus,
      passedQualityCheck: false,
      failureReason: 'Excessive head or camera motion detected. Hold steady for 5 seconds.',
      roiLabel: 'Forehead / Cheek Local ROI (processed in-browser)',
      disclaimer,
    };
  }

  // Detrend via local mean subtraction
  const n = greenChannelSeries.length;
  const mean = greenChannelSeries.reduce((a, b) => a + b, 0) / n;
  const detrended = greenChannelSeries.map((v, i) => {
    const winStart = Math.max(0, i - Math.round(fps * 0.5));
    const winEnd = Math.min(n, i + Math.round(fps * 0.5) + 1);
    let localSum = 0;
    for (let k = winStart; k < winEnd; k++) localSum += greenChannelSeries[k];
    const localMean = localSum / (winEnd - winStart);
    return (v - localMean) || (v - mean);
  });

  const variance = detrended.reduce((s, v) => s + v * v, 0) / n;
  if (variance < 1e-6) {
    return {
      id: `rppg_${Date.now()}`,
      timestamp,
      source,
      estimatedHeartRate: null,
      confidencePct: 15,
      signalQuality: 20,
      lightingStatus,
      motionStatus,
      passedQualityCheck: false,
      failureReason: 'Flat optical signal — ensure skin region is uncovered inside the guide.',
      roiLabel: 'Forehead / Cheek Local ROI (processed in-browser)',
      disclaimer,
    };
  }

  // Discrete Fourier magnitude scan across physiological 48..168 BPM band (0.8..2.8 Hz)
  let bestBpm = 0;
  let bestPower = 0;
  let totalPower = 0;

  for (let bpm = 48; bpm <= 168; bpm += 1) {
    const freqHz = bpm / 60;
    let re = 0;
    let im = 0;
    for (let i = 0; i < n; i++) {
      const angle = (2 * Math.PI * freqHz * i) / fps;
      re += detrended[i] * Math.cos(angle);
      im -= detrended[i] * Math.sin(angle);
    }
    const power = re * re + im * im;
    totalPower += power;
    if (power > bestPower) {
      bestPower = power;
      bestBpm = bpm;
    }
  }

  // Spectral concentration ratio (SNR proxy)
  const concentration = totalPower > 0 ? bestPower / (totalPower / 121) : 0;
  const motionPenalty = motionStatus === 'moderate_motion' ? 14 : 0;
  const rawQuality = Math.round(Math.min(96, Math.max(20, concentration * 7.2 - motionPenalty)));
  const passedQualityCheck = rawQuality >= 62 && bestBpm >= 48 && bestBpm <= 168;

  return {
    id: `rppg_${Date.now()}`,
    timestamp,
    source,
    estimatedHeartRate: passedQualityCheck ? bestBpm : null,
    confidencePct: passedQualityCheck ? Math.min(94, rawQuality) : rawQuality,
    signalQuality: rawQuality,
    lightingStatus,
    motionStatus,
    passedQualityCheck,
    failureReason: passedQualityCheck
      ? undefined
      : 'Signal-to-noise ratio too low for a trustworthy heart-rate estimate.',
    roiLabel: 'Forehead / Cheek Local ROI (processed in-browser)',
    disclaimer,
  };
}

/**
 * Generates calm, everyday rest recommendations based on wearable sleep/vital trends and self-reported wellbeing.
 */
export function evaluateRestRecommendation(params: {
  recentSleepHours?: number | null;
  recentTimelineEvent?: TimelineEvent | null;
  recentCheckin?: WellbeingCheckin | null;
}): RestRecommendation | null {
  const { recentSleepHours, recentTimelineEvent, recentCheckin } = params;

  const observations: string[] = [];
  if (typeof recentSleepHours === 'number' && recentSleepHours < 6.5) {
    observations.push(`Recent sleep duration dipped to ${recentSleepHours.toFixed(1)} hours`);
  }
  if (recentTimelineEvent) {
    observations.push(
      `${recentTimelineEvent.metricLabel} shifted ${recentTimelineEvent.deltaText} over ${recentTimelineEvent.durationDays} days`
    );
  }
  if (recentCheckin && (recentCheckin.mood === 'tired' || recentCheckin.sleepQuality <= 2)) {
    observations.push(
      `Self-reported sleep quality (${recentCheckin.sleepQuality}/5) or tiredness`
    );
  }

  if (observations.length === 0) {
    return null;
  }

  const hasWearableShift = Boolean(recentTimelineEvent) || (typeof recentSleepHours === 'number' && recentSleepHours < 6.5);
  const reason = hasWearableShift
    ? 'Recent wearable patterns show lighter sleep or higher resting effort compared with your normal baseline.'
    : 'Your recent check-in shows lower energy or lighter rest.';

  return {
    id: `rest_${Date.now()}`,
    createdAt: new Date().toISOString(),
    source: hasWearableShift && recentCheckin ? 'combined' : hasWearableShift ? 'wearable_sleep' : 'wellbeing',
    observations,
    reason,
    recommendedAction:
      'Prioritise extra rest, hydration, and lighter activity today. If the pattern continues, share this summary with a caregiver or clinician.',
    warningTime: new Date().toISOString(),
    acknowledged: false,
    breakRecorded: false,
    followUpStatus: 'pending',
  };
}

const CRISIS_TERMS = [
  'hurt myself',
  'harm myself',
  'end my life',
  'suicide',
  'kill myself',
  'no reason to live',
  "don't want to live",
  'do not want to live',
  'want to die',
  'self harm',
];

export function detectCrisisLanguage(text: string): boolean {
  const lower = text.toLowerCase();
  return CRISIS_TERMS.some((term) => lower.includes(term));
}

export function summarizeWellbeingTrends(
  checkins: WellbeingCheckin[]
): WellbeingTrendSummary {
  if (checkins.length === 0) {
    return {
      totalCheckins: 0,
      recentMoodSummary: 'No check-ins recorded yet',
      avgSleepQuality: null,
      avgEnergyLevel: null,
      connectednessPattern: 'insufficient',
      neutralObservation:
        'Complete a voluntary daily check-in whenever helpful to observe your own sleep, energy, and connection patterns.',
      suggestTrustedReachOut: false,
      lastCheckinAt: null,
    };
  }

  const sorted = [...checkins].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
  const recent = sorted.slice(0, 5);
  const avgSleep = Number(
    (recent.reduce((s, c) => s + c.sleepQuality, 0) / recent.length).toFixed(1)
  );
  const avgEnergy = Number(
    (recent.reduce((s, c) => s + c.energyLevel, 0) / recent.length).toFixed(1)
  );

  const isolatedCount = recent.filter(
    (c) => c.socialConnectedness === 'isolated' || c.socialConnectedness === 'somewhat_isolated'
  ).length;
  const askedSupport = recent.some((c) => c.wantsToTalk);
  const lessConnected = isolatedCount >= 2 || askedSupport;

  const latestMood = sorted[0].mood;
  const moodMap: Record<WellbeingCheckin['mood'], string> = {
    calm: 'Calm & steady',
    okay: 'Balanced / okay',
    low: 'Lower mood noted',
    stressed: 'Feeling pressured or tense',
    tired: 'Low energy / tired',
  };

  let neutralObservation =
    'Your recent self-reported check-ins reflect steady sleep, energy, and social connection.';
  if (lessConnected) {
    neutralObservation =
      'Your recent check-ins indicate that you have been feeling less connected than usual. Would you like to reach out to someone you trust?';
  } else if (avgSleep <= 2.6 || avgEnergy <= 2.6) {
    neutralObservation =
      'Your recent check-ins show lower sleep quality and energy over the last few entries. Taking a gentle rest break or checking in with someone supportive may help.';
  }

  return {
    totalCheckins: checkins.length,
    recentMoodSummary: moodMap[latestMood],
    avgSleepQuality: avgSleep,
    avgEnergyLevel: avgEnergy,
    connectednessPattern:
      checkins.length < 2 ? 'insufficient' : lessConnected ? 'less_connected' : 'steady',
    neutralObservation,
    suggestTrustedReachOut: lessConnected,
    lastCheckinAt: sorted[0].timestamp,
  };
}

/**
 * Combines wearable timeline events, wellbeing check-ins, and sensor quality into plain-English summaries
 * separated into Measured Observations, What This Pattern Means, and Helpful Next Steps.
 */
export function buildUnifiedPredictiveObservations(params: {
  timelineEvents: TimelineEvent[];
  wellbeingCheckins: WellbeingCheckin[];
  safetyAlerts: SafetyAlertRecord[];
  latestLiveSample?: LiveVitalSample | null;
}): UnifiedPredictiveObservation[] {
  const { timelineEvents, wellbeingCheckins, latestLiveSample } = params;
  const results: UnifiedPredictiveObservation[] = [];

  for (const evt of timelineEvents.slice(0, 2)) {
    results.push({
      id: `uni_phys_${evt.id}`,
      generatedAt: evt.lastObservedAt,
      title: `Noticeable ${evt.metricLabel} change compared to your usual pattern`,
      category: 'physiological_change',
      measuredObservations: [
        `${evt.metricLabel} averaged ${evt.currentObserved} ${evt.unit} over ${evt.durationDays} days compared to your usual ${evt.previousBaseline} ${evt.unit} (${evt.deltaText}).`,
        `Seen consistently in ${evt.supportingEvidence.consistencyPct}% of ${evt.supportingEvidence.sampleCount} recent readings.`,
      ],
      inferredPatterns: [
        'Because this shift stayed steady across multiple days rather than a single night, it stands out from everyday noise.',
      ],
      recommendedActions: [
        'Check your recent sleep hours, steps, and hydration in the Health Timeline.',
        'Consider sharing this summary with a caregiver or healthcare professional if it continues.',
      ],
      confidenceNote: `Good data coverage (${evt.supportingEvidence.dataQualityAvg}%) · Informational summary only`,
    });
  }

  const wbSummary = summarizeWellbeingTrends(wellbeingCheckins);
  if (wbSummary.totalCheckins > 0 && (wbSummary.suggestTrustedReachOut || (wbSummary.avgSleepQuality ?? 5) <= 2.8)) {
    results.push({
      id: 'uni_wellbeing_trend',
      generatedAt: wbSummary.lastCheckinAt ?? new Date().toISOString(),
      title: 'Sleep & Daily Check-In Summary',
      category: 'wellbeing_support',
      measuredObservations: [
        `Latest check-in: ${wbSummary.recentMoodSummary}.`,
        `Recent average sleep rating: ${wbSummary.avgSleepQuality}/5; energy: ${wbSummary.avgEnergyLevel}/5.`,
      ],
      inferredPatterns: [wbSummary.neutralObservation],
      recommendedActions: [
        'Reach out to a trusted caregiver or family member if you would like support.',
        'Take extra time for rest and hydration today.',
      ],
      confidenceNote: 'Based only on your own voluntary check-ins',
    });
  }

  if (latestLiveSample && latestLiveSample.missingChannels.length > 0) {
    results.push({
      id: `uni_sensor_${latestLiveSample.id}`,
      generatedAt: latestLiveSample.timestamp,
      title: 'Wearable Signal Gap Noticed',
      category: 'sensor_issue',
      measuredObservations: [
        `Missing readings on ${latestLiveSample.deviceName}: ${latestLiveSample.missingChannels.join(', ')}.`,
        `Signal quality: ${latestLiveSample.signalQuality}%.`,
      ],
      inferredPatterns: [
        'A loose strap or movement briefly interrupted part of the live wearable signal.',
      ],
      recommendedActions: [
        'Check that your wearable sits comfortably and steadily on your wrist.',
      ],
      confidenceNote: 'Missing readings are left blank instead of guessed',
    });
  }

  return results;
}
