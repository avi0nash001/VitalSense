export type MetricKey =
  | 'heartRate'
  | 'spo2'
  | 'temperature'
  | 'respiratoryRate'
  | 'hrv';

export type DataSourceKind = 'baseline_demo' | 'real_csv' | 'synthetic';

export interface VitalReading {
  id: string;
  timestamp: string;
  source: DataSourceKind;
  qualityScore: number; // 0 to 100
  heartRate?: number;
  spo2?: number;
  temperature?: number;
  respiratoryRate?: number;
  hrv?: number;
  sleepHours?: number;
  steps?: number;
  note?: string;
}

export type BaselineConfidence = 'insufficient' | 'learning' | 'established';

export interface MetricBaseline {
  metric: MetricKey;
  label: string;
  unit: string;
  mean: number | null;
  stdDev: number | null;
  min: number | null;
  max: number | null;
  readingCount: number;
  coverageDays: number;
  targetDays: number;
  progressPct: number;
  confidenceStatus: BaselineConfidence;
  lastUpdated: string | null;
}

export interface LatestMetricSnapshot {
  metric: MetricKey;
  label: string;
  unit: string;
  latestValue: number | null;
  latestTimestamp: string | null;
  baselineMean: number | null;
  deltaFromBaseline: number | null;
  deltaPct: number | null;
  trendStatus:
    | 'within_baseline'
    | 'upward_shift'
    | 'downward_shift'
    | 'insufficient_baseline'
    | 'no_data';
  trendSummary: string;
  qualityScore: number | null;
  qualityLabel: 'High' | 'Moderate' | 'Low' | 'Unavailable';
  source: DataSourceKind | null;
}

export interface TimelineProgressionPoint {
  date: string;
  observed: number;
  baseline: number;
}

export interface TimelineEvent {
  id: string;
  firstDetectedAt: string;
  lastObservedAt: string;
  metric: MetricKey;
  metricLabel: string;
  unit: string;
  previousBaseline: number;
  currentObserved: number;
  deltaText: string;
  durationDays: number;
  detectionMethod: string;
  status: 'active' | 'monitoring' | 'resolved';
  severity: 'low' | 'moderate' | 'high';
  source: DataSourceKind;
  supportingEvidence: {
    sampleCount: number;
    consistencyPct: number;
    zScore: number;
    dataQualityAvg: number;
    summary: string;
    progressionPoints: TimelineProgressionPoint[];
  };
  aiExplanationId?: string;
  alertId?: string;
  caregiverAck: {
    acknowledged: boolean;
    acknowledgedBy?: string;
    acknowledgedAt?: string;
    followUpNote?: string;
    followUpStatus: 'pending' | 'in_progress' | 'completed';
  };
}

export interface GeminiAnalysisBlock {
  generatedAt: string;
  model: string;
  summary: string;
  patternExplanation: string;
  nonDiagnosticNextSteps: string[];
  clinicianQuestions: string[];
  disclaimer: string;
}

export interface AIInsight {
  id: string;
  title: string;
  createdAt: string;
  metric: MetricKey;
  metricLabel: string;
  whatChanged: string;
  supportingMeasurements: string[];
  baselineComparison: string;
  durationAndTrend: string;
  timelineEventId: string;
  source: DataSourceKind;
  geminiAnalysis: GeminiAnalysisBlock | null;
  lastError?: string | null;
}

export interface InsightChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
}

export interface AlertNotificationLog {
  id: string;
  recipient: string;
  channel: string;
  sentAt: string;
  status: 'delivered' | 'withheld_by_consent';
}

export interface AlertRecord {
  id: string;
  title: string;
  severity: 'advisory' | 'attention' | 'priority';
  status: 'open' | 'acknowledged' | 'resolved';
  detectedAt: string;
  metric: MetricKey;
  metricLabel: string;
  evidenceSummary: string;
  timelineEventId: string;
  source: DataSourceKind;
  acknowledgement: {
    acknowledged: boolean;
    by?: string;
    at?: string;
  };
  notifications: AlertNotificationLog[];
  followUp: {
    status: 'none' | 'scheduled' | 'completed';
    note?: string;
    updatedAt?: string;
    updatedBy?: string;
  };
}

export interface ConsentSettings {
  shareVitalTrends: boolean;
  shareBaselineProgress: boolean;
  shareTimelineDetails: boolean;
  shareAiInsights: boolean;
  notifyCaregiverOnAlerts: boolean;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: 'member' | 'caregiver';
  avatarUrl: string;
  relationOrTitle: string;
}

export interface MonitoringPreferences {
  restingHeartRateSensitivity: 'balanced' | 'sensitive' | 'conservative';
  baselineWindowDays: number;
  preferredUnitSystem: 'metric';
  wearableDeviceName: string;
}

export type ScenarioId =
  | 'stable'
  | 'gradual_drift'
  | 'noisy_missing'
  | 'isolated_anomaly'
  | 'multi_metric';

export interface CsvInvalidRow {
  rowNumber: number;
  rawLine: string;
  reasons: string[];
}

export interface CsvParseResult {
  validRows: VitalReading[];
  invalidRows: CsvInvalidRow[];
  qualitySummary: {
    totalRows: number;
    validCount: number;
    invalidCount: number;
    completenessPct: number;
    avgQualityScore: number;
    detectedColumns: string[];
  };
}

// --- VITALSENSE Wearable & Caregiver Extensions ---

export type LiveTelemetrySource =
  | 'real_sensor'
  | 'camera_rppg_experimental'
  | 'simulated';

export type WearableAdapterId =
  | 'smartwatch_sync'
  | 'fitness_band'
  | 'ble_heart_rate'
  | 'pulse_oximeter'
  | 'simulated_stream';

export interface WearableAdapterInfo {
  id: WearableAdapterId;
  name: string;
  category: string;
  supportedMetrics: string[];
  hardwareRequired: string;
  supportsBrowserLive: boolean;
}

export interface SensorSession {
  id: string;
  adapterId: WearableAdapterId;
  deviceName: string;
  source: LiveTelemetrySource;
  status: 'active' | 'stopped';
  startedAt: string;
  stoppedAt?: string;
  sampleCount: number;
  connectionStatus: 'connected' | 'intermittent' | 'disconnected';
}

export interface LiveVitalSample {
  id: string;
  sessionId: string;
  timestamp: string;
  source: LiveTelemetrySource;
  deviceName: string;
  heartRate: number | null;
  spo2: number | null;
  respiratoryRate: number | null;
  temperature: number | null;
  hrv: number | null;
  activityCadence: number | null;
  sleepHours: number | null;
  signalQuality: number; // 0..100
  missingChannels: string[];
  reliabilityNote: string;
}

export interface RppgMeasurement {
  id: string;
  timestamp: string;
  source: 'camera_rppg_experimental' | 'simulated';
  estimatedHeartRate: number | null;
  confidencePct: number;
  signalQuality: number; // 0..100
  lightingStatus: 'good' | 'low_light' | 'overexposed';
  motionStatus: 'steady' | 'moderate_motion' | 'excessive_motion';
  passedQualityCheck: boolean;
  failureReason?: string;
  roiLabel: string;
  disclaimer: string;
}

export interface WellbeingCheckin {
  id: string;
  timestamp: string;
  mood: 'calm' | 'okay' | 'low' | 'stressed' | 'tired';
  sleepQuality: 1 | 2 | 3 | 4 | 5;
  energyLevel: 1 | 2 | 3 | 4 | 5;
  socialConnectedness: 'connected' | 'somewhat_isolated' | 'isolated';
  wantsToTalk: boolean;
  breakReminderRequested: boolean;
  journalNote?: string;
}

export interface WellbeingTrendSummary {
  totalCheckins: number;
  recentMoodSummary: string;
  avgSleepQuality: number | null;
  avgEnergyLevel: number | null;
  connectednessPattern: 'steady' | 'less_connected' | 'insufficient';
  neutralObservation: string;
  suggestTrustedReachOut: boolean;
  lastCheckinAt: string | null;
}

export interface WellbeingCompanionMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
  crisisGuidanceShown?: boolean;
  suggestedAction?: string;
}

export interface RestRecommendation {
  id: string;
  createdAt: string;
  source: 'wearable_sleep' | 'wellbeing' | 'combined';
  observations: string[];
  reason: string;
  recommendedAction: string;
  warningTime: string;
  acknowledged: boolean;
  acknowledgedAt?: string;
  breakRecorded: boolean;
  breakRecordedAt?: string;
  followUpStatus: 'pending' | 'resting' | 'completed';
}

export type SafetyAlertCategory =
  | 'sensor_issue'
  | 'physiological_change'
  | 'wellbeing_support'
  | 'missed_checkin'
  | 'caregiver_followup';

export interface SafetyContact {
  id: string;
  name: string;
  relation: string;
  role: 'caregiver' | 'trusted_contact' | 'emergency';
  channel: 'Portal & Digest' | 'Telegram Bot' | 'Email (Resend)' | 'Phone';
  contactValue: string;
  notifyOnCategories: SafetyAlertCategory[];
  consentVerified: boolean;
  addedAt: string;
}

export interface SafetyAlertRecord {
  id: string;
  category: SafetyAlertCategory;
  severity: 'advisory' | 'attention' | 'priority';
  title: string;
  description: string;
  createdAt: string;
  source: LiveTelemetrySource | 'user_checkin' | 'system_rule';
  requiresHumanConfirmation: boolean;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  followUpNote?: string;
}

export interface UnifiedPredictiveObservation {
  id: string;
  generatedAt: string;
  title: string;
  category: SafetyAlertCategory;
  measuredObservations: string[];
  inferredPatterns: string[];
  recommendedActions: string[];
  confidenceNote: string;
}

export interface ConsentRecord {
  id: string;
  scope: 'camera_rppg' | 'caregiver_sharing' | 'wellbeing_trends';
  granted: boolean;
  updatedAt: string;
  retentionPolicy: string;
}

export interface SmartAlertThresholds {
  enabled: boolean;
  notifyCaregivers: boolean;
  heartRateAboveBaselineBpm: number;
  heartRateBelowBaselineBpm: number;
  heartRateMaxBpm: number;
  heartRateMinBpm: number;
  spo2DropBelowBaselinePct: number;
  spo2MinPct: number;
  cooldownMinutes: number;
  updatedAt: string;
}

export type ChartAnnotationCategory =
  | 'exercise'
  | 'stress'
  | 'sleep'
  | 'medication'
  | 'recovery'
  | 'other';

export interface ChartAnnotation {
  id: string;
  timestamp: string;
  dateKey: string;
  metric: MetricKey | 'all';
  category: ChartAnnotationCategory;
  note: string;
  createdAt: string;
  createdBy: string;
}

export interface RealtimeDeviationEvent {
  id: string;
  triggeredAt: string;
  metric: 'heartRate' | 'spo2';
  metricLabel: string;
  observedValue: number;
  baselineMean: number | null;
  deltaText: string;
  thresholdRuleText: string;
  severity: 'attention' | 'priority';
  title: string;
  plainEnglishReason: string;
  caregiverNotified: boolean;
  notifiedRecipients: string[];
  acknowledged: boolean;
  alertId?: string;
}

export type SymptomSeverity = 1 | 2 | 3 | 4 | 5;

export interface SymptomLog {
  id: string;
  timestamp: string;
  dateKey: string;
  symptom: string;
  severity: SymptomSeverity;
  biometricContext?: {
    heartRate?: number;
    spo2?: number;
    sleepHours?: number;
    steps?: number;
  };
  activityContext?: string;
  note?: string;
  createdAt: string;
  createdBy: string;
}




