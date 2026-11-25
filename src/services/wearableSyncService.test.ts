import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveSyncStatusSummary,
  formatRelativeSyncTime,
} from './wearableSyncService';

test('formatRelativeSyncTime formats elapsed durations into plain English', () => {
  const base = Date.parse('2026-11-25T10:00:00.000Z');
  assert.equal(formatRelativeSyncTime(null, base), 'Waiting for first sync');
  assert.equal(formatRelativeSyncTime('2026-11-25T09:59:55.000Z', base), 'Just now');
  assert.equal(formatRelativeSyncTime('2026-11-25T09:59:30.000Z', base), '30s ago');
  assert.equal(formatRelativeSyncTime('2026-11-25T09:55:00.000Z', base), '5m ago');
  assert.equal(formatRelativeSyncTime('2026-11-25T08:00:00.000Z', base), '2h ago');
});

test('deriveSyncStatusSummary preserves Syncing status during active stream and reports errors cleanly', () => {
  const base = Date.parse('2026-11-25T10:00:00.000Z');
  const active = deriveSyncStatusSummary({
    isRefreshingNow: false,
    lastSyncedAt: '2026-11-25T09:59:40.000Z',
    lastError: null,
    nowMs: base,
  });
  assert.equal(active.badgeText, 'Syncing');
  assert.equal(active.relativeTime, '20s ago');
  assert.match(active.statusDetail, /20s ago/);

  const errored = deriveSyncStatusSummary({
    isRefreshingNow: false,
    lastSyncedAt: '2026-11-25T09:55:00.000Z',
    lastError: 'Wearable gateway unreachable',
    nowMs: base,
  });
  assert.equal(errored.badgeText, 'Sync paused');
  assert.equal(errored.statusDetail, 'Wearable gateway unreachable');
});
