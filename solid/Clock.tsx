/*
 * Clock display. Pure presentation: no interval, no internal countdown — the
 * caller owns time state (this matches ActiveGame, where the authoritative
 * remaining time arrives from the server and a local ticker drives the signal).
 */

import { formatClock } from "./clock-format.ts";

/**
 * Reserved: the clock renders digits only today. Kept in the signature so
 * adding a screen-reader string later is not a breaking API change.
 */
export type ClockLabels = Record<string, string>;

export interface ClockProps {
  ms: number;
  /** Purely cosmetic; drives .cb-clock-running, not a timer. */
  running?: boolean;
  /** Threshold for the low-time treatment. Default 10000. */
  lowTimeMs?: number;
  labels?: ClockLabels;
  class?: string;
}

export function Clock(props: ClockProps) {
  const low = (): boolean => props.ms < (props.lowTimeMs ?? 10_000);

  return (
    <span
      class={`cb-clock${props.class ? ` ${props.class}` : ""}`}
      classList={{ "cb-clock-low": low(), "cb-clock-running": props.running === true }}
      role="timer"
      // The digits change up to ten times a second under 10s; announcing every
      // tick would flood a screen reader.
      aria-live="off"
    >
      {formatClock(props.ms)}
    </span>
  );
}
