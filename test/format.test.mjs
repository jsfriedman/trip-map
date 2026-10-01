import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatDateRange, pluralize, timeAgo } from '../format.js';

test('timeAgo picks a sensible unit', () => {
  const now = Date.UTC(2026, 9, 1, 12);
  assert.equal(timeAgo(now - 10_000, now), 'just now');
  assert.match(timeAgo(now - 5 * 60_000, now), /5 minutes ago/);
  assert.match(timeAgo(now - 3 * 3_600_000, now), /3 hours ago/);
  assert.match(timeAgo(now - 2 * 86_400_000, now), /2 days ago/);
});

test('formatDateRange collapses a single-day range', () => {
  const day = Date.UTC(2026, 9, 1, 12);
  assert.equal(formatDateRange(day, day + 60_000), formatDateRange(day, day));
  assert.match(formatDateRange(day, day + 10 * 86_400_000), / – /);
});

test('pluralize', () => {
  assert.equal(pluralize(1, 'photo', 'photos'), '1 photo');
  assert.equal(pluralize(3, 'photo', 'photos'), '3 photos');
});
