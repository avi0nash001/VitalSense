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
  });

  assert.equal(window.memberName, 'Elena Rostova');
  assert.equal(window.dayCount, 7);
  assert.ok(window.heartRate.avg !== null);
  assert.ok(window.spo2.avg !== null);
  assert.ok(window.sleepHours.avg !== null);
  assert.ok(window.steps.avg !== null);
  assert.ok((window.heartRate.deltaFromBaseline ?? 0) > 2);
});

test('formatWeeklyReportForSharing formats subject, highlights, caregiver note, and disclaimer cleanly', () => {
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
    suggestedCaregiverNote: 'Check in gently by phone and encourage extra rest.',
    disclaimer: 'Informational wearable summary only — not a medical diagnosis.',
  });

  assert.match(formatted, /Subject: Weekly Health Check-In for Elena/);
  assert.match(formatted, /• Heart rate averaged 66\.2 bpm/);
  assert.match(formatted, /Caregiver note: Check in gently/);
  assert.match(formatted, /not a medical diagnosis/);
});
