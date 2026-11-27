import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatAnnotationSummary,
  inferAnnotationCategory,
  matchAnnotationsForPoint,
  toAnnotationDateKey,
} from './chartAnnotations.ts';
import type { ChartAnnotation } from './types.ts';

test('toAnnotationDateKey normalizes ISO timestamps to YYYY-MM-DD', () => {
  assert.equal(toAnnotationDateKey('2026-11-20T07:15:00.000Z'), '2026-11-20');
  assert.equal(toAnnotationDateKey('2026-11-20'), '2026-11-20');
});

test('inferAnnotationCategory maps common context labels cleanly', () => {
  assert.equal(inferAnnotationCategory('Afternoon exercise walk'), 'exercise');
  assert.equal(inferAnnotationCategory('Stressful meeting at work'), 'stress');
  assert.equal(inferAnnotationCategory('Poor sleep last night'), 'sleep');
  assert.equal(inferAnnotationCategory('Started new medication'), 'medication');
});

test('matchAnnotationsForPoint filters by dateKey and metric scope', () => {
  const annotations: ChartAnnotation[] = [
    {
      id: 'ann_1',
      timestamp: '2026-11-20T07:15:00.000Z',
      dateKey: '2026-11-20',
      metric: 'heartRate',
      category: 'stress',
      note: 'Stressful meeting',
      createdAt: '2026-11-20T12:00:00.000Z',
      createdBy: 'Elena Vance',
    },
    {
      id: 'ann_2',
      timestamp: '2026-11-20T07:15:00.000Z',
      dateKey: '2026-11-20',
      metric: 'all',
      category: 'exercise',
      note: 'Evening brisk walk',
      createdAt: '2026-11-20T18:00:00.000Z',
      createdBy: 'Elena Vance',
    },
    {
      id: 'ann_3',
      timestamp: '2026-11-18T07:15:00.000Z',
      dateKey: '2026-11-18',
      metric: 'spo2',
      category: 'sleep',
      note: 'Restless sleep',
      createdAt: '2026-11-18T08:00:00.000Z',
      createdBy: 'Elena Vance',
    },
  ];

  const hrMatched = matchAnnotationsForPoint({
    annotations,
    timestamp: '2026-11-20T09:00:00.000Z',
    metric: 'heartRate',
  });
  assert.equal(hrMatched.length, 2);
  assert.equal(formatAnnotationSummary(hrMatched), 'Stressful meeting · Evening brisk walk');

  const spo2Matched = matchAnnotationsForPoint({
    annotations,
    timestamp: '2026-11-20T09:00:00.000Z',
    metric: 'spo2',
  });
  assert.equal(spo2Matched.length, 1);
  assert.equal(spo2Matched[0].note, 'Evening brisk walk');
});
