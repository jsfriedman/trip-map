import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { decryptTrail, WrongPasswordError } from '../decrypt.js';

// Produced by trip-backend's encryptTrail, so this also checks the two sides agree on the format.
const fixture = JSON.parse(await readFile(new URL('./fixture.enc.json', import.meta.url), 'utf8'));
const FIXTURE_PASSWORD = 'fixture password 123';

test('decrypts a trail written by the backend', async () => {
  const points = await decryptTrail(fixture, FIXTURE_PASSWORD);
  assert.equal(points.length, 2);
  assert.deepEqual(points[0], { lat: 39.73924, lon: -104.99025, ts: 1790000000000, acc: 12, batt: 80 });
});

test('throws WrongPasswordError for a bad password', async () => {
  await assert.rejects(decryptTrail(fixture, 'nope nope nope'), WrongPasswordError);
});

test('rejects unknown versions and bad iteration counts', async () => {
  await assert.rejects(decryptTrail({ ...fixture, v: 2 }, FIXTURE_PASSWORD), /Unsupported/);
  await assert.rejects(decryptTrail({ ...fixture, iterations: 10 }, FIXTURE_PASSWORD), /iteration/);
});
