import type {
  AIInsight,
  AlertRecord,
  LatestMetricSnapshot,
  MetricBaseline,
  MetricKey,
  TimelineEvent,
  VitalReading,
} from './types';

export type DemoPersonaId = 'elena' | 'arjun' | 'maya';

export interface DemoTimelineStep {
  day: string;
  title: string;
  readingText: string;
  detail: string;
  state: 'normal' | 'first_shift' | 'continuing' | 'detected' | 'alert';
}

export interface DemoPersonaProfile {
  id: DemoPersonaId;
  name: string;
  ageLabel: string;
  avatarUrl: string;
  deviceName: string;
  demoTag: string;
  summaryHeadline: string;
  dataQualityLabel: string;
  dataQualityPct: number;
  dailyActivitySteps: number;
  sleepHours: number;
  baselineSummary: {
    overallPct: number;
    statusLabel: string;
    establishedCount: number;
    totalMetrics: number;
    coverageDaysMax: number;
    totalReadings: number;
  };
  baselines: Record<MetricKey, MetricBaseline>;
  latestSnapshots: LatestMetricSnapshot[];
  readings: VitalReading[];
  recentChanges: TimelineEvent[];
  recentAlerts: AlertRecord[];
  recentInsights: AIInsight[];
  firstDetectedSteps: DemoTimelineStep[];
}

function buildDailyReadings(
  prefix: string,
  hrValues: number[],
  spo2Base: number,
  tempBase: number,
  respBase: number,
  hrvBase: number,
  sleepBase: number,
  stepsBase: number
): VitalReading[] {
  const start = new Date('2026-11-05T07:00:00Z').getTime();
  return hrValues.map((hr, idx) => {
    const ts = new Date(start + idx * 86_400_000).toISOString();
    const shift = hr - hrValues[0];
    const wave = Math.sin(idx * 1.15);
    const sleepDelta = shift > 3 ? -0.6 : wave * 0.25;
    const stepsDelta = shift > 3 ? -1150 : Math.round(wave * 480);
    return {
      id: `${prefix}-r-${idx + 1}`,
      timestamp: ts,
      source: 'baseline_demo',
      qualityScore: idx === hrValues.length - 1 ? 94 : 96,
      heartRate: Number(hr.toFixed(1)),
      spo2: Number((spo2Base - (shift > 3 ? 0.3 : 0)).toFixed(1)),
      temperature: Number((tempBase + (shift > 3 ? 0.25 : 0)).toFixed(2)),
      respiratoryRate: Number((respBase + (shift > 3 ? 1.1 : 0)).toFixed(1)),
      hrv: Number((hrvBase - (shift > 3 ? 6.2 : 0)).toFixed(1)),
      sleepHours: Number(Math.max(4.5, sleepBase + sleepDelta).toFixed(1)),
      steps: Math.max(1500, Math.round(stepsBase + stepsDelta)),
    };
  });
}

function makeBaseline(
  metric: MetricKey,
  label: string,
  unit: string,
  mean: number,
  stdDev: number
): MetricBaseline {
  return {
    metric,
    label,
    unit,
    mean,
    stdDev,
    min: Number((mean - stdDev * 1.4).toFixed(2)),
    max: Number((mean + stdDev * 1.4).toFixed(2)),
    readingCount: 14,
    coverageDays: 14,
    targetDays: 14,
    progressPct: 100,
    confidenceStatus: 'established',
    lastUpdated: '2026-11-18T07:00:00Z',
  };
}

export const DEMO_PERSONAS: Record<DemoPersonaId, DemoPersonaProfile> = {
  elena: {
    id: 'elena',
    name: 'Elena Rostova',
    ageLabel: 'Age 46 · Wearable Demo Profile',
    avatarUrl: '/src/assets/images/hero_wearable_portrait_1795451859950.jpg',
    deviceName: 'Oura Ring & Wrist Sensor (Demo)',
    demoTag: 'Demonstration Profile · Sample Data',
    summaryHeadline:
      'Resting heart rate has stayed higher than Elena’s usual range for three days.',
    dataQualityLabel: 'Good coverage',
    dataQualityPct: 94,
    dailyActivitySteps: 6420,
    sleepHours: 6.8,
    baselineSummary: {
      overallPct: 100,
      statusLabel: 'Personal baseline ready',
      establishedCount: 5,
      totalMetrics: 5,
      coverageDaysMax: 17,
      totalReadings: 17,
    },
    baselines: {
      heartRate: makeBaseline('heartRate', 'Resting Heart Rate', 'bpm', 62.9, 2.1),
      spo2: makeBaseline('spo2', 'Blood Oxygen (SpO₂)', '%', 97.9, 0.4),
      temperature: makeBaseline('temperature', 'Skin Temperature', '°C', 36.63, 0.14),
      respiratoryRate: makeBaseline('respiratoryRate', 'Breathing Rate', 'br/min', 14.5, 0.6),
      hrv: makeBaseline('hrv', 'Heart Rate Variability', 'ms', 50.9, 3.8),
    },
    latestSnapshots: [
      {
        metric: 'heartRate',
        label: 'Resting Heart Rate',
        unit: 'bpm',
        latestValue: 69.7,
        latestTimestamp: '2026-11-21T07:00:00Z',
        baselineMean: 62.9,
        deltaFromBaseline: 6.8,
        deltaPct: 10.8,
        trendStatus: 'upward_shift',
        trendSummary: '+6.8 bpm above personal baseline across 3 days',
        qualityScore: 94,
        qualityLabel: 'High',
        source: 'baseline_demo',
      },
      {
        metric: 'spo2',
        label: 'Blood Oxygen (SpO₂)',
        unit: '%',
        latestValue: 97.6,
        latestTimestamp: '2026-11-21T07:00:00Z',
        baselineMean: 97.9,
        deltaFromBaseline: -0.3,
        deltaPct: -0.3,
        trendStatus: 'within_baseline',
        trendSummary: 'Within personal normal range',
        qualityScore: 95,
        qualityLabel: 'High',
        source: 'baseline_demo',
      },
      {
        metric: 'temperature',
        label: 'Skin Temperature',
        unit: '°C',
        latestValue: 36.88,
        latestTimestamp: '2026-11-21T07:00:00Z',
        baselineMean: 36.63,
        deltaFromBaseline: 0.25,
        deltaPct: 0.7,
        trendStatus: 'upward_shift',
        trendSummary: 'Slightly warmer than personal normal range',
        qualityScore: 94,
        qualityLabel: 'High',
        source: 'baseline_demo',
      },
      {
        metric: 'respiratoryRate',
        label: 'Breathing Rate',
        unit: 'br/min',
        latestValue: 15.6,
        latestTimestamp: '2026-11-21T07:00:00Z',
        baselineMean: 14.5,
        deltaFromBaseline: 1.1,
        deltaPct: 7.6,
        trendStatus: 'within_baseline',
        trendSummary: 'Slightly higher but close to usual range',
        qualityScore: 93,
        qualityLabel: 'High',
        source: 'baseline_demo',
      },
      {
        metric: 'hrv',
        label: 'Heart Rate Variability',
        unit: 'ms',
        latestValue: 44.7,
        latestTimestamp: '2026-11-21T07:00:00Z',
        baselineMean: 50.9,
        deltaFromBaseline: -6.2,
        deltaPct: -12.2,
        trendStatus: 'downward_shift',
        trendSummary: 'Lower recovery score than personal average',
        qualityScore: 92,
        qualityLabel: 'High',
        source: 'baseline_demo',
      },
    ],
    readings: buildDailyReadings(
      'elena',
      [
        62.4, 63.1, 61.9, 63.5, 62.8, 63.0, 62.2, 63.4, 62.6, 63.1, 62.5, 63.2, 62.7, 62.9, 67.3,
        68.4, 69.7,
      ],
      97.9,
      36.63,
      14.5,
      50.9,
      7.4,
      7550
    ),
    recentChanges: [
      {
        id: 'elena-evt-1',
        firstDetectedAt: '2026-11-19T07:00:00Z',
        lastObservedAt: '2026-11-21T07:00:00Z',
        metric: 'heartRate',
        metricLabel: 'Resting Heart Rate',
        unit: 'bpm',
        previousBaseline: 62.9,
        currentObserved: 69.7,
        deltaText: '+6.8 bpm',
        durationDays: 3,
        detectionMethod: '3-day sustained shift outside normal range',
        status: 'active',
        severity: 'moderate',
        source: 'baseline_demo',
        supportingEvidence: {
          sampleCount: 3,
          consistencyPct: 100,
          zScore: 2.9,
          dataQualityAvg: 94,
          summary:
            'Resting heart rate remained above Elena’s personal baseline across three consecutive days.',
          progressionPoints: [
            { date: '2026-11-18', observed: 62.9, baseline: 62.9 },
            { date: '2026-11-19', observed: 67.3, baseline: 62.9 },
            { date: '2026-11-20', observed: 68.4, baseline: 62.9 },
            { date: '2026-11-21', observed: 69.7, baseline: 62.9 },
          ],
        },
        aiExplanationId: 'elena-ins-1',
        alertId: 'elena-alert-1',
        caregiverAck: {
          acknowledged: true,
          acknowledgedBy: 'Sarah Vance',
          acknowledgedAt: '2026-11-21T08:14:00Z',
          followUpNote: 'Checked in with Elena; encouraging rest and hydration.',
          followUpStatus: 'completed',
        },
      },
    ],
    recentAlerts: [
      {
        id: 'elena-alert-1',
        title: 'Unusual Heart Rate Pattern',
        severity: 'attention',
        status: 'acknowledged',
        detectedAt: '2026-11-21T07:00:00Z',
        metric: 'heartRate',
        metricLabel: 'Resting Heart Rate',
        evidenceSummary:
          '69.7 bpm vs 62.9 bpm personal baseline across 3 consecutive days (Good coverage).',
        timelineEventId: 'elena-evt-1',
        source: 'baseline_demo',
        acknowledgement: {
          acknowledged: true,
          by: 'Sarah Vance',
          at: '2026-11-21T08:14:00Z',
        },
        notifications: [
          {
            id: 'elena-notif-1',
            recipient: 'Sarah Vance',
            channel: 'Portal & Digest',
            sentAt: '2026-11-21T07:02:00Z',
            status: 'delivered',
          },
        ],
        followUp: {
          status: 'completed',
          note: 'Checked in this morning.',
          updatedAt: '2026-11-21T08:14:00Z',
          updatedBy: 'Sarah Vance',
        },
      },
    ],
    recentInsights: [
      {
        id: 'elena-ins-1',
        title: 'Sustained 3-day heart rate elevation above personal pattern',
        createdAt: '2026-11-21T07:02:00Z',
        metric: 'heartRate',
        metricLabel: 'Resting Heart Rate',
        whatChanged:
          'Recent resting heart rate averaged 69.7 bpm compared with Elena’s personal baseline of 62.9 bpm.',
        supportingMeasurements: ['Sleep dipped slightly to 6.8 hrs', 'HRV eased by 6.2 ms'],
        baselineComparison: '+6.8 bpm higher than her normal 14-day pattern.',
        durationAndTrend: 'Continued across 3 consecutive days (Tuesday to Thursday).',
        timelineEventId: 'elena-evt-1',
        source: 'baseline_demo',
        geminiAnalysis: {
          generatedAt: '2026-11-21T07:02:00Z',
          model: 'demo-summary',
          summary:
            'Elena’s resting heart rate stayed around 69.7 bpm for three days in a row—nearly 7 bpm higher than her usual 62.9 bpm. Data coverage is good (94%).',
          patternExplanation:
            'Gradual three-day upward shift paired with slightly shorter sleep.',
          nonDiagnosticNextSteps: [
            'Prioritise rest and steady hydration today',
            'Share this 3-day timeline with a healthcare professional if the change continues',
          ],
          clinicianQuestions: ['Would you like to review this 3-day resting heart rate shift?'],
          disclaimer: 'Monitoring pattern only — not a medical diagnosis.',
        },
      },
    ],
    firstDetectedSteps: [
      {
        day: 'Monday',
        title: 'Normal pattern.',
        readingText: '62.9 bpm',
        detail: 'Matched Elena’s usual 14-day resting range.',
        state: 'normal',
      },
      {
        day: 'Tuesday',
        title: 'First unusual reading.',
        readingText: '67.3 bpm',
        detail: 'Rose above her usual upper range for the first time.',
        state: 'first_shift',
      },
      {
        day: 'Wednesday',
        title: 'Deviation continued.',
        readingText: '68.4 bpm',
        detail: 'Stayed elevated for a second day alongside shorter sleep.',
        state: 'continuing',
      },
      {
        day: 'Thursday',
        title: 'Sustained change detected.',
        readingText: '69.7 bpm',
        detail: 'Three consecutive days outside her normal pattern confirmed.',
        state: 'detected',
      },
      {
        day: 'Thursday · 07:02',
        title: 'Alert generated.',
        readingText: 'Summary ready',
        detail: 'Plain-English alert shared with authorised caregiver Sarah Vance.',
        state: 'alert',
      },
    ],
  },

  arjun: {
    id: 'arjun',
    name: 'Arjun Patel',
    ageLabel: 'Age 38 · Steady Runner Demo Profile',
    avatarUrl: '/src/assets/images/portrait_baseline_man_1795455652181.jpg',
    deviceName: 'Garmin Watch Sync (Demo)',
    demoTag: 'Demonstration Profile · Steady Baseline',
    summaryHeadline:
      'All tracked readings remain calm and inside Arjun’s normal personal range.',
    dataQualityLabel: 'Good coverage',
    dataQualityPct: 97,
    dailyActivitySteps: 9840,
    sleepHours: 7.7,
    baselineSummary: {
      overallPct: 100,
      statusLabel: 'Personal baseline ready',
      establishedCount: 5,
      totalMetrics: 5,
      coverageDaysMax: 17,
      totalReadings: 17,
    },
    baselines: {
      heartRate: makeBaseline('heartRate', 'Resting Heart Rate', 'bpm', 54.2, 1.8),
      spo2: makeBaseline('spo2', 'Blood Oxygen (SpO₂)', '%', 98.4, 0.3),
      temperature: makeBaseline('temperature', 'Skin Temperature', '°C', 36.48, 0.12),
      respiratoryRate: makeBaseline('respiratoryRate', 'Breathing Rate', 'br/min', 13.6, 0.5),
      hrv: makeBaseline('hrv', 'Heart Rate Variability', 'ms', 68.4, 4.1),
    },
    latestSnapshots: [
      {
        metric: 'heartRate',
        label: 'Resting Heart Rate',
        unit: 'bpm',
        latestValue: 54.6,
        latestTimestamp: '2026-11-21T07:00:00Z',
        baselineMean: 54.2,
        deltaFromBaseline: 0.4,
        deltaPct: 0.7,
        trendStatus: 'within_baseline',
        trendSummary: 'Steady inside personal range',
        qualityScore: 97,
        qualityLabel: 'High',
        source: 'baseline_demo',
      },
      {
        metric: 'spo2',
        label: 'Blood Oxygen (SpO₂)',
        unit: '%',
        latestValue: 98.5,
        latestTimestamp: '2026-11-21T07:00:00Z',
        baselineMean: 98.4,
        deltaFromBaseline: 0.1,
        deltaPct: 0.1,
        trendStatus: 'within_baseline',
        trendSummary: 'Normal oxygen saturation',
        qualityScore: 98,
        qualityLabel: 'High',
        source: 'baseline_demo',
      },
      {
        metric: 'temperature',
        label: 'Skin Temperature',
        unit: '°C',
        latestValue: 36.5,
        latestTimestamp: '2026-11-21T07:00:00Z',
        baselineMean: 36.48,
        deltaFromBaseline: 0.02,
        deltaPct: 0.1,
        trendStatus: 'within_baseline',
        trendSummary: 'Steady overnight temperature',
        qualityScore: 96,
        qualityLabel: 'High',
        source: 'baseline_demo',
      },
      {
        metric: 'respiratoryRate',
        label: 'Breathing Rate',
        unit: 'br/min',
        latestValue: 13.7,
        latestTimestamp: '2026-11-21T07:00:00Z',
        baselineMean: 13.6,
        deltaFromBaseline: 0.1,
        deltaPct: 0.7,
        trendStatus: 'within_baseline',
        trendSummary: 'Consistent resting breathing',
        qualityScore: 97,
        qualityLabel: 'High',
        source: 'baseline_demo',
      },
      {
        metric: 'hrv',
        label: 'Heart Rate Variability',
        unit: 'ms',
        latestValue: 69.1,
        latestTimestamp: '2026-11-21T07:00:00Z',
        baselineMean: 68.4,
        deltaFromBaseline: 0.7,
        deltaPct: 1.0,
        trendStatus: 'within_baseline',
        trendSummary: 'Balanced recovery pattern',
        qualityScore: 96,
        qualityLabel: 'High',
        source: 'baseline_demo',
      },
    ],
    readings: buildDailyReadings(
      'arjun',
      [
        54.0, 54.8, 53.6, 54.4, 54.1, 55.0, 53.9, 54.5, 54.2, 53.8, 54.6, 54.0, 54.3, 54.2, 54.9,
        54.3, 54.6,
      ],
      98.4,
      36.48,
      13.6,
      68.4,
      7.7,
      9840
    ),
    recentChanges: [],
    recentAlerts: [],
    recentInsights: [
      {
        id: 'arjun-ins-1',
        title: 'Consistent recovery and steady personal baseline',
        createdAt: '2026-11-21T07:05:00Z',
        metric: 'heartRate',
        metricLabel: 'Resting Heart Rate',
        whatChanged:
          'No unusual multi-day shifts appeared in heart rate, sleep, or blood oxygen.',
        supportingMeasurements: ['7.7 hrs sleep', '9,840 daily steps'],
        baselineComparison:
          'Current resting heart rate (54.6 bpm) matches Arjun’s 54.2 bpm baseline.',
        durationAndTrend: 'Stable across the past 17 days.',
        timelineEventId: 'arjun-steady',
        source: 'baseline_demo',
        geminiAnalysis: {
          generatedAt: '2026-11-21T07:05:00Z',
          model: 'demo-summary',
          summary:
            'Arjun’s wearable patterns stayed steady this week. His 54.6 bpm resting heart rate sits comfortably within his personal normal range (54.2 ± 1.8 bpm), with 97% data coverage.',
          patternExplanation: 'Consistent overnight heart rate and recovery pattern.',
          nonDiagnosticNextSteps: ['Continue normal routine and wearable sync'],
          clinicianQuestions: [],
          disclaimer: 'Informational summary only — not medical advice.',
        },
      },
    ],
    firstDetectedSteps: [
      {
        day: 'Monday',
        title: 'Normal pattern.',
        readingText: '54.2 bpm',
        detail: 'Consistent with Arjun’s usual resting heart rate.',
        state: 'normal',
      },
      {
        day: 'Tuesday',
        title: 'Within normal range.',
        readingText: '54.9 bpm',
        detail: 'Natural day-to-day variation well inside his baseline.',
        state: 'normal',
      },
      {
        day: 'Wednesday',
        title: 'Within normal range.',
        readingText: '54.3 bpm',
        detail: 'Good sleep recovery of 7.6 hours overnight.',
        state: 'normal',
      },
      {
        day: 'Thursday',
        title: 'Steady pattern confirmed.',
        readingText: '54.6 bpm',
        detail: 'No sustained deviation detected across any channel.',
        state: 'normal',
      },
    ],
  },

  maya: {
    id: 'maya',
    name: 'Maya Lin',
    ageLabel: 'Age 64 · Senior Care Demo Profile',
    avatarUrl: '/src/assets/images/portrait_detection_senior_1795455652639.jpg',
    deviceName: 'Apple Watch Series (Demo)',
    demoTag: 'Demonstration Profile · Senior Monitoring',
    summaryHeadline:
      'Mild resting heart rate rise and lighter sleep observed across three days.',
    dataQualityLabel: 'Good coverage',
    dataQualityPct: 92,
    dailyActivitySteps: 4120,
    sleepHours: 6.1,
    baselineSummary: {
      overallPct: 100,
      statusLabel: 'Personal baseline ready',
      establishedCount: 5,
      totalMetrics: 5,
      coverageDaysMax: 17,
      totalReadings: 17,
    },
    baselines: {
      heartRate: makeBaseline('heartRate', 'Resting Heart Rate', 'bpm', 66.8, 2.0),
      spo2: makeBaseline('spo2', 'Blood Oxygen (SpO₂)', '%', 97.2, 0.5),
      temperature: makeBaseline('temperature', 'Skin Temperature', '°C', 36.55, 0.15),
      respiratoryRate: makeBaseline('respiratoryRate', 'Breathing Rate', 'br/min', 15.2, 0.6),
      hrv: makeBaseline('hrv', 'Heart Rate Variability', 'ms', 41.8, 3.1),
    },
    latestSnapshots: [
      {
        metric: 'heartRate',
        label: 'Resting Heart Rate',
        unit: 'bpm',
        latestValue: 72.4,
        latestTimestamp: '2026-11-21T07:00:00Z',
        baselineMean: 66.8,
        deltaFromBaseline: 5.6,
        deltaPct: 8.4,
        trendStatus: 'upward_shift',
        trendSummary: '+5.6 bpm above Maya’s personal baseline over 3 days',
        qualityScore: 92,
        qualityLabel: 'High',
        source: 'baseline_demo',
      },
      {
        metric: 'spo2',
        label: 'Blood Oxygen (SpO₂)',
        unit: '%',
        latestValue: 96.8,
        latestTimestamp: '2026-11-21T07:00:00Z',
        baselineMean: 97.2,
        deltaFromBaseline: -0.4,
        deltaPct: -0.4,
        trendStatus: 'within_baseline',
        trendSummary: 'Within Maya’s normal range',
        qualityScore: 93,
        qualityLabel: 'High',
        source: 'baseline_demo',
      },
      {
        metric: 'temperature',
        label: 'Skin Temperature',
        unit: '°C',
        latestValue: 36.8,
        latestTimestamp: '2026-11-21T07:00:00Z',
        baselineMean: 36.55,
        deltaFromBaseline: 0.25,
        deltaPct: 0.7,
        trendStatus: 'upward_shift',
        trendSummary: 'Slightly warmer than her usual trend',
        qualityScore: 91,
        qualityLabel: 'High',
        source: 'baseline_demo',
      },
      {
        metric: 'respiratoryRate',
        label: 'Breathing Rate',
        unit: 'br/min',
        latestValue: 16.3,
        latestTimestamp: '2026-11-21T07:00:00Z',
        baselineMean: 15.2,
        deltaFromBaseline: 1.1,
        deltaPct: 7.2,
        trendStatus: 'within_baseline',
        trendSummary: 'Mildly faster resting breathing',
        qualityScore: 92,
        qualityLabel: 'High',
        source: 'baseline_demo',
      },
      {
        metric: 'hrv',
        label: 'Heart Rate Variability',
        unit: 'ms',
        latestValue: 35.6,
        latestTimestamp: '2026-11-21T07:00:00Z',
        baselineMean: 41.8,
        deltaFromBaseline: -6.2,
        deltaPct: -14.8,
        trendStatus: 'downward_shift',
        trendSummary: 'Lower recovery variation for three nights',
        qualityScore: 91,
        qualityLabel: 'High',
        source: 'baseline_demo',
      },
    ],
    readings: buildDailyReadings(
      'maya',
      [
        66.4, 67.1, 66.2, 67.4, 66.5, 67.0, 66.1, 67.2, 66.9, 66.6, 67.3, 66.7, 66.5, 66.8, 70.9,
        71.6, 72.4,
      ],
      97.2,
      36.55,
      15.2,
      41.8,
      6.7,
      5250
    ),
    recentChanges: [
      {
        id: 'maya-evt-1',
        firstDetectedAt: '2026-11-19T07:00:00Z',
        lastObservedAt: '2026-11-21T07:00:00Z',
        metric: 'heartRate',
        metricLabel: 'Resting Heart Rate',
        unit: 'bpm',
        previousBaseline: 66.8,
        currentObserved: 72.4,
        deltaText: '+5.6 bpm',
        durationDays: 3,
        detectionMethod: '3-day sustained shift outside normal range',
        status: 'active',
        severity: 'moderate',
        source: 'baseline_demo',
        supportingEvidence: {
          sampleCount: 3,
          consistencyPct: 100,
          zScore: 2.8,
          dataQualityAvg: 92,
          summary:
            'Resting heart rate rose steadily above Maya’s 66.8 bpm baseline across three days.',
          progressionPoints: [
            { date: '2026-11-18', observed: 66.8, baseline: 66.8 },
            { date: '2026-11-19', observed: 70.9, baseline: 66.8 },
            { date: '2026-11-20', observed: 71.6, baseline: 66.8 },
            { date: '2026-11-21', observed: 72.4, baseline: 66.8 },
          ],
        },
        aiExplanationId: 'maya-ins-1',
        alertId: 'maya-alert-1',
        caregiverAck: {
          acknowledged: false,
          followUpStatus: 'pending',
        },
      },
    ],
    recentAlerts: [
      {
        id: 'maya-alert-1',
        title: 'Unusual Heart Rate Pattern',
        severity: 'attention',
        status: 'open',
        detectedAt: '2026-11-21T07:00:00Z',
        metric: 'heartRate',
        metricLabel: 'Resting Heart Rate',
        evidenceSummary:
          '72.4 bpm vs 66.8 bpm personal baseline across 3 consecutive days (Good coverage).',
        timelineEventId: 'maya-evt-1',
        source: 'baseline_demo',
        acknowledgement: {
          acknowledged: false,
        },
        notifications: [
          {
            id: 'maya-notif-1',
            recipient: 'Sarah Vance',
            channel: 'Portal & Digest',
            sentAt: '2026-11-21T07:03:00Z',
            status: 'delivered',
          },
        ],
        followUp: {
          status: 'none',
        },
      },
    ],
    recentInsights: [
      {
        id: 'maya-ins-1',
        title: 'Three-day heart rate rise paired with lighter sleep',
        createdAt: '2026-11-21T07:03:00Z',
        metric: 'heartRate',
        metricLabel: 'Resting Heart Rate',
        whatChanged:
          'Maya’s resting heart rate reached 72.4 bpm compared with her 66.8 bpm baseline.',
        supportingMeasurements: [
          'Sleep shortened to 6.1 hrs',
          'Activity lower at 4,120 steps',
        ],
        baselineComparison: '+5.6 bpm higher than her personal 14-day pattern.',
        durationAndTrend: 'Started Tuesday and continued through Thursday.',
        timelineEventId: 'maya-evt-1',
        source: 'baseline_demo',
        geminiAnalysis: {
          generatedAt: '2026-11-21T07:03:00Z',
          model: 'demo-summary',
          summary:
            'Maya’s resting heart rate has stayed roughly 5.6 bpm higher than her 66.8 bpm personal norm for three consecutive days, alongside shorter sleep (6.1 hrs). Coverage is good (92%).',
          patternExplanation: 'Sustained gentle elevation paired with lighter sleep.',
          nonDiagnosticNextSteps: [
            'Check in with Maya on rest, fluid intake, and how she feels today',
            'Consider mentioning this three-day pattern during a routine medical visit',
          ],
          clinicianQuestions: [
            'Share whether fatigue or poor sleep accompanied this three-day pattern.',
          ],
          disclaimer: 'Pattern notice only — not a medical diagnosis.',
        },
      },
    ],
    firstDetectedSteps: [
      {
        day: 'Monday',
        title: 'Normal pattern.',
        readingText: '66.8 bpm',
        detail: 'Resting rate and sleep duration matched Maya’s normal range.',
        state: 'normal',
      },
      {
        day: 'Tuesday',
        title: 'First unusual reading.',
        readingText: '70.9 bpm',
        detail: 'Morning resting rate stepped above her usual upper threshold.',
        state: 'first_shift',
      },
      {
        day: 'Wednesday',
        title: 'Deviation continued.',
        readingText: '71.6 bpm',
        detail: 'Higher resting rate continued with lighter sleep overnight.',
        state: 'continuing',
      },
      {
        day: 'Thursday',
        title: 'Sustained change detected.',
        readingText: '72.4 bpm',
        detail: 'Third consecutive day outside Maya’s baseline confirmed.',
        state: 'detected',
      },
      {
        day: 'Thursday · 07:03',
        title: 'Alert generated.',
        readingText: 'Awaiting check-in',
        detail: 'Caregiver summary prepared and awaiting confirmation.',
        state: 'alert',
      },
    ],
  },
};

export const DEMO_PERSONA_LIST: DemoPersonaProfile[] = [
  DEMO_PERSONAS.elena,
  DEMO_PERSONAS.arjun,
  DEMO_PERSONAS.maya,
];

export function getDemoPersona(id: string): DemoPersonaProfile {
  if (id === 'arjun' || id === 'maya' || id === 'elena') {
    return DEMO_PERSONAS[id];
  }
  return DEMO_PERSONAS.elena;
}
