const REPOSITORY = 'jsfriedman/trip-backend';
const TOKEN_STORAGE_KEY = 'trip-post-token';
const MAX_DIMENSION_PX = 1600;
const JPEG_QUALITY = 0.8;
const LOCATION_OPTIONS = { enableHighAccuracy: true, timeout: 15_000, maximumAge: 5 * 60 * 1000 };
const BASE64_CHUNK_BYTES = 0x8000;

const elements = {
  tokenForm: document.getElementById('token-form'),
  tokenInput: document.getElementById('token-input'),
  captureSection: document.getElementById('capture-section'),
  takePhotoLabel: document.getElementById('take-photo-label'),
  photoInput: document.getElementById('photo-input'),
  previewImage: document.getElementById('preview-image'),
  captionInput: document.getElementById('caption-input'),
  sendButton: document.getElementById('send-button'),
  status: document.getElementById('post-status'),
  changeTokenButton: document.getElementById('change-token-button'),
};

const tokenStorage = {
  read() {
    try { return localStorage.getItem(TOKEN_STORAGE_KEY); } catch { return null; }
  },
  write(token) {
    try { localStorage.setItem(TOKEN_STORAGE_KEY, token); } catch { /* private mode: token lasts for this visit only */ }
  },
};

class TokenRejectedError extends Error {}

let state = { token: tokenStorage.read(), screen: 'capture', draft: null, sending: false, message: '' };

function setState(changes) {
  state = { ...state, ...changes };
  render();
}

function render() {
  const showTokenForm = !state.token || state.screen === 'token';
  elements.tokenForm.hidden = !showTokenForm;
  elements.captureSection.hidden = showTokenForm;
  elements.previewImage.hidden = !state.draft;
  elements.captionInput.hidden = !state.draft;
  elements.sendButton.hidden = !state.draft;
  elements.sendButton.disabled = state.sending;
  elements.sendButton.textContent = state.sending ? 'Sending…' : state.draft?.failed ? 'Retry' : 'Send';
  elements.takePhotoLabel.textContent = state.draft ? 'Retake photo' : 'Take photo';
  elements.status.textContent = state.message;
}

function requestLocation() {
  if (!('geolocation' in navigator)) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lon: position.coords.longitude }),
      () => resolve(null),
      LOCATION_OPTIONS,
    );
  });
}

// Re-encoding through a canvas also strips EXIF metadata from the original file.
async function resizeToJpeg(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, MAX_DIMENSION_PX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the photo'))), 'image/jpeg', JPEG_QUALITY);
  });
}

function bytesToBase64(bytes) {
  const chunks = [];
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK_BYTES) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + BASE64_CHUNK_BYTES)));
  }
  return btoa(chunks.join(''));
}

function uploadFileName(timestampMs) {
  return `${new Date(timestampMs).toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID().slice(0, 8)}.json`;
}

async function uploadPhoto(draft, caption, token) {
  const location = await draft.locationPromise;
  const upload = { ...location, ts: draft.ts, caption, image: bytesToBase64(new Uint8Array(await draft.jpeg.arrayBuffer())) };
  const response = await fetch(`https://api.github.com/repos/${REPOSITORY}/contents/inbox/${draft.fileName}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    body: JSON.stringify({ message: 'photo upload', content: bytesToBase64(new TextEncoder().encode(JSON.stringify(upload))) }),
  });
  // 422 on a retry means the earlier attempt already created this file.
  if (response.ok || (response.status === 422 && draft.failed)) return { hasLocation: location !== null };
  if (response.status === 401 || response.status === 403 || response.status === 404) {
    throw new TokenRejectedError(`GitHub rejected the token (HTTP ${response.status})`);
  }
  throw new Error(`GitHub returned HTTP ${response.status}`);
}

async function handlePhotoSelected() {
  const file = elements.photoInput.files?.[0];
  elements.photoInput.value = '';
  if (!file) return;
  setState({ draft: null, message: 'Preparing photo…' });
  try {
    const locationPromise = requestLocation();
    const jpeg = await resizeToJpeg(file);
    if (elements.previewImage.src) URL.revokeObjectURL(elements.previewImage.src);
    elements.previewImage.src = URL.createObjectURL(jpeg);
    const ts = Date.now();
    setState({ draft: { jpeg, ts, locationPromise, fileName: uploadFileName(ts), failed: false }, message: '' });
  } catch (error) {
    console.error('Preparing photo failed', error);
    setState({ message: 'Couldn’t read that photo. Try taking it again.' });
  }
}

async function handleSend() {
  if (!state.draft || state.sending) return;
  setState({ sending: true, message: 'Sending…' });
  try {
    const { hasLocation } = await uploadPhoto(state.draft, elements.captionInput.value.trim(), state.token);
    elements.captionInput.value = '';
    const locationNote = hasLocation ? '' : ' Location was unavailable, so it’ll be placed at your last check-in.';
    setState({ draft: null, sending: false, message: `Sent! It’ll show up on the map in about 2 minutes.${locationNote}` });
  } catch (error) {
    console.error('Upload failed', error);
    const message = error instanceof TokenRejectedError
      ? `${error.message}. Tap “Change token” to update it, then retry.`
      : 'Upload failed. Check your signal and tap Retry.';
    setState({ draft: { ...state.draft, failed: true }, sending: false, message });
  }
}

elements.tokenForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const token = elements.tokenInput.value.trim();
  if (!token) return;
  tokenStorage.write(token);
  elements.tokenInput.value = '';
  setState({ token, screen: 'capture', message: state.draft ? 'Token saved. Tap Retry to send.' : '' });
});

elements.changeTokenButton.addEventListener('click', () => setState({ screen: 'token' }));
elements.photoInput.addEventListener('change', handlePhotoSelected);
elements.sendButton.addEventListener('click', handleSend);
render();
