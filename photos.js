import { decryptPhoto, decryptTrail } from './decrypt.js';
import { fetchEncryptedJson } from './encrypted-file.js';
import { formatTimestamp, timeAgo } from './format.js';

const photoUrlCache = new Map();

export async function loadPhotoIndex(password, previous, dataRoot) {
  const blob = await fetchEncryptedJson(`${dataRoot}photos.enc.json`);
  if (blob === null) return { photos: [], iv: null };
  if (blob.iv === previous.iv) return previous;
  const photos = await decryptTrail(blob, password);
  return { photos: [...photos].sort((first, second) => first.ts - second.ts), iv: blob.iv };
}

function loadPhotoUrl(photo, dataRoot) {
  if (!photoUrlCache.has(photo.id)) {
    const urlPromise = fetch(`${dataRoot}photos/${encodeURIComponent(photo.id)}.bin`)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.arrayBuffer();
      })
      .then((ciphertext) => decryptPhoto(new Uint8Array(ciphertext), photo.key, photo.iv))
      .then((bytes) => URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' })))
      .catch((error) => {
        photoUrlCache.delete(photo.id);
        throw error;
      });
    photoUrlCache.set(photo.id, urlPromise);
  }
  return photoUrlCache.get(photo.id);
}

function createElement(tagName, className, textContent) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (textContent) element.textContent = textContent;
  return element;
}

function buildPopupContent(photo) {
  const figure = createElement('figure', 'photo-popup');
  const link = createElement('a', 'photo-popup-link');
  link.target = '_blank';
  link.rel = 'noopener';
  const image = createElement('img', 'photo-popup-image');
  image.alt = photo.caption || 'Trip photo';
  image.hidden = true;
  link.append(image);

  const status = createElement('p', 'photo-popup-status muted', 'Loading photo…');
  const caption = createElement('figcaption');
  if (photo.caption) caption.append(createElement('strong', '', photo.caption), document.createElement('br'));
  const locationNote = photo.approximate ? ' · 📍 approximate' : '';
  caption.append(createElement('span', 'muted', `${formatTimestamp(photo.ts)} · ${timeAgo(photo.ts)}${locationNote}`));

  figure.append(link, status, caption);
  return { figure, link, image, status };
}

function showPhotoWhenOpened(marker, photo, dataRoot) {
  const content = buildPopupContent(photo);
  marker.bindPopup(content.figure, { minWidth: 240, maxWidth: 280 });
  marker.on('popupopen', async (event) => {
    try {
      const url = await loadPhotoUrl(photo, dataRoot);
      content.image.onload = () => event.popup.update();
      content.image.src = url;
      content.link.href = url;
      content.image.hidden = false;
      content.status.hidden = true;
    } catch (error) {
      console.error('Photo failed to load', error);
      content.status.textContent = 'Couldn’t load this photo. Tap the pin to try again.';
    }
  });
}

const photoIcon = () => L.divIcon({
  className: '',
  html: '<div class="photo-pin">📷</div>',
  iconSize: [30, 30],
  popupAnchor: [0, -14],
});

export function renderPhotos(layer, photos, dataRoot) {
  layer.clearLayers();
  photos.forEach((photo) => {
    const marker = L.marker([photo.lat, photo.lon], { icon: photoIcon(), zIndexOffset: 500 });
    showPhotoWhenOpened(marker, photo, dataRoot);
    marker.addTo(layer);
  });
}
