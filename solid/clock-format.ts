/*
 * Clock formatting. Kept JSX-free in a plain .ts file so it runs under the
 * `node --experimental-strip-types --test` runner alongside the core suite.
 */

const HOUR_MS = 3_600_000;
/** Below this, chess convention shows tenths so the flag-fall is readable. */
const TENTHS_BELOW_MS = 10_000;

function pad(value: number): string {
  return value < 10 ? `0${value}` : `${value}`;
}

/**
 * `h:mm:ss` at or above one hour, `m:ss` below it, `m:ss.t` under ten seconds.
 * Seconds truncate (a clock reading 0:08.5 still has 8.5s of thinking time);
 * negative and NaN inputs clamp to zero so a late server tick cannot render
 * a minus sign.
 */
export function formatClock(ms: number): string {
  const clamped = ms > 0 ? ms : 0;
  const totalSeconds = Math.floor(clamped / 1000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);

  if (clamped >= HOUR_MS) {
    return `${Math.floor(totalMinutes / 60)}:${pad(totalMinutes % 60)}:${pad(seconds)}`;
  }
  if (clamped < TENTHS_BELOW_MS) {
    return `${totalMinutes}:${pad(seconds)}.${Math.floor((clamped % 1000) / 100)}`;
  }
  return `${totalMinutes}:${pad(seconds)}`;
}
