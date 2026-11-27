import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDualAxisCorrelationSeries,
  findNearestBiometricContext,
  summarizeSymptomBiometricCorrelation,
} from './symptomCorrelation';
import type { ChartAnnotation, SymptomLog, VitalReading } from './types';

const SAMPLE_READINGS: VitalReading[] = [
  {
    id: 'r1',
    timestamp: '2026-11-17T07:15:00.000Z',
    source: 'baseline_demo',
    qualityScore: 95,
    heartRate: 62.5,
    spo2: 98.0,
    sleepHours: 7.4,
    steps: 7600,
  },
  {
    id: 'r2',
    timestamp: '2026-11-18T07:15:00.000Z',
    source: 'baseline_demo',
    qualityScore: 94,
    heartRate: 67.2,
    spo2: 97.6,
    sleepHours: 6.2,
    steps: 5400,
  },
  {
    id: 'r3',
    timestamp: '2026-11-19T07:15:00.000Z',
    source: 'baseline_demo',
    qualityScore: 93,
    heartRate: 70.4,
    spo2: 97.2,
    sleepHours: 5.9,
    steps: 4200,
  },
];

const SAMPLE_SYMPTOMS: SymptomLog[] = [
  {
    id: 'sym1',
    timestamp: '2026-11-18T14:20:00.000Z',
    dateKey: '2026-11-18',
    symptom: 'Fatigue',
    severity: 3,
    createdAt: '2026-11-18T14:20:00.000Z',
    createdBy: 'Elena Vance',
  },
  {
    id: 'sym2',
    timestamp: '2026-11-19T10:15:00.000Z',
    dateKey: '2026-11-19',
    symptom: 'Dizziness',
    severity: 4,
    createdAt: '2026-11-19T10:15:00.000Z',
    createdBy: 'Elena Vance',
  },
];

const SAMPLE_ANNOTATIONS: ChartAnnotation[] = [
  {
    id: 'ann1',
    timestamp: '2026-11-18T07:15:00.000Z',
    dateKey: '2026-11-18',
    metric: 'heartRate',
    category: 'stress',
    note: 'Late meeting',
    createdAt: '2026-11-18T18:00:00.000Z',
    createdBy: 'Elena Vance',
  },
];

test('buildDualAxisCorrelationSeries aligns biometric readings, symptoms, and context annotations by dateKey', () => {
  const series = buildDualAxisCorrelationSeries({
    readings: SAMPLE_READINGS,
    metric: 'heartRate',
    symptoms: SAMPLE_SYMPTOMS,
    annotations: SAMPLE_ANNOTATIONS,
  });

  assert.equal(series.length, 3);
  assert.equal(series[0].maxSymptomSeverity, 0);
  assert.equal(series[1].maxSymptomSeverity, 3);
  assert.equal(series[1].annotations.length, 1);
  assert.equal(series[2].maxSymptomSeverity, 4);
  assert.equal(series[2].metricValue, 70.4);
  assert.equal(series[2].steps, 4200);
});

test('summarizeSymptomBiometricCorrelation computes plain-English comparison between symptom and clear days', () => {
  const series = buildDualAxisCorrelationSeries({
    readings: SAMPLE_READINGS,
    metric: 'heartRate',
    symptoms: SAMPLE_SYMPTOMS,
    annotations: SAMPLE_ANNOTATIONS,
  });

  const summary = summarizeSymptomBiometricCorrelation(series, 'heartRate', 62.9);
  assert.equal(summary.symptomDayCount, 2);
  assert.equal(summary.totalSymptomsLogged, 2);
  assert.equal(summary.symptomDayAvg, 68.8);
  assert.equal(summary.symptomFreeDayAvg, 62.5);
  assert.equal(summary.deltaOnSymptomDays, 6.3);
  assert.match(summary.headline, /fatigue, dizziness/i);
});

test('findNearestBiometricContext extracts matching day readings for symptom snapshot', () => {
  const ctx = findNearestBiometricContext(SAMPLE_READINGS, '2026-11-18');
  assert.equal(ctx?.heartRate, 67.2);
  assert.equal(ctx?.spo2, 97.6);
  assert.equal(ctx?.sleepHours, 6.2);
  assert.equal(ctx?.steps, 5400);
});
