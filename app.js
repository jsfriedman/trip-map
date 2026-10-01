import { decryptTrail, WrongPasswordError } from './decrypt.js';
import { fetchEncryptedJson } from './encrypted-file.js';
import { formatDateRange, formatTimestamp, pluralize, timeAgo } from './format.js';
import { loadPhotoIndex, renderPhotos } from './photos.js';
import { createMap, renderTrail, totalMiles } from './trail.js';
import { dataRootFor, LIVE_MODE, loadTripCatalog, parseMode, renderTripList } from './trips.js';

const PASSWORD_STORAGE_KEY = 'trip-map-password';
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const STATUS_TICK_MS = 60 * 1000;

const elements = {
  lockScreen: document.getElementById('lock-screen'),
  mapScreen: document.getElementById('map-screen'),
  unlockForm: document.getElementById('unlock-form'),
  passwordInput: document.getElementById('password-input'),
  rememberInput: document.getElementById('remember-input'),
  unlockButton: document.getElementById('unlock-button'),
  unlockError: document.getElementById('unlock-error'),
  statusCard: document.getElementById('status-card'),
  statusHeadline: document.getElementById('status-headline'),
  statusDetails: document.getElementById('status-details'),
  liveMapLink: document.getElementById('live-map-link'),
  pastTripsLink: document.getElementById('past-trips-link'),
  forgetButton: document.getElementById('forget-button'),
  tripsPanel: document.getElementById('trips-panel'),
  tripsList: document.getElementById('trips-list'),
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

const EMPTY_VIEW = { trailIv: null, points: [], photoIndex: { photos: [], iv: null }, hasFitBounds: false };
const EMPTY_SESSION = { password: null, mode: LIVE_MODE, catalog: { trips: [], iv: null }, ...EMPTY_VIEW };

let session = EMPTY_SESSION;
let mapLayers = null;

async function loadTrail(password, dataRoot, previous) {
  const blob = await fetchEncryptedJson(`${dataRoot}trail.enc.json`);
  if (blob === null) return { points: [], trailIv: null };
  if (blob.iv === previous.trailIv) return { points: previous.points, trailIv: blob.iv };
  const points = await decryptTrail(blob, password);
  return { points: [...points].sort((first, second) => first.ts - second.ts), trailIv: blob.iv };
}

async function loadMode(mode, password, previous) {
  const dataRoot = dataRootFor(mode);
  const [trail, photoIndex, catalog] = await Promise.all([
    loadTrail(password, dataRoot, previous),
    loadPhotoIndex(password, previous.photoIndex, dataRoot),
    loadTripCatalog(password, session.catalog),
  ]);
  return { ...trail, photoIndex, catalog };
}

const currentTrip = () => session.catalog.trips.find((trip) => trip.id === session.mode.tripId);

function photoSummary() {
  const { photos } = session.photoIndex;
  return photos.length > 0 ? [pluralize(photos.length, 'photo', 'photos')] : [];
}

function renderLiveStatus() {
  const { points } = session;
  if (points.length === 0) {
    elements.statusHeadline.textContent = 'No check-ins yet';
    elements.statusDetails.textContent = 'The first one will show up here soon.';
    return;
  }
  const latest = points.at(-1);
  elements.statusHeadline.textContent = `Last seen ${timeAgo(latest.ts)}`;
  elements.statusDetails.textContent = [
    formatTimestamp(latest.ts),
    pluralize(points.length, 'check-in', 'check-ins'),
    `~${Math.round(totalMiles(points)).toLocaleString()} mi`,
    ...photoSummary(),
  ].join(' · ');
}

function renderTripStatus() {
  const trip = currentTrip();
  if (!trip) {
    elements.statusHeadline.textContent = 'Trip not found';
    elements.statusDetails.textContent = 'It may have been removed.';
    return;
  }
  elements.statusHeadline.textContent = `🏁 ${trip.name}`;
  elements.statusDetails.textContent = [
    formatDateRange(trip.startTs, trip.endTs),
    pluralize(session.points.length, 'check-in', 'check-ins'),
    `~${Math.round(totalMiles(session.points)).toLocaleString()} mi`,
    ...photoSummary(),
  ].join(' · ');
}

function renderStatus() {
  const { kind } = session.mode;
  if (kind === 'trip') renderTripStatus();
  else renderLiveStatus();
  elements.liveMapLink.hidden = kind !== 'trip';
  elements.pastTripsLink.hidden = session.catalog.trips.length === 0;
  elements.statusCard.hidden = kind === 'list';
  elements.tripsPanel.hidden = kind !== 'list';
}

function drawTrail() {
  const shouldFit = !session.hasFitBounds;
  renderTrail(mapLayers, session.points, { isArchived: session.mode.kind === 'trip', shouldFit });
  if (shouldFit) session = { ...session, hasFitBounds: session.points.length > 0 };
}

function showMap() {
  elements.lockScreen.hidden = true;
  elements.mapScreen.hidden = false;
  mapLayers ??= createMap('map');
  mapLayers.map.invalidateSize();
}

async function showMode(mode, password) {
  const isSameData = session.password !== null && dataRootFor(mode) === dataRootFor(session.mode);
  const previous = isSameData ? session : EMPTY_VIEW;
  const loaded = await loadMode(mode, password, previous);
  const trailChanged = !isSameData || loaded.trailIv !== session.trailIv;
  const photosChanged = !isSameData || loaded.photoIndex !== session.photoIndex;

  session = { ...session, ...loaded, password, mode, hasFitBounds: isSameData && session.hasFitBounds };
  showMap();
  if (trailChanged) drawTrail();
  if (photosChanged) renderPhotos(mapLayers.photoLayer, session.photoIndex.photos, dataRootFor(mode));
  if (mode.kind === 'list') renderTripList(elements.tripsList, session.catalog.trips);
  renderStatus();
}

function showLock(errorMessage) {
  elements.mapScreen.hidden = true;
  elements.lockScreen.hidden = false;
  elements.unlockError.hidden = !errorMessage;
  elements.unlockError.textContent = errorMessage ?? '';
  elements.passwordInput.focus();
}

function forget(errorMessage) {
  storage.clear();
  session = EMPTY_SESSION;
  elements.passwordInput.value = '';
  showLock(errorMessage);
}

// Archived trips keep the password they were saved with, so a mismatch there must not log the viewer out.
function handleLoadError(error, mode) {
  if (error instanceof WrongPasswordError && mode.kind !== 'trip') {
    return forget('The password changed. Please enter the new one.');
  }
  console.error('Loading the map failed', error);
  elements.statusHeadline.textContent = error instanceof WrongPasswordError
    ? 'This trip was saved with a different password'
    : 'Couldn’t load this view';
  elements.statusDetails.textContent = error instanceof WrongPasswordError ? '' : 'Check your connection and try again.';
}

async function refresh() {
  if (!session.password || document.hidden || session.mode.kind === 'trip') return;
  await showMode(session.mode, session.password).catch((error) => handleLoadError(error, session.mode));
}

function unlockErrorMessage(error) {
  if (error instanceof WrongPasswordError) return 'That password didn’t work. Try again?';
  console.error('Unlock failed', error);
  return 'Couldn’t load the map. Check your connection and try again.';
}

async function unlock(password, remember) {
  await showMode(parseMode(location.hash), password);
  if (remember) storage.write(password);
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

window.addEventListener('hashchange', () => {
  if (!session.password) return;
  const mode = parseMode(location.hash);
  showMode(mode, session.password).catch((error) => handleLoadError(error, mode));
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
