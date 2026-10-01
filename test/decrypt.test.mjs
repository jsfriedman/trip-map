import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { decryptPhoto, decryptTrail, WrongPasswordError } from '../decrypt.js';

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

// Also produced by trip-backend (encryptBytesWithRandomKey).
const photoFixture = JSON.parse(await readFile(new URL('./fixture.photo.json', import.meta.url), 'utf8'));
const fromBase64 = (base64) => new Uint8Array(Buffer.from(base64, 'base64'));

test('decrypts a photo written by the backend', async () => {
  const bytes = await decryptPhoto(fromBase64(photoFixture.ciphertext), photoFixture.key, photoFixture.iv);
  assert.deepEqual(bytes, fromBase64(photoFixture.plaintext));
});

test('photo decryption fails with the wrong key', async () => {
  const wrongKey = Buffer.alloc(32, 1).toString('base64');
  await assert.rejects(decryptPhoto(fromBase64(photoFixture.ciphertext), wrongKey, photoFixture.iv));
});
