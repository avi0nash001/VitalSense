import test from 'node:test';
import assert from 'node:assert/strict';
import { buildThirtyDayCalibrationBand } from './baselineCalibration';
import { generateScenarioReadings } from './simulator';
import { computeBaselines } from './vitalsEngine';
import type { VitalReading } from './types';

test('buildThirtyDayCalibrationBand restricts history to trailing 30 days and flags above-range readings', () => {
  const oldReading: VitalReading = {
    id: 'old_45d',
    timestamp: '2026-10-01T07:00:00.000Z',
    source: 'real_csv',
    qualityScore: 95,
    heartRate: 110,
  };
  const recentReadings = generateScenarioReadings(
    'gradual_drift',
    '2026-11-21T07:15:00.000Z',
    'baseline_demo'
  );
  const baselines = computeBaselines(recentReadings.slice(0, 14), 14);

  const band = buildThirtyDayCalibrationBand({
    readings: [oldReading, ...recentReadings],
    metric: 'heartRate',
    mode: 'typical',
    fallbackBaseline: baselines.heartRate,
  });

  // Old 45-day spike (110 bpm) must be excluded from the 30-day observedMax
  assert.ok(band.observedMax !== null && band.observedMax < 80);
  assert.equal(band.dayCount, 21);
  assert.equal(band.currentStatus, 'above_range');
  assert.equal(band.statusLabel, 'Above 30-day range');
  assert.ok(band.bandStartPct < band.bandEndPct);
});

test('buildThirtyDayCalibrationBand supports full_range mode and liveCurrentValue override', () => {
  const readings = generateScenarioReadings(
    'stable',
    '2026-11-21T07:15:00.000Z',
    'baseline_demo'
  );

  const fullBand = buildThirtyDayCalibrationBand({
    readings,
    metric: 'heartRate',
    mode: 'full_range',
    liveCurrentValue: 61.5,
  });

  assert.equal(fullBand.activeLow, fullBand.observedMin);
  assert.equal(fullBand.activeHigh, fullBand.observedMax);
  assert.equal(fullBand.currentStatus, 'within_range');
  assert.equal(fullBand.statusLabel, 'Within 30-day range');
});
