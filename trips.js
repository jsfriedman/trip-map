import { decryptTrail } from './decrypt.js';
import { fetchEncryptedJson } from './encrypted-file.js';
import { formatDateRange, pluralize } from './format.js';

const TRIP_CATALOG_URL = 'trips.enc.json';
const TRIP_HASH_PATTERN = /^#trip=([0-9a-f]{16})$/;

export const LIVE_MODE = { kind: 'live' };

export function parseMode(hash) {
  if (hash === '#trips') return { kind: 'list' };
  const match = TRIP_HASH_PATTERN.exec(hash);
  return match ? { kind: 'trip', tripId: match[1] } : LIVE_MODE;
}

export const dataRootFor = (mode) => (mode.kind === 'trip' ? `trips/${mode.tripId}/` : '');

export async function loadTripCatalog(password, previous) {
  const blob = await fetchEncryptedJson(TRIP_CATALOG_URL);
  if (blob === null) return { trips: [], iv: null };
  if (blob.iv === previous.iv) return previous;
  const trips = await decryptTrail(blob, password);
  return { trips: [...trips].sort((first, second) => second.endTs - first.endTs), iv: blob.iv };
}

function tripListItem(trip) {
  const item = document.createElement('li');
  const link = document.createElement('a');
  link.href = `#trip=${trip.id}`;
  link.className = 'trip-link';
  const name = document.createElement('strong');
  name.textContent = trip.name;
  const details = document.createElement('span');
  details.className = 'muted';
  details.textContent = [
    formatDateRange(trip.startTs, trip.endTs),
    pluralize(trip.pointCount, 'check-in', 'check-ins'),
    pluralize(trip.photoCount, 'photo', 'photos'),
  ].join(' · ');
  link.append(name, details);
  item.append(link);
  return item;
}

export function renderTripList(listElement, trips) {
  if (trips.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'muted';
    empty.textContent = 'No archived trips yet.';
    listElement.replaceChildren(empty);
    return;
  }
  listElement.replaceChildren(...trips.map(tripListItem));
}
