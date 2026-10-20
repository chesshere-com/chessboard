/*
 * Move animation driver.
 *
 * `animate` wraps any state mutation: it snapshots the position, applies the
 * mutation, then diffs the two snapshots into a plan. Because the plan is
 * recomputed from the *result*, a second change landing mid-flight (a racing
 * server move) simply replaces the plan and the pieces converge — there is no
 * queue to get out of order and nothing is ever rebuilt from scratch.
 */

import type { Key, Pieces } from "./types.ts";
import type { State } from "./dom-state.ts";
import { computePlan, easeInOutCubic } from "./anim-plan.ts";

/** Below this the animation is shorter than a couple of frames; skip it. */
const MIN_DURATION = 40;

const frames = new WeakMap<State, number>();

export function cancelAnimation(state: State): void {
  const frame = frames.get(state);
  if (frame !== undefined) cancelAnimationFrame(frame);
  frames.delete(state);
  state.animation.current = undefined;
}

function step(state: State): void {
  frames.set(state, requestAnimationFrame((now) => {
    frames.delete(state);
    if (state.dom.destroyed) return;
    const current = state.animation.current;
    if (!current) {
      state.dom.redrawNow();
      return;
    }
    const remaining = 1 - (now - current.start) * current.frequency;
    if (remaining <= 0) {
      cancelAnimation(state);
      state.dom.redrawNow();
      return;
    }
    const eased = easeInOutCubic(remaining);
    for (const vector of current.plan.anims.values()) {
      vector[2] = vector[0] * eased;
      vector[3] = vector[1] * eased;
    }
    // Shapes do not move during a piece animation; skipping the SVG layer is
    // most of the per-frame cost.
    state.dom.redrawNow(true);
    step(state);
  }));
}

export function animate(mutation: (state: State) => void, state: State): void {
  const previous: Pieces = new Map(state.pieces);

  mutation(state);

  const plan = computePlan(previous, state.pieces);
  const duration = state.animation.duration;
  const worthAnimating = plan.anims.size > 0 || plan.fadings.size > 0;

  if (!worthAnimating || !state.animation.enabled || duration < MIN_DURATION) {
    cancelAnimation(state);
    state.dom.redraw();
    return;
  }

  const wasRunning = frames.has(state);
  state.animation.current = { start: performance.now(), frequency: 1 / duration, plan };
  // The running loop re-reads `animation.current` every frame, so replacing the
  // plan is enough; a second loop would double the frame rate and the easing.
  if (!wasRunning) step(state);
  else state.dom.redraw();
}

/** A piece the user picked up must follow the pointer, not the plan. */
export function cancelAnimAt(state: State, key: Key): void {
  const current = state.animation.current;
  if (!current) return;
  current.plan.anims.delete(key);
  current.plan.fadings.delete(key);
  if (current.plan.anims.size === 0 && current.plan.fadings.size === 0) {
    cancelAnimation(state);
  }
}
