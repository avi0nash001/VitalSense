import type {
  AlertRecord,
  ChartAnnotation,
  ConsentSettings,
  MetricBaseline,
  MetricKey,
  RealtimeDeviationEvent,
  SymptomLog,
  TimelineEvent,
  VitalReading,
} from './types';

export type VoiceAssistantState =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'processing'
  | 'speaking'
  | 'error'
  | 'connection_lost';

export const VOICE_STATE_COPY: Record<
  VoiceAssistantState,
  { headline: string; helper: string }
> = {
  idle: {
    headline: 'Talk to VitalSense',
    helper: 'Tap the microphone and speak naturally in your own language.',
  },
  connecting: {
    headline: 'Connecting voice...',
    helper: 'Starting a private, real-time audio session with your VitalSense data.',
  },
  listening: {
    headline: "I'm listening...",
    helper:
      'Speak naturally in Kannada, English, Hindi, Tamil, Telugu, Malayalam, Marathi, Bengali, Gujarati, or mix languages freely.',
  },
  processing: {
    headline: 'Let me check that...',
    helper: 'Checking your latest wearable readings, baseline, and alerts.',
  },
  speaking: {
    headline: 'Speaking...',
    helper: 'You can interrupt anytime by speaking or tapping Stop & Listen.',
  },
  error: {
    headline: "Sorry, I couldn't hear you. Please try again.",
    helper: 'Check your microphone permission or type your question below.',
  },
  connection_lost: {
    headline: 'Connection lost. Please try again.',
    helper: 'Your voice session disconnected. Tap the microphone to reconnect.',
  },
};

export interface VoiceLanguageSpec {
  name: string;
  nativeName: string;
  bcp47: string;
}

export const VOICE_LANGUAGE_CONFIG: readonly VoiceLanguageSpec[] = [
  { name: 'Kannada', nativeName: 'ಕನ್ನಡ', bcp47: 'kn-IN' },
  { name: 'English', nativeName: 'English', bcp47: 'en-IN' },
  { name: 'Hindi', nativeName: 'हिन्दी', bcp47: 'hi-IN' },
  { name: 'Tamil', nativeName: 'தமிழ்', bcp47: 'ta-IN' },
  { name: 'Telugu', nativeName: 'తెలుగు', bcp47: 'te-IN' },
  { name: 'Malayalam', nativeName: 'മലയാളം', bcp47: 'ml-IN' },
  { name: 'Marathi', nativeName: 'मराठी', bcp47: 'mr-IN' },
  { name: 'Bengali', nativeName: 'বাংলা', bcp47: 'bn-IN' },
  { name: 'Gujarati', nativeName: 'ગુજરાતી', bcp47: 'gu-IN' },
] as const;

export const PRIORITY_VOICE_LANGUAGES = VOICE_LANGUAGE_CONFIG.map(
  (lang) => lang.name
);

export function classifyMicrophoneError(err: unknown): string {
  const errName =
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    typeof (err as { name?: unknown }).name === 'string'
      ? (err as { name: string }).name
      : '';
  const rawMessage =
    err instanceof Error
      ? err.message
      : typeof err === 'object' &&
          err !== null &&
          'message' in err &&
          typeof (err as { message?: unknown }).message === 'string'
        ? (err as { message: string }).message
        : '';

  const lower = `${errName} ${rawMessage}`.toLowerCase();

  if (
    lower.includes('notallowed') ||
    lower.includes('permission') ||
    lower.includes('denied') ||
    lower.includes('securityerror') ||
    lower.includes('feature policy')
  ) {
    return 'Microphone access is blocked or not permitted in this browser window. Allow microphone access in your browser bar (or open the app in a standalone tab if embedded) or type your question below.';
  }

  if (lower.includes('notfound') || lower.includes('devicesnotfound') || lower.includes('requested device not found')) {
    return 'No microphone was detected on this device. Connect a microphone or type your question below.';
  }

  if (lower.includes('notreadable') || lower.includes('trackstart') || lower.includes('in use')) {
    return 'Your microphone appears to be busy in another app or tab. Close other audio apps and tap the microphone again, or type below.';
  }

  if (lower.includes('secure') || lower.includes('https')) {
    return 'Microphone capture requires a secure HTTPS or localhost connection. Type your question below instead.';
  }

  return rawMessage || 'Unable to access microphone right now. Please try again or type below.';
}

export const STARTER_VOICE_PROMPTS = [
  'Why did I get this alert?',
  'How has my sleep been?',
  'Is my heart rate higher than usual?',
  'What does this graph mean?',
  'What should I tell my caregiver?',
] as const;

export interface VoiceTranscriptEntry {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
  isFinal: boolean;
  source: 'voice' | 'text';
}

export interface VoiceHealthContextSnapshot {
  memberName: string;
  viewerRole: 'member' | 'caregiver';
  wearableDeviceName: string;
  lastUpdated: string;
  consent: ConsentSettings;
  latestReading: VitalReading | null;
  recent7DayReadings: VitalReading[];
  baselines: Record<MetricKey, MetricBaseline> | null;
  timelineEvents: TimelineEvent[];
  alerts: AlertRecord[];
  realtimeDeviations: RealtimeDeviationEvent[];
  symptomLogs: SymptomLog[];
  chartAnnotations: ChartAnnotation[];
}

export function buildVoiceHealthContextPrompt(
  snapshot: VoiceHealthContextSnapshot
): string {
  const isCaregiver = snapshot.viewerRole === 'caregiver';
  const hideVitals = isCaregiver && !snapshot.consent.shareVitalTrends;
  const hideBaseline = isCaregiver && !snapshot.consent.shareBaselineProgress;
  const hideTimeline = isCaregiver && !snapshot.consent.shareTimelineDetails;
  const hideInsights = isCaregiver && !snapshot.consent.shareAiInsights;

  const sleepVals = snapshot.recent7DayReadings
    .map((r) => r.sleepHours)
    .filter((v): v is number => typeof v === 'number');
  const stepVals = snapshot.recent7DayReadings
    .map((r) => r.steps)
    .filter((v): v is number => typeof v === 'number');
  const hrVals = snapshot.recent7DayReadings
    .map((r) => r.heartRate)
    .filter((v): v is number => typeof v === 'number');
  const spo2Vals = snapshot.recent7DayReadings
    .map((r) => r.spo2)
    .filter((v): v is number => typeof v === 'number');

  const avg = (nums: number[], digits = 1) =>
    nums.length > 0
      ? Number((nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(digits))
      : null;

  const contextPayload = {
    memberName: snapshot.memberName,
    viewerRole: snapshot.viewerRole,
    wearableDevice: snapshot.wearableDeviceName,
    lastSync: snapshot.lastUpdated,
    currentReadings: hideVitals
      ? 'Unavailable: member paused vital trend sharing with caregivers.'
      : snapshot.latestReading
        ? {
            timestamp: snapshot.latestReading.timestamp,
            heartRateBpm: snapshot.latestReading.heartRate,
            spo2Pct: snapshot.latestReading.spo2,
            sleepHours: snapshot.latestReading.sleepHours,
            dailySteps: snapshot.latestReading.steps,
            hrvMs: snapshot.latestReading.hrv,
          }
        : 'No readings recorded yet.',
    sevenDayAverages: hideVitals
      ? 'Restricted by member consent.'
      : {
          daysCount: snapshot.recent7DayReadings.length,
          avgHeartRateBpm: avg(hrVals),
          avgSpo2Pct: avg(spo2Vals),
          avgSleepHours: avg(sleepVals),
          avgDailySteps: avg(stepVals, 0),
        },
    personalBaseline: hideBaseline
      ? 'Unavailable: member paused baseline sharing.'
      : snapshot.baselines
        ? {
            heartRate: {
              usualMeanBpm: snapshot.baselines.heartRate.mean,
              usualMinMaxBpm: [
                snapshot.baselines.heartRate.min,
                snapshot.baselines.heartRate.max,
              ],
              status: snapshot.baselines.heartRate.confidenceStatus,
            },
            spo2: {
              usualMeanPct: snapshot.baselines.spo2.mean,
              usualMinMaxPct: [
                snapshot.baselines.spo2.min,
                snapshot.baselines.spo2.max,
              ],
              status: snapshot.baselines.spo2.confidenceStatus,
            },
            hrv: {
              usualMeanMs: snapshot.baselines.hrv.mean,
              usualMinMaxMs: [
                snapshot.baselines.hrv.min,
                snapshot.baselines.hrv.max,
              ],
            },
          }
        : 'Still learning personal baseline.',
    recentChangesFromNormal: hideTimeline
      ? 'Restricted by member consent.'
      : snapshot.timelineEvents.slice(0, 4).map((e) => ({
          metric: e.metricLabel,
          change: e.deltaText,
          durationDays: e.durationDays,
          status: e.status,
          summary: e.supportingEvidence.summary,
        })),
    alertsAndCaregiverStatus: snapshot.alerts.slice(0, 4).map((a) => ({
      title: a.title,
      severity: a.severity,
      status: a.status,
      detectedAt: a.detectedAt,
      reason: a.evidenceSummary,
      caregiverAcknowledged: a.acknowledgement.acknowledged,
      acknowledgedBy: a.acknowledgement.by ?? null,
      followUpStatus: a.followUp?.status ?? 'none',
    })),
    realtimeSmartAlerts: snapshot.realtimeDeviations.slice(0, 3).map((d) => ({
      title: d.title,
      reason: d.plainEnglishReason,
      caregiverNotified: d.caregiverNotified,
      acknowledged: d.acknowledged,
    })),
    loggedSymptoms: hideInsights
      ? []
      : snapshot.symptomLogs.slice(0, 6).map((s) => ({
          date: s.dateKey,
          feeling: s.symptom,
          intensityOutOf5: s.severity,
          activityContext: s.activityContext ?? null,
          note: s.note ?? null,
          pairedReadings: s.biometricContext ?? null,
        })),
    chartContextNotes: snapshot.chartAnnotations.slice(0, 5).map((n) => ({
      date: n.dateKey,
      metric: n.metric,
      category: n.category,
      note: n.note,
    })),
    dashboardGuide: {
      overview: 'Shows current Heart Rate, SpO2, Sleep, Daily Steps, 30-day shaded normal range charts, Symptom Logger, and 7-day Weekly & PDF Summary.',
      personalBaseline: 'Explains what is normal for the user based on their own recent wearable history.',
      healthTimeline: 'Lists multi-day changes from usual patterns and when they began.',
      aiInsights: 'Has the D3 Dual-Axis Correlation chart comparing biometrics with logged symptoms (1-5) and daily steps.',
      caregiverCentre: 'Shows alerts sent to caregivers, acknowledgement status, and follow-up notes.',
    },
  };

  const supportedLanguageList = VOICE_LANGUAGE_CONFIG.map(
    (lang) => `${lang.name} (${lang.nativeName}, ${lang.bcp47})`
  ).join(', ');

  return `You are VitalSense, a calm, friendly, supportive health-pattern voice assistant.

MULTILINGUAL & CONVERSATION RULES:
1. Explicitly detect and support natural spoken and written conversations in these priority languages: ${supportedLanguageList}, as well as other supported languages.
2. Perform fresh automatic language detection on EVERY turn—never lock the session to a single language.
3. Always reply in the EXACT same language (and natural everyday spoken register) that the user just used in their latest turn, unless they ask you to switch languages.
4. Support seamless mid-conversation language switching (for example: Kannada -> English, Hindi -> Tamil, Telugu -> English, Marathi -> Hindi, Malayalam -> English, Bengali -> English, Gujarati -> Hindi) and code-switched mixed speech (such as Kannada + English, Hindi + English, Tamil + English) naturally without awkwardness.
5. Never force the user to speak English. Never claim fluency in a language you cannot produce accurately; keep words simple, warm, clear, and easy to understand for everyday speakers.
6. Keep responses short, calm, and conversational (2 to 4 brief sentences by default) so they sound natural when spoken aloud. If the user asks for more detail, explain step by step.
7. Avoid complicated medical jargon, technical AI terms, Z-scores, or robotic phrasing.

HEALTH SAFETY RULES (MANDATORY):
1. You are a supportive health-pattern assistant, NOT a doctor.
2. NEVER diagnose diseases, illnesses, or medical conditions.
3. NEVER prescribe medications, supplements, or advise changing/stopping any medication.
4. NEVER invent or guess health readings. Use ONLY the verified VitalSense data below. If a requested reading or section is missing or restricted by caregiver consent, calmly say that information is currently unavailable.
5. NEVER claim that wearable readings confirm someone is healthy or sick, and never offer false reassurance. Remind users briefly when relevant that wearable sensors can occasionally be inaccurate (for example due to strap fit or movement).
6. If the user describes severe or urgent symptoms (such as chest pain, severe trouble breathing, fainting, confusion, or sudden weakness), calmly advise seeking urgent medical care right away. Otherwise encourage contacting a doctor or nurse if they feel unwell or worried.

CURRENT VITALSENSE DATA FOR THIS SESSION:
${JSON.stringify(contextPayload, null, 2)}`;
}

/**
 * Downsamples Float32 PCM audio from browser hardware rate (often 44.1kHz or 48kHz)
 * to 16kHz required by Gemini Live API.
 */
export function downsampleFloat32To16k(
  samples: Float32Array,
  inputSampleRate: number
): Float32Array {
  if (inputSampleRate === 16000 || samples.length === 0) {
    return samples;
  }
  const ratio = inputSampleRate / 16000;
  const outputLength = Math.max(1, Math.floor(samples.length / ratio));
  const result = new Float32Array(outputLength);
  for (let i = 0; i < outputLength; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(samples.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    let count = 0;
    for (let j = start; j < end; j++) {
      sum += samples[j];
      count++;
    }
    result[i] = count > 0 ? sum / count : samples[start] ?? 0;
  }
  return result;
}

/**
 * Encodes Float32 [-1, 1] mono samples to base64 16-bit signed little-endian PCM.
 */
export function encodePcm16ToBase64(samples: Float32Array): string {
  const byteLength = samples.length * 2;
  const buffer = new ArrayBuffer(byteLength);
  const view = new DataView(buffer);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    const int16 = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    view.setInt16(i * 2, Math.round(int16), true);
  }
  const bytes = new Uint8Array(buffer);
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/**
 * Decodes base64 16-bit signed little-endian PCM to Float32 [-1, 1] samples.
 */
export function decodeBase64ToFloat32Pcm(base64: string): Float32Array {
  let bytes: Uint8Array;
  if (typeof Buffer !== 'undefined') {
    bytes = new Uint8Array(Buffer.from(base64, 'base64'));
  } else {
    const binary = atob(base64);
    bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
  }
  const sampleCount = Math.floor(bytes.byteLength / 2);
  const result = new Float32Array(sampleCount);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < sampleCount; i++) {
    result[i] = view.getInt16(i * 2, true) / 32768;
  }
  return result;
}

export function computeRmsLevel(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sumSq = 0;
  for (let i = 0; i < samples.length; i++) {
    sumSq += samples[i] * samples[i];
  }
  return Math.min(1, Math.sqrt(sumSq / samples.length) * 3.2);
}

/**
 * Merges streaming transcript fragments cleanly for a speaker turn.
 */
export function upsertTranscriptTurn(
  entries: VoiceTranscriptEntry[],
  params: {
    role: 'user' | 'assistant';
    textChunk: string;
    isFinal?: boolean;
    source?: 'voice' | 'text';
    timestamp?: string;
  }
): VoiceTranscriptEntry[] {
  const chunk = params.textChunk;
  if (!chunk.trim() && !params.isFinal) return entries;

  const last = entries[entries.length - 1];
  const nowIso = params.timestamp ?? new Date().toISOString();

  if (last && last.role === params.role && !last.isFinal) {
    const needsSpace =
      last.text.length > 0 &&
      chunk.length > 0 &&
      !/\s$/.test(last.text) &&
      !/^[.,!?;:'")\s]/.test(chunk);
    const mergedText = (last.text + (needsSpace ? ' ' : '') + chunk).trim();
    const updated: VoiceTranscriptEntry = {
      ...last,
      text: mergedText,
      isFinal: Boolean(params.isFinal),
      timestamp: nowIso,
    };
    return [...entries.slice(0, -1), updated];
  }

  if (!chunk.trim()) return entries;

  return [
    ...entries,
    {
      id: `vt_${params.role}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      role: params.role,
      text: chunk.trim(),
      timestamp: nowIso,
      isFinal: Boolean(params.isFinal),
      source: params.source ?? 'voice',
    },
  ];
}
