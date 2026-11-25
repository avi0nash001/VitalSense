import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSmoothAreaPath,
  buildSmoothLinePath,
  buildStreamingSeries,
  sampleTrajectoryPoint,
} from './chartCurves';

test('buildSmoothLinePath returns empty string for empty points and valid cubic segments for series', () => {
  assert.equal(buildSmoothLinePath([]), '');
  const single = buildSmoothLinePath([{ x: 10, y: 20 }]);
  assert.equal(single, 'M 10.0 20.0');

  const path = buildSmoothLinePath([
    { x: 0, y: 50 },
    { x: 50, y: 30 },
    { x: 100, y: 40 },
    { x: 150, y: 20 },
  ]);
  assert.ok(path.startsWith('M 0.0 50.0'));
  assert.ok(path.includes(' C '));
  assert.ok(path.endsWith('150.0 20.0'));
});

test('buildSmoothAreaPath closes smoothly down to baselineY', () => {
  const area = buildSmoothAreaPath(
    [
      { x: 20, y: 40 },
      { x: 80, y: 20 },
      { x: 140, y: 35 },
    ],
    120
  );
  assert.ok(area.startsWith('M 20.0 40.0'));
  assert.ok(area.endsWith('L 140.0 120.0 L 20.0 120.0 Z'));
});

test('sampleTrajectoryPoint smoothly interpolates endpoints and midpoints along cubic trajectory', () => {
  const pts = [
    { x: 10, y: 80 },
    { x: 110, y: 40 },
    { x: 210, y: 20 },
  ];
  const start = sampleTrajectoryPoint(pts, 0);
  const end = sampleTrajectoryPoint(pts, 1);
  const mid = sampleTrajectoryPoint(pts, 0.5);
  assert.equal(Math.round(start.x), 10);
  assert.equal(Math.round(start.y), 80);
  assert.equal(Math.round(end.x), 210);
  assert.equal(Math.round(end.y), 20);
  assert.ok(mid.x > 10 && mid.x < 210);
  assert.ok(mid.y >= 20 && mid.y <= 80);
});

test('buildStreamingSeries stays anchored to input clinical readings across phases', () => {
  const anchors = [62.5, 63.0, 67.3, 69.7];
  const s1 = buildStreamingSeries(anchors, 0, 48, 0.25);
  const s2 = buildStreamingSeries(anchors, 1.8, 48, 0.25);
  assert.equal(s1.length, 48);
  assert.equal(s2.length, 48);
  assert.ok(Math.abs(s1[0] - anchors[0]) < 0.5);
  assert.ok(Math.abs(s1[s1.length - 1] - anchors[anchors.length - 1]) < 0.5);
  assert.notEqual(s1[12], s2[12]);
});
