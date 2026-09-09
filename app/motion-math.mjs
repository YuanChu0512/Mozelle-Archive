/** Absolute deadlines avoid throwing away the remainder at 60/120/144 Hz. */
export function nextFrameDeadline(now, previousDeadline, interval) {
  if (!previousDeadline || now - previousDeadline > interval * 2) return now + interval;
  return previousDeadline + interval;
}

/** Equivalent response over elapsed time, independent of monitor refresh rate. */
export function dampingFactor(rate, elapsedMs) {
  return 1 - Math.exp(-rate * Math.max(0, Math.min(elapsedMs, 80)) / 1000);
}

/** Last section whose start has crossed the same reading line in either direction. */
export function activeSectionIndex(offsets, position, atBottom = false) {
  if (atBottom) return Math.max(0, offsets.length - 1);
  let low = 0;
  let high = offsets.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (offsets[mid] <= position) low = mid + 1;
    else high = mid;
  }
  return Math.max(0, low - 1);
}
