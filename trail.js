import { formatTimestamp, timeAgo } from './format.js';

const METERS_PER_MILE = 1609.344;
const DEFAULT_CENTER = [39.5, -98.35];
const DEFAULT_ZOOM = 4;
const TRAIL_COLOR = getComputedStyle(document.documentElement).getPropertyValue('--trail').trim();

export function createMap(elementId) {
  const map = L.map(elementId, { zoomControl: false }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
  L.control.zoom({ position: 'topright' }).addTo(map);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  return { map, trailLayer: L.layerGroup().addTo(map), photoLayer: L.layerGroup().addTo(map) };
}

function describePoint(point) {
  return `<strong>${formatTimestamp(point.ts)}</strong><br>${timeAgo(point.ts)}`;
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

const flagIcon = () => L.divIcon({
  className: '',
  html: '<div class="latest-car finish-flag">🏁</div>',
  iconSize: [38, 38],
  popupAnchor: [0, -18],
});

function endMarker(points, isArchived) {
  const latest = points.at(-1);
  const previous = points.at(-2);
  const icon = isArchived ? flagIcon() : carIcon(previous !== undefined && latest.lon > previous.lon);
  const label = isArchived ? '🏁 Final check-in' : '🚗 Latest check-in';
  return L.marker([latest.lat, latest.lon], { icon, zIndexOffset: 1000 }).bindPopup(`${label}<br>${describePoint(latest)}`);
}

export function renderTrail({ map, trailLayer }, points, { isArchived, shouldFit }) {
  trailLayer.clearLayers();
  if (points.length === 0) {
    if (shouldFit) map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    return;
  }

  const coordinates = points.map((point) => [point.lat, point.lon]);
  L.polyline(coordinates, { color: TRAIL_COLOR, weight: 4, opacity: 0.8 }).addTo(trailLayer);
  points.slice(0, -1).forEach((point) => {
    L.circleMarker([point.lat, point.lon], {
      radius: 5, color: '#ffffff', weight: 2, fillColor: TRAIL_COLOR, fillOpacity: 1,
    }).bindPopup(describePoint(point)).addTo(trailLayer);
  });
  endMarker(points, isArchived).addTo(trailLayer);

  if (shouldFit) map.fitBounds(L.latLngBounds(coordinates).pad(0.2), { maxZoom: 11 });
}

export function totalMiles(points) {
  const meters = points.slice(1).reduce(
    (sum, point, index) => sum + L.latLng(points[index].lat, points[index].lon).distanceTo([point.lat, point.lon]),
    0,
  );
  return meters / METERS_PER_MILE;
}
