import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_THEME_ID,
  THEME_DEFINITIONS,
  THEME_LIST,
  resolveThemeId,
} from './themes';

test('THEME_DEFINITIONS includes all 6 required VITALSENSE themes with dose as default', () => {
  assert.equal(DEFAULT_THEME_ID, 'dose');
  assert.equal(THEME_LIST.length, 6);
  const ids = THEME_LIST.map((t) => t.id);
  assert.deepEqual(ids, ['dose', 'studio', 'dusk', 'vantage', 'coral', 'cobalt']);
});

test('resolveThemeId validates known theme IDs and safely falls back to dose', () => {
  assert.equal(resolveThemeId('studio'), 'studio');
  assert.equal(resolveThemeId('vantage'), 'vantage');
  assert.equal(resolveThemeId('unknown-theme'), 'dose');
  assert.equal(resolveThemeId(null), 'dose');
});

test('every theme defines required semantic CSS variables', () => {
  const requiredTokens = [
    '--vs-bg',
    '--vs-surface',
    '--vs-border',
    '--vs-text',
    '--vs-accent',
    '--vs-chart-line',
  ];
  for (const theme of Object.values(THEME_DEFINITIONS)) {
    for (const token of requiredTokens) {
      assert.ok(theme.tokens[token], `${theme.id} missing token ${token}`);
    }
  }
});
