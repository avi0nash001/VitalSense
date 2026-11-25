import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assessLatestMetrics,
  computeBaselines,
  detectGradualChanges,
} from './vitalsEngine';
import { generateScenarioReadings } from './simulator';

test('computeBaselines refuses to fabricate an established baseline with sparse data', () => {
  const sparse = generateScenarioReadings('stable').slice(0, 3);
  const baselines = computeBaselines(sparse, 14);
  assert.equal(baselines.heartRate.confidenceStatus, 'insufficient');
  assert.equal(baselines.heartRate.coverageDays, 3);
  assert.ok(baselines.heartRate.progressPct < 30);

  const snapshots = assessLatestMetrics(sparse, baselines);
  const hrSnapshot = snapshots.find((s) => s.metric === 'heartRate');
  assert.equal(hrSnapshot?.trendStatus, 'insufficient_baseline');
});

test('computeBaselines marks 14+ days as established', () => {
  const full = generateScenarioReadings('stable');
  const baselines = computeBaselines(full, 14);
  assert.equal(baselines.heartRate.confidenceStatus, 'established');
  assert.equal(baselines.heartRate.progressPct, 100);
  assert.ok(baselines.heartRate.mean !== null);
});

test('detectGradualChanges detects multi-day drift in gradual_drift scenario', () => {
  const drift = generateScenarioReadings('gradual_drift');
  const detected = detectGradualChanges(drift, 'balanced');
  assert.ok(detected.length >= 2, 'Expected at least 2 drifting metrics');
  const hrDrift = detected.find((d) => d.metric === 'heartRate');
  assert.ok(hrDrift, 'Expected heartRate drift to be detected');
  assert.ok(hrDrift.delta > 3.5);
  assert.ok(hrDrift.durationDays >= 5);
});

test('detectGradualChanges ignores single-night isolated anomaly', () => {
  const isolated = generateScenarioReadings('isolated_anomaly');
  const detected = detectGradualChanges(isolated, 'balanced');
  assert.equal(detected.length, 0);
});
