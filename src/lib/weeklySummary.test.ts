import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSevenDayBiometricWindow,
  formatWeeklyReportForSharing,
} from './weeklySummary';
import { generateScenarioReadings } from './simulator';
import { computeBaselines } from './vitalsEngine';

test('buildSevenDayBiometricWindow extracts last 7 days and calculates averages vs baseline', () => {
  const readings = generateScenarioReadings('gradual_drift', '2026-11-21T07:15:00.000Z', 'baseline_demo');
  const baselines = computeBaselines(readings.slice(0, 14), 14);
  const window = buildSevenDayBiometricWindow({
    memberName: 'Elena Rostova',
    readings,
    baselines,
    alerts: [],
    symptoms: [
      {
        id: 'sym_1',
        timestamp: '2026-11-20T14:00:00.000Z',
        dateKey: '2026-11-20',
        symptom: 'Fatigue',
        severity: 3,
        activityContext: 'Afternoon workday',
        createdAt: '2026-11-20T14:00:00.000Z',
        createdBy: 'Elena Rostova',
      },
    ],
  });

  assert.equal(window.memberName, 'Elena Rostova');
  assert.equal(window.dayCount, 7);
  assert.ok(window.heartRate.avg !== null);
  assert.ok(window.spo2.avg !== null);
  assert.ok(window.sleepHours.avg !== null);
  assert.ok(window.steps.avg !== null);
  assert.ok((window.heartRate.deltaFromBaseline ?? 0) > 2);
  assert.equal(window.loggedSymptoms.length, 1);
  assert.equal(window.loggedSymptoms[0].symptom, 'Fatigue');
});

test('formatWeeklyReportForSharing formats subject, highlights, symptoms, caregiver note, and disclaimer cleanly', () => {
  const formatted = formatWeeklyReportForSharing({
    generatedAt: '2026-11-25T14:00:00.000Z',
    model: 'gemini-4-hydrogen',
    periodLabel: 'Nov 15 – Nov 21',
    subjectLine: 'Weekly Health Check-In for Elena',
    messageBody: 'Resting heart rate was slightly higher than usual over the past week.',
    keyHighlights: [
      'Heart rate averaged 66.2 bpm compared to 61.5 bpm usual.',
      'SpO2 stayed steady near 97.7%.',
    ],
    loggedSymptoms: [
      {
        dateKey: '2026-11-20',
        symptom: 'Dizziness',
        severity: 4,
        activityContext: 'Standing quickly',
      },
    ],
    suggestedCaregiverNote: 'Check in gently by phone and encourage extra rest.',
    disclaimer: 'Informational wearable summary only — not a medical diagnosis.',
  });

  assert.match(formatted, /Subject: Weekly Health Check-In for Elena/);
  assert.match(formatted, /• Heart rate averaged 66\.2 bpm/);
  assert.match(formatted, /Dizziness \(intensity 4\/5\)/);
  assert.match(formatted, /Caregiver note: Check in gently/);
  assert.match(formatted, /not a medical diagnosis/);
});
