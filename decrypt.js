const FORMAT_VERSION = 1;
const MIN_ITERATIONS = 100_000;
const MAX_ITERATIONS = 5_000_000;

export class WrongPasswordError extends Error {}

function base64ToBytes(base64) {
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

async function deriveKey(password, salt, iterations) {
  const baseKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );
}

export async function decryptTrail(blob, password) {
  if (blob?.v !== FORMAT_VERSION) {
    throw new Error(`Unsupported trail format version: ${blob?.v}`);
  }
  if (!Number.isInteger(blob.iterations) || blob.iterations < MIN_ITERATIONS || blob.iterations > MAX_ITERATIONS) {
    throw new Error('Trail file has an invalid iteration count');
  }
  const key = await deriveKey(password, base64ToBytes(blob.salt), blob.iterations);
  let plaintext;
  try {
    plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(blob.iv) }, key, base64ToBytes(blob.ciphertext));
  } catch {
    throw new WrongPasswordError('Wrong password');
  }
  const points = JSON.parse(new TextDecoder().decode(plaintext));
  if (!Array.isArray(points)) throw new Error('Trail data is not a list of points');
  return points;
}

export async function decryptPhoto(ciphertext, keyBase64, ivBase64) {
  const key = await crypto.subtle.importKey('raw', base64ToBytes(keyBase64), 'AES-GCM', false, ['decrypt']);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(ivBase64) }, key, ciphertext);
  return new Uint8Array(plaintext);
}
