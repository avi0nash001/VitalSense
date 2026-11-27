import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type {
  AIInsight,
  AlertRecord,
  ChartAnnotation,
  ConsentRecord,
  ConsentSettings,
  DataSourceKind,
  LiveVitalSample,
  MonitoringPreferences,
  RealtimeDeviationEvent,
  RestRecommendation,
  RppgMeasurement,
  SafetyAlertRecord,
  SafetyContact,
  ScenarioId,
  SensorSession,
  SmartAlertThresholds,
  SymptomLog,
  TimelineEvent,
  UserProfile,
  VitalReading,
  WellbeingCheckin,
  WellbeingCompanionMessage,
} from '../src/lib/types.ts';
import {
  computeBaselines,
  detectGradualChanges,
  METRIC_DEFINITIONS,
} from '../src/lib/vitalsEngine.ts';
import { generateScenarioReadings } from '../src/lib/simulator.ts';
import { generateSimulatedLiveSample } from '../src/lib/intelligenceEngine.ts';
import { DEFAULT_SMART_ALERT_THRESHOLDS } from '../src/lib/smartAlertEngine.ts';

export interface StoredAccount extends UserProfile {
  passwordHash: string;
  passwordSalt: string;
}

export interface WorkspaceStoreState {
  accounts: StoredAccount[];
  readings: VitalReading[];
  timelineEvents: TimelineEvent[];
  insights: AIInsight[];
  alerts: AlertRecord[];
  consent: ConsentSettings;
  preferences: MonitoringPreferences;
  activeScenario: ScenarioId | 'csv_upload' | 'demo_baseline';
  lastUpdated: string;
  // VITALSENSE Wearable & Caregiver collections
  sensorSessions: SensorSession[];
  liveSamples: LiveVitalSample[];
  rppgMeasurements: RppgMeasurement[];
  wellbeingCheckins: WellbeingCheckin[];
  companionMessages: WellbeingCompanionMessage[];
  restRecommendations: RestRecommendation[];
  safetyContacts: SafetyContact[];
  safetyAlerts: SafetyAlertRecord[];
  consentRecords: ConsentRecord[];
  smartAlertThresholds: SmartAlertThresholds;
  chartAnnotations: ChartAnnotation[];
  realtimeDeviations: RealtimeDeviationEvent[];
  symptomLogs: SymptomLog[];
}

const DATA_DIR = path.resolve(process.cwd(), '.vitalsense-data');
const STORE_PATH = path.resolve(DATA_DIR, 'store.json');

function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const actualSalt = salt ?? crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, actualSalt, 64).toString('hex');
  return { hash: derived, salt: actualSalt };
}

export function verifyPassword(password: string, account: StoredAccount): boolean {
  const { hash } = hashPassword(password, account.passwordSalt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(account.passwordHash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function buildInsightsAndAlertsFromReadings(
  readings: VitalReading[],
  preferences: MonitoringPreferences,
  consent: ConsentSettings,
  existingEvents: TimelineEvent[] = [],
  existingInsights: AIInsight[] = [],
  existingAlerts: AlertRecord[] = []
): {
  timelineEvents: TimelineEvent[];
  insights: AIInsight[];
  alerts: AlertRecord[];
} {
  const candidates = detectGradualChanges(readings, preferences.restingHeartRateSensitivity);
  const dominantSource: DataSourceKind =
    readings.some((r) => r.source === 'synthetic')
      ? 'synthetic'
      : readings.some((r) => r.source === 'real_csv')
        ? 'real_csv'
        : 'baseline_demo';

  const timelineEvents: TimelineEvent[] = [];
  const insights: AIInsight[] = [];
  const alerts: AlertRecord[] = [];

  candidates.forEach((cand, index) => {
    const evtId = `evt_${cand.metric}_${index}`;
    const insId = `ins_${cand.metric}_${index}`;
    const altId = `alt_${cand.metric}_${index}`;

    const prevEvt = existingEvents.find((e) => e.metric === cand.metric && e.status !== 'resolved');
    const prevIns = existingInsights.find((i) => i.metric === cand.metric);
    const prevAlt = existingAlerts.find((a) => a.metric === cand.metric && a.status !== 'resolved');

    const directionWord = cand.delta > 0 ? 'higher' : 'lower';
    const def = METRIC_DEFINITIONS[cand.metric];

    timelineEvents.push({
      id: evtId,
      firstDetectedAt: cand.firstDetectedAt,
      lastObservedAt: cand.lastObservedAt,
      metric: cand.metric,
      metricLabel: cand.metricLabel,
      unit: cand.unit,
      previousBaseline: cand.previousBaseline,
      currentObserved: cand.currentObserved,
      deltaText: cand.deltaText,
      durationDays: cand.durationDays,
      detectionMethod: cand.detectionMethod,
      status: prevEvt?.status ?? (cand.severity === 'high' ? 'active' : 'monitoring'),
      severity: cand.severity,
      source: dominantSource,
      supportingEvidence: {
        sampleCount: cand.sampleCount,
        consistencyPct: cand.consistencyPct,
        zScore: cand.zScore,
        dataQualityAvg: cand.dataQualityAvg,
        summary: `Across ${cand.sampleCount} recent nights, your ${cand.metricLabel.toLowerCase()} averaged ${cand.currentObserved} ${cand.unit} instead of your usual ${cand.previousBaseline} ${cand.unit}.`,
        progressionPoints: cand.progressionPoints,
      },
      aiExplanationId: insId,
      alertId: altId,
      caregiverAck: prevEvt?.caregiverAck ?? {
        acknowledged: false,
        followUpStatus: 'pending',
      },
    });

    insights.push({
      id: insId,
      title: `${cand.metricLabel} stayed ${directionWord} than usual for ${cand.durationDays} days`,
      createdAt: cand.lastObservedAt,
      metric: cand.metric,
      metricLabel: cand.metricLabel,
      whatChanged: `Your ${cand.metricLabel.toLowerCase()} moved by ${cand.deltaText} over ${cand.durationDays} days compared with your usual range.`,
      supportingMeasurements: [
        `Recent average: ${cand.currentObserved} ${cand.unit} across ${cand.sampleCount} nights`,
        `Your personal baseline: ${cand.previousBaseline} ${cand.unit}`,
        `Pattern consistency: ${cand.consistencyPct}% of recent readings`,
        `Data coverage: ${cand.dataQualityAvg}% valid wearable readings`,
      ],
      baselineComparison: `Usually around ${cand.previousBaseline} ${def.unit}, recently ${cand.currentObserved} ${def.unit} (${cand.deltaText})`,
      durationAndTrend: `${cand.durationDays} days ${directionWord} than your normal baseline`,
      timelineEventId: evtId,
      source: dominantSource,
      geminiAnalysis: prevIns?.geminiAnalysis ?? {
        generatedAt: cand.lastObservedAt,
        model: 'gemini-4-hydrogen',
        summary: `Over the past ${cand.durationDays} days, your ${cand.metricLabel.toLowerCase()} stayed ${cand.deltaText} away from your usual ${cand.previousBaseline} ${cand.unit}. Because this lasted across ${cand.sampleCount} nights, it stands out from normal day-to-day ups and downs.`,
        patternExplanation: `${def.description} A steady multi-day change like this can happen when your body is working harder to recover, sleeping less deeply, or adjusting to travel or routine changes.`,
        nonDiagnosticNextSteps: [
          'Check your recent sleep hours, daily steps, and fluid intake over the past few days.',
          'Make sure your wearable strap or ring fits comfortably overnight so readings stay clear.',
          'Share this timeline summary with a doctor or nurse if the pattern continues for several more days.',
        ],
        clinicianQuestions: [
          `My ${cand.metricLabel.toLowerCase()} stayed around ${cand.currentObserved} ${cand.unit} instead of my usual ${cand.previousBaseline} ${cand.unit} for ${cand.durationDays} days—what else would be helpful for me to note?`,
          'Is there anything else you would like me to keep an eye on over the next few days?',
        ],
        disclaimer:
          'Plain-English trend summary only. VITALSENSE does not diagnose medical conditions.',
      },
      lastError: null,
    });

    const alertSeverity: AlertRecord['severity'] =
      cand.severity === 'high' ? 'priority' : cand.severity === 'moderate' ? 'attention' : 'advisory';

    alerts.push({
      id: altId,
      title: `${cand.metricLabel} ${directionWord} than usual (${cand.deltaText})`,
      severity: alertSeverity,
      status: prevAlt?.status ?? 'open',
      detectedAt: cand.firstDetectedAt,
      metric: cand.metric,
      metricLabel: cand.metricLabel,
      evidenceSummary: `${cand.sampleCount}-day average of ${cand.currentObserved} ${cand.unit} compared with your usual ${cand.previousBaseline} ${cand.unit}.`,
      timelineEventId: evtId,
      source: dominantSource,
      acknowledgement: prevAlt?.acknowledgement ?? { acknowledged: false },
      notifications: [
        {
          id: `notif_${altId}_1`,
          recipient: 'Sarah Vance (Primary Caregiver)',
          channel: 'Caregiver Portal & Digest',
          sentAt: cand.firstDetectedAt,
          status: consent.notifyCaregiverOnAlerts ? 'delivered' : 'withheld_by_consent',
        },
      ],
      followUp: prevAlt?.followUp ?? { status: 'none' },
    });
  });

  // Always preserve at least one resolved historical baseline event in baseline_demo mode for longitudinal richness
  if (dominantSource === 'baseline_demo') {
    timelineEvents.push({
      id: 'evt_historical_resolved',
      firstDetectedAt: '2026-10-28T07:10:00.000Z',
      lastObservedAt: '2026-11-02T07:15:00.000Z',
      metric: 'hrv',
      metricLabel: 'Heart Rate Variability',
      unit: 'ms',
      previousBaseline: 54.4,
      currentObserved: 47.2,
      deltaText: '-7.2 ms',
      durationDays: 5,
      detectionMethod: '5-day recovery pattern compared with your 14-day normal range',
      status: 'resolved',
      severity: 'low',
      source: 'baseline_demo',
      supportingEvidence: {
        sampleCount: 5,
        consistencyPct: 80,
        zScore: 1.78,
        dataQualityAvg: 95,
        summary:
          'Temporary 5-day HRV dip during late-October travel schedule that returned to 54.0 ms baseline equilibrium by Nov 2.',
        progressionPoints: [
          { date: '2026-10-27', observed: 54.2, baseline: 54.4 },
          { date: '2026-10-28', observed: 49.8, baseline: 54.4 },
          { date: '2026-10-29', observed: 47.4, baseline: 54.4 },
          { date: '2026-10-30', observed: 46.1, baseline: 54.4 },
          { date: '2026-10-31', observed: 48.2, baseline: 54.4 },
          { date: '2026-11-01', observed: 51.6, baseline: 54.4 },
          { date: '2026-11-02', observed: 54.1, baseline: 54.4 },
        ],
      },
      caregiverAck: {
        acknowledged: true,
        acknowledgedBy: 'Sarah Vance',
        acknowledgedAt: '2026-10-30T14:20:00.000Z',
        followUpNote: 'Checked in by phone; confirmed travel schedule and tracked return to baseline.',
        followUpStatus: 'completed',
      },
    });
  }

  return { timelineEvents, insights, alerts };
}

function createInitialStoreState(): WorkspaceStoreState {
  const memberHash = hashPassword('vitalsense-member-2026');
  const caregiverHash = hashPassword('vitalsense-caregiver-2026');

  const accounts: StoredAccount[] = [
    {
      id: 'user_member_elena',
      name: 'Elena Vance',
      email: 'elena.vance@vitalsense.demo',
      role: 'member',
      avatarUrl: '/src/assets/images/avatar_patient_1795280112813.jpg',
      relationOrTitle: 'Monitored Member',
      passwordHash: memberHash.hash,
      passwordSalt: memberHash.salt,
    },
    {
      id: 'user_caregiver_sarah',
      name: 'Sarah Vance',
      email: 'sarah.vance@vitalsense.demo',
      role: 'caregiver',
      avatarUrl: '/src/assets/images/avatar_caregiver_1795280111139.jpg',
      relationOrTitle: 'Authorized Caregiver · Sister',
      passwordHash: caregiverHash.hash,
      passwordSalt: caregiverHash.salt,
    },
  ];

  const consent: ConsentSettings = {
    shareVitalTrends: true,
    shareBaselineProgress: true,
    shareTimelineDetails: true,
    shareAiInsights: true,
    notifyCaregiverOnAlerts: true,
  };

  const preferences: MonitoringPreferences = {
    restingHeartRateSensitivity: 'balanced',
    baselineWindowDays: 14,
    preferredUnitSystem: 'metric',
    wearableDeviceName: 'PulseRing Gen 3 (Nightly Sync)',
  };

  const readings = generateScenarioReadings('gradual_drift', '2026-11-21T07:15:00.000Z', 'baseline_demo');
  const { timelineEvents, insights, alerts } = buildInsightsAndAlertsFromReadings(
    readings,
    preferences,
    consent
  );

  // Pre-acknowledge one secondary alert for realistic workflow demonstration
  if (alerts.length > 1) {
    alerts[1].status = 'acknowledged';
    alerts[1].acknowledgement = {
      acknowledged: true,
      by: 'Sarah Vance',
      at: '2026-11-20T18:40:00.000Z',
    };
    alerts[1].followUp = {
      status: 'scheduled',
      note: 'Monitoring overnight trend for 48 hours before sharing summary.',
      updatedAt: '2026-11-20T18:42:00.000Z',
      updatedBy: 'Sarah Vance',
    };
    const linkedEvt = timelineEvents.find((e) => e.id === alerts[1].timelineEventId);
    if (linkedEvt) {
      linkedEvt.caregiverAck = {
        acknowledged: true,
        acknowledgedBy: 'Sarah Vance',
        acknowledgedAt: '2026-11-20T18:40:00.000Z',
        followUpNote: 'Monitoring overnight trend for 48 hours before sharing summary.',
        followUpStatus: 'in_progress',
      };
    }
  }

  const seededSessionId = 'sens_demo_stream';
  const seededLiveSamples: LiveVitalSample[] = Array.from({ length: 10 }, (_, idx) =>
    generateSimulatedLiveSample({
      sessionId: seededSessionId,
      deviceName: 'Demo Multi-Channel Stream (SIMULATED)',
      stepIndex: idx,
      scenario: 'normal',
      timestamp: new Date(Date.now() - (10 - idx) * 4000).toISOString(),
    })
  );

  const seededSensorSessions: SensorSession[] = [
    {
      id: seededSessionId,
      adapterId: 'simulated_stream',
      deviceName: 'Demo Multi-Channel Stream (SIMULATED)',
      source: 'simulated',
      status: 'stopped',
      startedAt: seededLiveSamples[0].timestamp,
      stoppedAt: seededLiveSamples[seededLiveSamples.length - 1].timestamp,
      sampleCount: seededLiveSamples.length,
      connectionStatus: 'disconnected',
    },
  ];

  const seededCheckins: WellbeingCheckin[] = [
    {
      id: 'wb_seed_1',
      timestamp: '2026-11-22T20:15:00.000Z',
      mood: 'calm',
      sleepQuality: 4,
      energyLevel: 4,
      socialConnectedness: 'connected',
      wantsToTalk: false,
      breakReminderRequested: false,
      journalNote: 'Evening walk after work helped settle resting heart rate.',
    },
    {
      id: 'wb_seed_2',
      timestamp: '2026-11-21T20:00:00.000Z',
      mood: 'tired',
      sleepQuality: 3,
      energyLevel: 3,
      socialConnectedness: 'connected',
      wantsToTalk: false,
      breakReminderRequested: true,
      journalNote: 'Busy day — scheduled an earlier wind-down.',
    },
  ];

  const seededContacts: SafetyContact[] = [
    {
      id: 'contact_sarah',
      name: 'Sarah Vance',
      relation: 'Sister · Authorized Caregiver',
      role: 'caregiver',
      channel: 'Portal & Digest',
      contactValue: 'sarah.vance@vitalsense.demo',
      notifyOnCategories: ['physiological_change', 'wellbeing_support', 'caregiver_followup'],
      consentVerified: true,
      addedAt: '2026-11-01T10:00:00.000Z',
    },
    {
      id: 'contact_marcus',
      name: 'Marcus Chen',
      relation: 'Close Neighbor · Trusted Contact',
      role: 'trusted_contact',
      channel: 'Phone',
      contactValue: '+1 (555) 014-8820',
      notifyOnCategories: ['wellbeing_support', 'missed_checkin'],
      consentVerified: true,
      addedAt: '2026-11-05T14:30:00.000Z',
    },
  ];

  const seededSafetyAlerts: SafetyAlertRecord[] = [
    {
      id: 'sal_seed_1',
      category: 'physiological_change',
      severity: 'attention',
      title: 'Resting heart rate stayed higher (+6.7 bpm)',
      description: 'Recent nights averaged 69.7 bpm compared with your usual 62.9 bpm baseline.',
      createdAt: '2026-11-21T07:15:00.000Z',
      source: 'simulated',
      requiresHumanConfirmation: true,
      acknowledged: true,
      acknowledgedBy: 'Sarah Vance',
      acknowledgedAt: '2026-11-21T08:14:00.000Z',
      followUpNote: 'Checked in by phone; resting and drinking water.',
    },
  ];

  const seededConsentRecords: ConsentRecord[] = [
    {
      id: 'cons_camera_rppg',
      scope: 'camera_rppg',
      granted: false,
      updatedAt: new Date().toISOString(),
      retentionPolicy: 'Processed in your browser only; no video saved. Only numeric pulse checks are kept if you choose to save them.',
    },
    {
      id: 'cons_caregiver_sharing',
      scope: 'caregiver_sharing',
      granted: true,
      updatedAt: new Date().toISOString(),
      retentionPolicy: 'You choose what caregivers see and can pause sharing at any time.',
    },
    {
      id: 'cons_wellbeing_trends',
      scope: 'wellbeing_trends',
      granted: true,
      updatedAt: new Date().toISOString(),
      retentionPolicy: 'Voluntary daily check-ins only.',
    },
  ];

  return {
    accounts,
    readings,
    timelineEvents,
    insights,
    alerts,
    consent,
    preferences,
    activeScenario: 'demo_baseline',
    lastUpdated: new Date().toISOString(),
    sensorSessions: seededSensorSessions,
    liveSamples: seededLiveSamples,
    rppgMeasurements: [],
    wellbeingCheckins: seededCheckins,
    companionMessages: [
      {
        id: 'cmp_welcome',
        role: 'assistant',
        text: 'Welcome to your optional wellbeing space. You can log how rested or connected you feel, or chat anytime alongside your trusted contacts.',
        timestamp: '2026-11-22T20:15:00.000Z',
      },
    ],
    restRecommendations: [],
    safetyContacts: seededContacts,
    safetyAlerts: seededSafetyAlerts,
    consentRecords: seededConsentRecords,
    smartAlertThresholds: { ...DEFAULT_SMART_ALERT_THRESHOLDS },
    chartAnnotations: [
      {
        id: 'ann_seed_1',
        timestamp: readings[Math.max(0, readings.length - 5)]?.timestamp ?? '2026-11-17T07:15:00.000Z',
        dateKey: (readings[Math.max(0, readings.length - 5)]?.timestamp ?? '2026-11-17').slice(0, 10),
        metric: 'heartRate',
        category: 'stress',
        note: 'Stressful meeting & late workday',
        createdAt: '2026-11-17T19:30:00.000Z',
        createdBy: 'Elena Vance',
      },
      {
        id: 'ann_seed_2',
        timestamp: readings[Math.max(0, readings.length - 2)]?.timestamp ?? '2026-11-20T07:15:00.000Z',
        dateKey: (readings[Math.max(0, readings.length - 2)]?.timestamp ?? '2026-11-20').slice(0, 10),
        metric: 'all',
        category: 'exercise',
        note: 'Morning brisk walk & hydration',
        createdAt: '2026-11-20T09:15:00.000Z',
        createdBy: 'Elena Vance',
      },
    ],
    realtimeDeviations: [],
    symptomLogs: (() => {
      const rA = readings[Math.max(0, readings.length - 4)];
      const rB = readings[Math.max(0, readings.length - 3)];
      const rC = readings[Math.max(0, readings.length - 1)];
      return [
        {
          id: 'sym_seed_3',
          timestamp: rC?.timestamp ?? '2026-11-21T07:15:00.000Z',
          dateKey: (rC?.timestamp ?? '2026-11-21').slice(0, 10),
          symptom: 'Fatigue',
          severity: 3,
          biometricContext: {
            heartRate: rC?.heartRate,
            spo2: rC?.spo2,
            sleepHours: rC?.sleepHours,
            steps: rC?.steps,
          },
          activityContext: 'Shorter sleep & afternoon desk work',
          note: 'Felt low energy mid-afternoon; rested with water.',
          createdAt: '2026-11-21T15:20:00.000Z',
          createdBy: 'Elena Vance',
        },
        {
          id: 'sym_seed_2',
          timestamp: rB?.timestamp ?? '2026-11-19T07:15:00.000Z',
          dateKey: (rB?.timestamp ?? '2026-11-19').slice(0, 10),
          symptom: 'Dizziness',
          severity: 4,
          biometricContext: {
            heartRate: rB?.heartRate,
            spo2: rB?.spo2,
            sleepHours: rB?.sleepHours,
            steps: rB?.steps,
          },
          activityContext: 'Standing up after long meeting',
          note: 'Brief lightheaded spell for ~30 seconds.',
          createdAt: '2026-11-19T14:40:00.000Z',
          createdBy: 'Elena Vance',
        },
        {
          id: 'sym_seed_1',
          timestamp: rA?.timestamp ?? '2026-11-18T07:15:00.000Z',
          dateKey: (rA?.timestamp ?? '2026-11-18').slice(0, 10),
          symptom: 'Headache',
          severity: 2,
          biometricContext: {
            heartRate: rA?.heartRate,
            spo2: rA?.spo2,
            sleepHours: rA?.sleepHours,
            steps: rA?.steps,
          },
          activityContext: 'Morning wake-up',
          note: 'Mild tension after 6h sleep.',
          createdAt: '2026-11-18T08:10:00.000Z',
          createdBy: 'Elena Vance',
        },
      ];
    })(),
  };
}

let cachedState: WorkspaceStoreState | null = null;

function ensureV2StoreDefaults(state: Partial<WorkspaceStoreState>): WorkspaceStoreState {
  const defaults = createInitialStoreState();
  const cleanContacts = (state.safetyContacts ?? defaults.safetyContacts).map((c) => ({
    ...c,
    notifyOnCategories: (c.notifyOnCategories ?? []).filter(
      (cat) => (cat as string) !== 'driver_fatigue'
    ),
  }));
  const cleanSafetyAlerts = (state.safetyAlerts ?? defaults.safetyAlerts).filter(
    (a) => (a.category as string) !== 'driver_fatigue'
  );
  const cleanConsentRecords = (state.consentRecords ?? defaults.consentRecords).filter(
    (r) => (r.scope as string) !== 'camera_driver'
  );
  return {
    ...defaults,
    ...state,
    sensorSessions: state.sensorSessions ?? defaults.sensorSessions,
    liveSamples: state.liveSamples ?? defaults.liveSamples,
    rppgMeasurements: state.rppgMeasurements ?? defaults.rppgMeasurements,
    wellbeingCheckins: state.wellbeingCheckins ?? defaults.wellbeingCheckins,
    companionMessages: state.companionMessages ?? defaults.companionMessages,
    restRecommendations: state.restRecommendations ?? defaults.restRecommendations,
    safetyContacts: cleanContacts,
    safetyAlerts: cleanSafetyAlerts,
    consentRecords: cleanConsentRecords,
    smartAlertThresholds: state.smartAlertThresholds ?? defaults.smartAlertThresholds,
    chartAnnotations: state.chartAnnotations ?? defaults.chartAnnotations,
    realtimeDeviations: state.realtimeDeviations ?? defaults.realtimeDeviations,
    symptomLogs: state.symptomLogs ?? defaults.symptomLogs,
  };
}

export function getStore(): WorkspaceStoreState {
  if (cachedState) return cachedState;

  try {
    if (fs.existsSync(STORE_PATH)) {
      const raw = fs.readFileSync(STORE_PATH, 'utf8');
      cachedState = ensureV2StoreDefaults(JSON.parse(raw) as Partial<WorkspaceStoreState>);
      return cachedState;
    }
  } catch {
    // Fallback cleanly to freshly seeded state if disk cache is malformed
  }

  cachedState = createInitialStoreState();
  saveStore(cachedState);
  return cachedState;
}

export function saveStore(state: WorkspaceStoreState): void {
  state.lastUpdated = new Date().toISOString();
  cachedState = state;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(STORE_PATH, JSON.stringify(state, null, 2), 'utf8');
  } catch {
    // Keep operating cleanly in memory if filesystem is read-only
  }
}

export function recomputeStoreAnalysis(state: WorkspaceStoreState): WorkspaceStoreState {
  const { timelineEvents, insights, alerts } = buildInsightsAndAlertsFromReadings(
    state.readings,
    state.preferences,
    state.consent,
    state.timelineEvents,
    state.insights,
    state.alerts
  );
  state.timelineEvents = timelineEvents;
  state.insights = insights;
  state.alerts = alerts;
  saveStore(state);
  return state;
}

export function resetStoreToDemo(): WorkspaceStoreState {
  const fresh = createInitialStoreState();
  // Preserve any registered user accounts
  if (cachedState) {
    const defaultIds = new Set(['user_member_elena', 'user_caregiver_sarah']);
    const customAccounts = cachedState.accounts.filter((a) => !defaultIds.has(a.id));
    fresh.accounts = [...fresh.accounts, ...customAccounts];
  }
  saveStore(fresh);
  return fresh;
}

export function registerNewMemberAccount(params: {
  name: string;
  email: string;
  password: string;
  role: 'member' | 'caregiver';
}): StoredAccount {
  const store = getStore();
  const normalizedEmail = params.email.trim().toLowerCase();
  const existing = store.accounts.find((a) => a.email.toLowerCase() === normalizedEmail);
  if (existing) {
    throw new Error('An account with that email already exists.');
  }
  const { hash, salt } = hashPassword(params.password);
  const newAccount: StoredAccount = {
    id: `user_${crypto.randomUUID().slice(0, 8)}`,
    name: params.name.trim(),
    email: normalizedEmail,
    role: params.role,
    avatarUrl:
      params.role === 'caregiver'
        ? '/src/assets/images/avatar_caregiver_1795280111139.jpg'
        : '/src/assets/images/avatar_patient_1795280112813.jpg',
    relationOrTitle: params.role === 'caregiver' ? 'Authorized Caregiver' : 'Monitored Member',
    passwordHash: hash,
    passwordSalt: salt,
  };
  store.accounts.push(newAccount);
  saveStore(store);
  return newAccount;
}

export function computeStoreBaselines(store: WorkspaceStoreState) {
  return computeBaselines(store.readings, store.preferences.baselineWindowDays);
}
