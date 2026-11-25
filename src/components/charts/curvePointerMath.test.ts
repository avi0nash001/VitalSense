import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStationaryWaveformSeries,
  clampProgress01,
  computePointerSweepProgress,
  computePulseMarkerNodes,
  computeRelativeProgressFromX,
  findPathLengthAtX,
  formatPointTimestamp,
  interpolateSeriesAtProgress,
  sampleArrayAtProgress,
} from './curvePointerMath';

test('computePointerSweepProgress loops cleanly inside [0, 1)', () => {
  assert.equal(computePointerSweepProgress(0, 4000), 0);
  assert.equal(computePointerSweepProgress(2000, 4000), 0.5);
  assert.equal(computePointerSweepProgress(4000, 4000), 0);
});

test('computeRelativeProgressFromX maps and clamps pointer coordinates safely', () => {
  assert.equal(clampProgress01(-0.2), 0);
  assert.equal(clampProgress01(1.4), 1);
  assert.equal(computeRelativeProgressFromX(150, 100, 200), 0.25);
  assert.equal(computeRelativeProgressFromX(50, 100, 200), 0);
  assert.equal(computeRelativeProgressFromX(450, 100, 200), 1);
});

test('buildStationaryWaveformSeries produces deterministic fixed wave and samples smoothly', () => {
  const waveA = buildStationaryWaveformSeries(120, 3, 68);
  const waveB = buildStationaryWaveformSeries(120, 3, 68);
  assert.equal(waveA.length, 120);
  assert.deepEqual(waveA, waveB);

  const mid = sampleArrayAtProgress([0, 10, 20], 0.25);
  assert.equal(mid, 5);
});

test('findPathLengthAtX locates exact Y along a curve for a given X coordinate', () => {
  const mockPath = {
    getTotalLength: () => 100,
    getPointAtLength: (len: number) => ({ x: len * 2, y: 50 + len * 0.5 }),
  };

  const found = findPathLengthAtX(mockPath, 100);
  assert.ok(found);
  assert.ok(Math.abs(found.x - 100) < 0.5);
  assert.ok(Math.abs(found.y - 75) < 0.25);
});

test('interpolateSeriesAtProgress linearly interpolates primary, secondary SpO2, and timestamps', () => {
  const points = [
    {
      label: 'Nov 17',
      timestamp: '2026-11-17T08:00:00.000Z',
      value: 62.0,
      secondaryValue: 98.0,
      quality: 94,
    },
    {
      label: 'Nov 18',
      timestamp: '2026-11-18T08:00:00.000Z',
      value: 70.0,
      secondaryValue: 97.0,
      quality: 96,
    },
  ];

  const mid = interpolateSeriesAtProgress(points, 0.5, 1, 1);
  assert.ok(mid);
  assert.equal(mid.value, 66.0);
  assert.equal(mid.secondaryValue, 97.5);
  assert.ok(mid.timestamp.includes('Nov'));

  assert.equal(formatPointTimestamp(undefined, 'Tue'), 'Tue');
});

test('computePulseMarkerNodes detects R-peak pulse nodes across stationary cardiac wave', () => {
  const wave = buildStationaryWaveformSeries(220, 3.5, 69.7);
  const nodes = computePulseMarkerNodes(wave, 69.7, Date.UTC(2026, 10, 25, 8, 0, 0));
  assert.ok(nodes.length >= 3);
  assert.equal(nodes[0].beatNumber, 1);
  assert.ok(nodes[0].progress01 >= 0 && nodes[0].progress01 <= 1);
  assert.ok(nodes[0].amplitude > 0.38);
});

