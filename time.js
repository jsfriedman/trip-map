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
