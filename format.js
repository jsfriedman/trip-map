const relativeTimeFormat = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const RELATIVE_UNITS = [
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
];

export function timeAgo(timestampMs, nowMs = Date.now()) {
  const elapsedMs = nowMs - timestampMs;
  for (const [unit, unitMs] of RELATIVE_UNITS) {
    if (Math.abs(elapsedMs) >= unitMs) {
      return relativeTimeFormat.format(-Math.round(elapsedMs / unitMs), unit);
    }
  }
  return 'just now';
}

export function formatTimestamp(timestampMs) {
  return new Date(timestampMs).toLocaleString([], {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export function formatDateRange(startTs, endTs) {
  const formatDate = (timestampMs) => new Date(timestampMs).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  const start = formatDate(startTs);
  const end = formatDate(endTs);
  return start === end ? start : `${start} – ${end}`;
}

export const pluralize = (count, singular, plural) => `${count} ${count === 1 ? singular : plural}`;
