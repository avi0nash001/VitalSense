import assert from 'node:assert/strict';
import test from 'node:test';
import { DEMO_PERSONA_LIST, getDemoPersona } from './demoPersonas.ts';

test('each demonstration persona has an independent personal baseline and reading series', () => {
  assert.equal(DEMO_PERSONA_LIST.length, 3);

  const elena = getDemoPersona('elena');
  const arjun = getDemoPersona('arjun');
  const maya = getDemoPersona('maya');

  assert.notEqual(elena.baselines.heartRate.mean, arjun.baselines.heartRate.mean);
  assert.notEqual(arjun.baselines.heartRate.mean, maya.baselines.heartRate.mean);
  assert.notEqual(elena.baselines.heartRate.mean, maya.baselines.heartRate.mean);

  assert.equal(elena.readings.length, 17);
  assert.equal(arjun.readings.length, 17);
  assert.equal(maya.readings.length, 17);

  // Elena & Maya show 3-day sustained shift; Arjun stays within personal range
  assert.equal(elena.recentAlerts.length, 1);
  assert.equal(arjun.recentAlerts.length, 0);
  assert.equal(maya.recentAlerts.length, 1);
});

test('getDemoPersona safely falls back to elena for unknown IDs', () => {
  const fallback = getDemoPersona('unknown-id');
  assert.equal(fallback.id, 'elena');
});
