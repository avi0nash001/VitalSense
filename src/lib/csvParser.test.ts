import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWearableCsv } from './csvParser';
import { SAMPLE_WEARABLE_CSV } from './simulator';

test('parseWearableCsv parses valid wearable export rows accurately', () => {
  const result = parseWearableCsv(SAMPLE_WEARABLE_CSV);
  assert.equal(result.qualitySummary.totalRows, 8);
  assert.equal(result.qualitySummary.validCount, 8);
  assert.equal(result.qualitySummary.invalidCount, 0);
  assert.equal(result.qualitySummary.completenessPct, 100);
  assert.equal(result.validRows[0].source, 'real_csv');
});

test('parseWearableCsv flags implausible ranges and bad timestamps', () => {
  const badCsv = `timestamp,heart_rate,spo2,temperature
not-a-date,65,98,36.5
2026-11-15T07:00:00Z,310,98,36.5
2026-11-16T07:00:00Z,64,97.5,36.6`;
  const result = parseWearableCsv(badCsv);
  assert.equal(result.qualitySummary.totalRows, 3);
  assert.equal(result.qualitySummary.validCount, 1);
  assert.equal(result.qualitySummary.invalidCount, 2);
  assert.equal(result.invalidRows[0].rowNumber, 2);
  assert.equal(result.invalidRows[1].rowNumber, 3);
});
