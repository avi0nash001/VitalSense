import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildUnifiedPredictiveObservations,
  detectCrisisLanguage,
  evaluateRestRecommendation,
  evaluateRppgSamples,
  summarizeWellbeingTrends,
} from './intelligenceEngine.ts';
import type { WellbeingCheckin } from './types.ts';

test('evaluateRppgSamples rejects low light or excessive motion without fabricating heart rate', () => {
  const fps = 30;
  const series = Array.from({ length: 120 }, (_, i) => 120 + Math.sin((2 * Math.PI * 1.15 * i) / fps) * 2.5);

  const lowLight = evaluateRppgSamples({
    greenChannelSeries: series,
    fps,
    meanLuminance: 32,
    motionDelta: 2,
  });
  assert.equal(lowLight.passedQualityCheck, false);
  assert.equal(lowLight.estimatedHeartRate, null);

  const highMotion = evaluateRppgSamples({
    greenChannelSeries: series,
    fps,
    meanLuminance: 130,
    motionDelta: 24,
  });
  assert.equal(highMotion.passedQualityCheck, false);
  assert.equal(highMotion.estimatedHeartRate, null);
});

test('evaluateRppgSamples estimates periodic ~72 BPM signal accurately when quality passes', () => {
  const fps = 30;
  // 1.2 Hz = 72 BPM
  const series = Array.from({ length: 180 }, (_, i) => 128 + Math.sin((2 * Math.PI * 1.2 * i) / fps) * 3.0);

  const result = evaluateRppgSamples({
    greenChannelSeries: series,
    fps,
    meanLuminance: 135,
    motionDelta: 1.5,
  });
  assert.equal(result.passedQualityCheck, true);
  assert.ok(result.estimatedHeartRate !== null);
  assert.ok(Math.abs((result.estimatedHeartRate ?? 0) - 72) <= 2);
});

test('evaluateRestRecommendation suggests rest calmly when sleep is short or check-in shows tiredness', () => {
  const rec = evaluateRestRecommendation({
    recentSleepHours: 5.8,
    recentCheckin: {
      id: 'w_sleep',
      timestamp: '2026-11-22T08:00:00Z',
      mood: 'tired',
      sleepQuality: 2,
      energyLevel: 2,
      socialConnectedness: 'connected',
      wantsToTalk: false,
      breakReminderRequested: true,
    },
  });
  assert.ok(rec !== null);
  assert.equal(rec?.source, 'combined');
  assert.equal(rec?.breakRecorded, false);
  assert.ok(rec?.observations.some((obs) => obs.includes('5.8 hours')));

  const noneNeeded = evaluateRestRecommendation({
    recentSleepHours: 7.8,
    recentCheckin: null,
  });
  assert.equal(noneNeeded, null);
});

test('summarizeWellbeingTrends uses neutral supportive language and detects crisis phrases', () => {
  const checkins: WellbeingCheckin[] = [
    {
      id: 'w1',
      timestamp: '2026-11-22T09:00:00Z',
      mood: 'low',
      sleepQuality: 2,
      energyLevel: 2,
      socialConnectedness: 'isolated',
      wantsToTalk: true,
      breakReminderRequested: false,
    },
    {
      id: 'w2',
      timestamp: '2026-11-21T09:00:00Z',
      mood: 'tired',
      sleepQuality: 2,
      energyLevel: 2,
      socialConnectedness: 'somewhat_isolated',
      wantsToTalk: false,
      breakReminderRequested: true,
    },
  ];
  const summary = summarizeWellbeingTrends(checkins);
  assert.equal(summary.connectednessPattern, 'less_connected');
  assert.equal(summary.suggestTrustedReachOut, true);
  assert.equal(summary.neutralObservation.toLowerCase().includes('depressed'), false);
  assert.equal(detectCrisisLanguage('I feel tired today'), false);
  assert.equal(detectCrisisLanguage('I do not want to live anymore'), true);
});

test('buildUnifiedPredictiveObservations strictly separates measured, inferred, and recommended sections', () => {
  const unified = buildUnifiedPredictiveObservations({
    timelineEvents: [],
    wellbeingCheckins: [
      {
        id: 'w1',
        timestamp: '2026-11-22T09:00:00Z',
        mood: 'tired',
        sleepQuality: 2,
        energyLevel: 2,
        socialConnectedness: 'isolated',
        wantsToTalk: true,
        breakReminderRequested: true,
      },
      {
        id: 'w2',
        timestamp: '2026-11-21T09:00:00Z',
        mood: 'low',
        sleepQuality: 2,
        energyLevel: 2,
        socialConnectedness: 'isolated',
        wantsToTalk: false,
        breakReminderRequested: false,
      },
    ],
    safetyAlerts: [],
  });
  assert.ok(unified.length >= 1);
  assert.ok(unified[0].measuredObservations.length >= 1);
  assert.ok(unified[0].inferredPatterns.length >= 1);
  assert.ok(unified[0].recommendedActions.length >= 1);
});
