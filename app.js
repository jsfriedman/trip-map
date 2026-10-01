import { decryptTrail, WrongPasswordError } from './decrypt.js';
import { fetchEncryptedJson } from './encrypted-file.js';
import { loadPhotoIndex, renderPhotos } from './photos.js';
import { formatTimestamp, timeAgo } from './time.js';

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

const EMPTY_PHOTO_INDEX = { photos: [], iv: null };
const EMPTY_SESSION = { password: null, lastIv: null, points: [], photoIndex: EMPTY_PHOTO_INDEX, hasFitBounds: false };

let session = EMPTY_SESSION;
let map = null;
let trailLayer = null;
let photoLayer = null;

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
  photoLayer = L.layerGroup().addTo(map);
}

// The car emoji faces left (west) on every major platform, so mirror it when heading east.
function carIcon(isHeadingEast) {
  const carClass = isHeadingEast ? 'car car-east' : 'car';
  return L.divIcon({
    className: '',
    html: `<div class="latest-car"><span class="${carClass}">🚗</span></div>`,
    iconSize: [38, 38],
    popupAnchor: [0, -18],
  });
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
  const previous = points.at(-2);
  L.marker([latest.lat, latest.lon], { icon: carIcon(previous !== undefined && latest.lon > previous.lon), zIndexOffset: 1000 })
    .bindPopup(`🚗 Latest check-in<br>${describePoint(latest)}`)
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

const pluralize = (count, singular, plural) => `${count} ${count === 1 ? singular : plural}`;

function renderStatus() {
  const { points } = session;
  const { photos } = session.photoIndex;
  if (points.length === 0) {
    elements.statusHeadline.textContent = 'No check-ins yet';
    elements.statusDetails.textContent = 'The first one will show up here soon.';
    return;
  }
  const latest = points.at(-1);
  const miles = Math.round(totalMiles(points)).toLocaleString();
  const photoSummary = photos.length > 0 ? ` · ${pluralize(photos.length, 'photo', 'photos')}` : '';
  elements.statusHeadline.textContent = `Last seen ${timeAgo(latest.ts)}`;
  elements.statusDetails.textContent =
    `${formatTimestamp(latest.ts)} · ${pluralize(points.length, 'check-in', 'check-ins')} · ~${miles} mi${photoSummary}`;
}

async function loadTrail(password) {
  const blob = await fetchEncryptedJson(TRAIL_URL);
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

async function loadEverything(password) {
  const [trail, photoIndex] = await Promise.all([loadTrail(password), loadPhotoIndex(password, session.photoIndex)]);
  return { ...trail, photoIndex };
}

async function unlock(password, remember) {
  const { points, iv, photoIndex } = await loadEverything(password);
  session = { ...session, password, points, lastIv: iv, photoIndex };
  if (remember) storage.write(password);
  showMap();
  renderTrail(points);
  renderPhotos(photoLayer, photoIndex.photos);
  renderStatus();
}

async function refresh() {
  if (!session.password || document.hidden) return;
  try {
    const { points, iv, photoIndex } = await loadEverything(session.password);
    const trailChanged = iv !== session.lastIv;
    const photosChanged = photoIndex !== session.photoIndex;
    session = { ...session, points, lastIv: iv, photoIndex };
    if (trailChanged) renderTrail(points);
    if (photosChanged) renderPhotos(photoLayer, photoIndex.photos);
    renderStatus();
  } catch (error) {
    if (error instanceof WrongPasswordError) return forget('The password changed. Please enter the new one.');
    console.error('Trail refresh failed', error);
  }
}

function forget(errorMessage) {
  storage.clear();
  session = EMPTY_SESSION;
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
