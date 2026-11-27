import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildVoiceHealthContextPrompt,
  classifyMicrophoneError,
  computeRmsLevel,
  decodeBase64ToFloat32Pcm,
  downsampleFloat32To16k,
  encodePcm16ToBase64,
  PRIORITY_VOICE_LANGUAGES,
  upsertTranscriptTurn,
  VOICE_LANGUAGE_CONFIG,
  VOICE_STATE_COPY,
} from './voiceAssistant';
import type { ConsentSettings, VitalReading } from './types';

const BASE_CONSENT: ConsentSettings = {
  shareVitalTrends: true,
  shareBaselineProgress: true,
  shareTimelineDetails: true,
  shareAiInsights: true,
  notifyCaregiverOnAlerts: true,
};

const SAMPLE_READING: VitalReading = {
  id: 'vr_test_1',
  timestamp: '2026-11-21T07:15:00.000Z',
  heartRate: 69.7,
  spo2: 97.8,
  temperature: 36.8,
  hrv: 46.2,
  sleepHours: 6.6,
  steps: 6420,
  qualityScore: 96,
  source: 'baseline_demo',
};

test('VOICE_STATE_COPY defines exact plain-English status strings required for all states', () => {
  assert.equal(VOICE_STATE_COPY.idle.headline, 'Talk to VitalSense');
  assert.equal(VOICE_STATE_COPY.listening.headline, "I'm listening...");
  assert.equal(VOICE_STATE_COPY.processing.headline, 'Let me check that...');
  assert.equal(VOICE_STATE_COPY.error.headline, "Sorry, I couldn't hear you. Please try again.");
  assert.equal(VOICE_STATE_COPY.connection_lost.headline, 'Connection lost. Please try again.');
  assert.deepEqual(PRIORITY_VOICE_LANGUAGES, [
    'Kannada',
    'English',
    'Hindi',
    'Tamil',
    'Telugu',
    'Malayalam',
    'Marathi',
    'Bengali',
    'Gujarati',
  ]);
  assert.equal(VOICE_LANGUAGE_CONFIG.length, 9);
});

test('classifyMicrophoneError maps permission, missing hardware, and busy-device errors cleanly', () => {
  assert.ok(
    classifyMicrophoneError({ name: 'NotAllowedError', message: 'Permission denied' })
      .toLowerCase()
      .includes('blocked')
  );
  assert.ok(
    classifyMicrophoneError({ name: 'NotFoundError', message: 'Requested device not found' })
      .toLowerCase()
      .includes('no microphone')
  );
  assert.ok(
    classifyMicrophoneError({ name: 'NotReadableError', message: 'Could not start audio source' })
      .toLowerCase()
      .includes('busy')
  );
});

test('encodePcm16ToBase64 and decodeBase64ToFloat32Pcm round-trip 16-bit PCM accurately', () => {
  const input = new Float32Array([0, 0.5, -0.5, 0.99, -0.99]);
  const b64 = encodePcm16ToBase64(input);
  const output = decodeBase64ToFloat32Pcm(b64);
  assert.equal(output.length, input.length);
  for (let i = 0; i < input.length; i++) {
    assert.ok(Math.abs(output[i] - input[i]) < 0.002);
  }
});

test('downsampleFloat32To16k converts 48kHz audio down by 3x cleanly', () => {
  const input48k = new Float32Array(480);
  for (let i = 0; i < input48k.length; i++) {
    input48k[i] = 0.25;
  }
  const downsampled = downsampleFloat32To16k(input48k, 48000);
  assert.equal(downsampled.length, 160);
  assert.ok(Math.abs(downsampled[0] - 0.25) < 0.001);
});

test('computeRmsLevel returns bounded 0..1 audio amplitude', () => {
  assert.equal(computeRmsLevel(new Float32Array([0, 0, 0])), 0);
  const loud = computeRmsLevel(new Float32Array([0.8, -0.8, 0.8]));
  assert.ok(loud > 0.5 && loud <= 1);
});

test('buildVoiceHealthContextPrompt embeds live readings and enforces consent restrictions for caregivers', () => {
  const memberPrompt = buildVoiceHealthContextPrompt({
    memberName: 'Elena Vance',
    viewerRole: 'member',
    wearableDeviceName: 'PulseRing Gen 3',
    lastUpdated: '2026-11-21T07:15:00.000Z',
    consent: BASE_CONSENT,
    latestReading: SAMPLE_READING,
    recent7DayReadings: [SAMPLE_READING],
    baselines: null,
    timelineEvents: [],
    alerts: [],
    realtimeDeviations: [],
    symptomLogs: [],
    chartAnnotations: [],
  });
  assert.ok(memberPrompt.includes('69.7'));
  for (const lang of [
    'Kannada',
    'English',
    'Hindi',
    'Tamil',
    'Telugu',
    'Malayalam',
    'Marathi',
    'Bengali',
    'Gujarati',
  ]) {
    assert.ok(memberPrompt.includes(lang));
  }
  assert.ok(memberPrompt.includes('NEVER diagnose'));

  const restrictedCaregiverPrompt = buildVoiceHealthContextPrompt({
    memberName: 'Elena Vance',
    viewerRole: 'caregiver',
    wearableDeviceName: 'PulseRing Gen 3',
    lastUpdated: '2026-11-21T07:15:00.000Z',
    consent: { ...BASE_CONSENT, shareVitalTrends: false, shareBaselineProgress: false },
    latestReading: SAMPLE_READING,
    recent7DayReadings: [SAMPLE_READING],
    baselines: null,
    timelineEvents: [],
    alerts: [],
    realtimeDeviations: [],
    symptomLogs: [],
    chartAnnotations: [],
  });
  assert.ok(!restrictedCaregiverPrompt.includes('69.7'));
  assert.ok(restrictedCaregiverPrompt.includes('paused vital trend sharing'));
});

test('upsertTranscriptTurn appends streaming chunks cleanly and finalizes turns', () => {
  let turns = upsertTranscriptTurn([], {
    role: 'assistant',
    textChunk: 'Your heart rate',
    isFinal: false,
  });
  turns = upsertTranscriptTurn(turns, {
    role: 'assistant',
    textChunk: 'is slightly higher today.',
    isFinal: true,
  });
  assert.equal(turns.length, 1);
  assert.equal(turns[0].text, 'Your heart rate is slightly higher today.');
  assert.equal(turns[0].isFinal, true);

  turns = upsertTranscriptTurn(turns, {
    role: 'user',
    textChunk: 'Why did I get this alert?',
    isFinal: true,
    source: 'text',
  });
  assert.equal(turns.length, 2);
});
