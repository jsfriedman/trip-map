import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dataRootFor, LIVE_MODE, parseMode } from '../trips.js';

test('parseMode reads the live, list and trip views from the hash', () => {
  assert.equal(parseMode(''), LIVE_MODE);
  assert.equal(parseMode('#'), LIVE_MODE);
  assert.deepEqual(parseMode('#trips'), { kind: 'list' });
  assert.deepEqual(parseMode('#trip=0123456789abcdef'), { kind: 'trip', tripId: '0123456789abcdef' });
});

test('parseMode falls back to live for malformed trip ids', () => {
  for (const hash of ['#trip=', '#trip=../../etc', '#trip=0123456789ABCDEF', '#trip=0123456789abcdef0', '#something']) {
    assert.equal(parseMode(hash), LIVE_MODE, hash);
  }
});

test('dataRootFor points archived trips at their own folder', () => {
  assert.equal(dataRootFor(LIVE_MODE), '');
  assert.equal(dataRootFor({ kind: 'list' }), '');
  assert.equal(dataRootFor({ kind: 'trip', tripId: '0123456789abcdef' }), 'trips/0123456789abcdef/');
});
