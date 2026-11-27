import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_SMART_ALERT_THRESHOLDS,
  evaluateRealtimeDeviation,
  sanitizeSmartAlertThresholds,
} from './smartAlertEngine.ts';

test('sanitizeSmartAlertThresholds clamps out-of-range settings safely', () => {
  const cleaned = sanitizeSmartAlertThresholds({
    enabled: true,
    heartRateAboveBaselineBpm: 999,
    heartRateBelowBaselineBpm: 1,
    spo2DropBelowBaselinePct: 25,
    spo2MinPct: 50,
    cooldownMinutes: 0,
  });

  assert.equal(cleaned.heartRateAboveBaselineBpm, 35);
  assert.equal(cleaned.heartRateBelowBaselineBpm, 4);
  assert.equal(cleaned.spo2DropBelowBaselinePct, 8);
  assert.equal(cleaned.spo2MinPct, 85);
  assert.equal(cleaned.cooldownMinutes, 1);
});

test('evaluateRealtimeDeviation detects heart rate and SpO2 threshold breaches in plain English', () => {
  const breaches = evaluateRealtimeDeviation({
    heartRate: 88,
    spo2: 92.5,
    timestamp: '2026-11-27T09:00:00.000Z',
    hrBaselineMean: 64,
    spo2BaselineMean: 97.8,
    thresholds: DEFAULT_SMART_ALERT_THRESHOLDS,
    existingAlerts: [],
  });

  assert.equal(breaches.length, 2);
  assert.equal(breaches[0].metric, 'heartRate');
  assert.equal(breaches[0].deltaText, '+24 bpm');
  assert.match(breaches[0].plainEnglishReason, /not a diagnosis/i);

  assert.equal(breaches[1].metric, 'spo2');
  assert.equal(breaches[1].severity, 'priority');
  assert.match(breaches[1].plainEnglishReason, /blood oxygen/i);
});

test('evaluateRealtimeDeviation respects cooldown window and disabled toggle', () => {
  const nowIso = '2026-11-27T09:05:00.000Z';
  const coolingBreaches = evaluateRealtimeDeviation({
    heartRate: 90,
    spo2: 98,
    timestamp: nowIso,
    hrBaselineMean: 64,
    spo2BaselineMean: 98,
    thresholds: DEFAULT_SMART_ALERT_THRESHOLDS,
    existingAlerts: [
      {
        metric: 'heartRate',
        detectedAt: '2026-11-27T09:00:00.000Z',
        status: 'open',
      },
    ],
  });

  assert.equal(coolingBreaches.length, 0);

  const disabledBreaches = evaluateRealtimeDeviation({
    heartRate: 110,
    spo2: 89,
    hrBaselineMean: 64,
    spo2BaselineMean: 98,
    thresholds: { ...DEFAULT_SMART_ALERT_THRESHOLDS, enabled: false },
  });
  assert.equal(disabledBreaches.length, 0);
});
