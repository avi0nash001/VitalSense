import test from 'node:test';
import assert from 'node:assert/strict';
import { HERO_SLIDE_INTERVAL_MS } from '../landing/heroCarouselConfig';
import { THEME_DEFINITIONS } from '../../theme/themes';
import {
  buildGlassChartTheme,
  buildStreamingWavePath,
  getStreamingCycleSeconds,
  STREAMING_CYCLE_MS,
  STREAMING_CYCLE_SECONDS,
} from './streamingChartUtils';

test('streaming cycle matches hero slide interval timing', () => {
  assert.equal(STREAMING_CYCLE_MS, HERO_SLIDE_INTERVAL_MS);
  assert.equal(STREAMING_CYCLE_SECONDS, HERO_SLIDE_INTERVAL_MS / 1000);
  assert.equal(getStreamingCycleSeconds(), 2.5);
  assert.equal(getStreamingCycleSeconds(2), 5);
  assert.equal(getStreamingCycleSeconds(-1), 2.5);
});

test('buildStreamingWavePath generates a closed, seamless repeating SVG path', () => {
  const width = 400;
  const height = 100;
  const path = buildStreamingWavePath(width, height, 55, 10, 2, 40);

  assert.ok(path.startsWith('M 0.0 '));
  assert.ok(path.endsWith(`L 800.0 ${height.toFixed(1)} L 0.0 ${height.toFixed(1)} Z`));

  const firstMatch = path.match(/^M 0\.0 ([0-9.]+)/);
  const midMatch = path.match(/L 400\.0 ([0-9.]+)/);
  const endMatch = path.match(/L 800\.0 ([0-9.]+) L 800\.0/);
  assert.ok(firstMatch && midMatch && endMatch);

  const yStart = Number(firstMatch[1]);
  const yMid = Number(midMatch[1]);
  const yEnd = Number(endMatch[1]);
  assert.ok(Math.abs(yStart - yMid) < 0.2);
  assert.ok(Math.abs(yStart - yEnd) < 0.2);
});

test('buildGlassChartTheme provides high-contrast monospace tick styles for light and dark themes', () => {
  const dose = buildGlassChartTheme(THEME_DEFINITIONS.dose.tokens);
  const vantage = buildGlassChartTheme(THEME_DEFINITIONS.vantage.tokens, '#34d399');

  assert.equal(dose.tickStyle.fontSize, 12);
  assert.equal(dose.tickStyle.fontFamily, 'IBM Plex Mono, monospace');
  assert.equal(dose.strokeColor, '#4F46E5');

  assert.equal(vantage.strokeColor, '#34d399');
  assert.equal(vantage.tickColor, THEME_DEFINITIONS.vantage.tokens['--vs-text-secondary']);
});
