import { decryptTrail, WrongPasswordError } from './decrypt.js';
import { timeAgo } from './time.js';

const TRAIL_URL = 'trail.enc.json';
const METERS_PER_MILE = 1609.344;
const PASSWORD_STORAGE_KEY = 'trip-map-password';
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const STATUS_TICK_MS = 60 * 1000;
const TRAIL_COLOR = getComputedStyle(document.documentElement).getPropertyValue('--trail').trim();

const elements = {
  lockScreen: document.getElementById('lock-screen'),
  mapScreen: document.getElementById('map-screen'),
  unlockForm: document.getElementById('unlock-form'),
  passwordInput: document.getElementById('password-input'),
  rememberInput: document.getElementById('remember-input'),
  unlockButton: document.getElementById('unlock-button'),
  unlockError: document.getElementById('unlock-error'),
  statusHeadline: document.getElementById('status-headline'),
  statusDetails: document.getElementById('status-details'),
  forgetButton: document.getElementById('forget-button'),
};

const storage = {
  read() {
    try { return localStorage.getItem(PASSWORD_STORAGE_KEY); } catch { return null; }
  },
  write(password) {
    try { localStorage.setItem(PASSWORD_STORAGE_KEY, password); } catch { /* private mode: stay unlocked for this visit only */ }
  },
  clear() {
    try { localStorage.removeItem(PASSWORD_STORAGE_KEY); } catch { /* nothing stored */ }
  },
};

let session = { password: null, lastIv: null, points: [], hasFitBounds: false };
let map = null;
let trailLayer = null;

async function fetchEncryptedTrail() {
  const response = await fetch(`${TRAIL_URL}?t=${Date.now()}`, { cache: 'no-store' });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Could not load the trail (HTTP ${response.status})`);
  return response.json();
}

function formatTimestamp(timestampMs) {
  return new Date(timestampMs).toLocaleString([], {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function describePoint(point) {
  const battery = point.batt !== undefined ? `<br>🔋 ${point.batt}%` : '';
  return `<strong>${formatTimestamp(point.ts)}</strong><br>${timeAgo(point.ts)}${battery}`;
}

function ensureMap() {
  if (map) return;
  map = L.map('map', { zoomControl: false }).setView([39.5, -98.35], 4);
  L.control.zoom({ position: 'topright' }).addTo(map);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  trailLayer = L.layerGroup().addTo(map);
}

function renderTrail(points) {
  trailLayer.clearLayers();
  if (points.length === 0) return;

  const coordinates = points.map((point) => [point.lat, point.lon]);
  L.polyline(coordinates, { color: TRAIL_COLOR, weight: 4, opacity: 0.8 }).addTo(trailLayer);
  points.slice(0, -1).forEach((point) => {
    L.circleMarker([point.lat, point.lon], {
      radius: 5, color: '#ffffff', weight: 2, fillColor: TRAIL_COLOR, fillOpacity: 1,
    }).bindPopup(describePoint(point)).addTo(trailLayer);
  });

  const latest = points.at(-1);
  const latestIcon = L.divIcon({ className: '', html: '<div class="latest-pin"></div>', iconSize: [22, 22] });
  L.marker([latest.lat, latest.lon], { icon: latestIcon, zIndexOffset: 1000 })
    .bindPopup(`📍 Latest check-in<br>${describePoint(latest)}`)
    .addTo(trailLayer);

  if (!session.hasFitBounds) {
    map.fitBounds(L.latLngBounds(coordinates).pad(0.2), { maxZoom: 11 });
    session = { ...session, hasFitBounds: true };
  }
}

function totalMiles(points) {
  const meters = points.slice(1).reduce(
    (sum, point, index) => sum + L.latLng(points[index].lat, points[index].lon).distanceTo([point.lat, point.lon]),
    0,
  );
  return meters / METERS_PER_MILE;
}

function renderStatus() {
  const { points } = session;
  if (points.length === 0) {
    elements.statusHeadline.textContent = 'No check-ins yet';
    elements.statusDetails.textContent = 'The first one will show up here soon.';
    return;
  }
  const latest = points.at(-1);
  const miles = Math.round(totalMiles(points)).toLocaleString();
  const checkInLabel = points.length === 1 ? 'check-in' : 'check-ins';
  elements.statusHeadline.textContent = `Last seen ${timeAgo(latest.ts)}`;
  elements.statusDetails.textContent = `${formatTimestamp(latest.ts)} · ${points.length} ${checkInLabel} · ~${miles} mi`;
}

async function loadTrail(password) {
  const blob = await fetchEncryptedTrail();
  if (blob === null) return { points: [], iv: null };
  if (blob.iv === session.lastIv) return { points: session.points, iv: blob.iv };
  const points = await decryptTrail(blob, password);
  return { points: [...points].sort((first, second) => first.ts - second.ts), iv: blob.iv };
}

function showMap() {
  elements.lockScreen.hidden = true;
  elements.mapScreen.hidden = false;
  ensureMap();
  map.invalidateSize();
}

function showLock(errorMessage) {
  elements.mapScreen.hidden = true;
  elements.lockScreen.hidden = false;
  elements.unlockError.hidden = !errorMessage;
  elements.unlockError.textContent = errorMessage ?? '';
  elements.passwordInput.focus();
}

async function unlock(password, remember) {
  const { points, iv } = await loadTrail(password);
  session = { ...session, password, points, lastIv: iv };
  if (remember) storage.write(password);
  showMap();
  renderTrail(points);
  renderStatus();
}

async function refresh() {
  if (!session.password || document.hidden) return;
  try {
    const { points, iv } = await loadTrail(session.password);
    if (iv === session.lastIv) return renderStatus();
    session = { ...session, points, lastIv: iv };
    renderTrail(points);
    renderStatus();
  } catch (error) {
    if (error instanceof WrongPasswordError) return forget('The password changed. Please enter the new one.');
    console.error('Trail refresh failed', error);
  }
}

function forget(errorMessage) {
  storage.clear();
  session = { password: null, lastIv: null, points: [], hasFitBounds: false };
  elements.passwordInput.value = '';
  showLock(errorMessage);
}

function unlockErrorMessage(error) {
  if (error instanceof WrongPasswordError) return 'That password didn’t work. Try again?';
  console.error('Unlock failed', error);
  return 'Couldn’t load the map. Check your connection and try again.';
}

elements.unlockForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const password = elements.passwordInput.value;
  if (!password) return;
  elements.unlockButton.disabled = true;
  elements.unlockButton.textContent = 'Unlocking…';
  try {
    await unlock(password, elements.rememberInput.checked);
  } catch (error) {
    showLock(unlockErrorMessage(error));
  } finally {
    elements.unlockButton.disabled = false;
    elements.unlockButton.textContent = 'Show the map';
  }
});

elements.forgetButton.addEventListener('click', () => forget());
document.addEventListener('visibilitychange', refresh);
setInterval(refresh, REFRESH_INTERVAL_MS);
setInterval(() => session.password && renderStatus(), STATUS_TICK_MS);

const rememberedPassword = storage.read();
if (rememberedPassword) {
  unlock(rememberedPassword, true).catch((error) => {
    if (error instanceof WrongPasswordError) return forget('The password changed. Please enter the new one.');
    showLock(unlockErrorMessage(error));
  });
} else {
  showLock();
}
