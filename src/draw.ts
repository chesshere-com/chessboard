/*
 * User shape drawing: right-drag (or shift+left-drag) paints an arrow between
 * two squares, or a circle when press and release land on the same square.
 *
 * Brush choice is a two-bit index into `drawable.brushSelectors`, so the same
 * gesture with modifiers yields the four conventional colours. Committing uses
 * toggle semantics — redrawing an identical shape erases it, redrawing it in
 * another colour recolours it — and only ever touches `drawable.shapes`;
 * `autoShapes` belong to the app and survive every user erase.
 */

import type { Key, Shape } from "./types.ts";
import type { DrawCurrent, State } from "./dom-state.ts";
import { callUserFunction } from "./dom-state.ts";
import { whitePov } from "./board.ts";
import { getKeyAtDomPos } from "./geometry.ts";
import { eventPosition, isRightButton, isTrusted } from "./drag.ts";

function brushForEvent(state: State, e: Event): string {
  const mouse = e as MouseEvent;
  const right = isRightButton(e);
  const index =
    ((mouse.shiftKey || mouse.ctrlKey) && right ? 1 : 0) + (mouse.altKey || mouse.metaKey ? 2 : 0);
  return state.drawable.brushSelectors[index] ?? state.drawable.brushSelectors[0];
}

function brushKeyOf(shape: Shape): string | undefined {
  return shape.type === "arrow" || shape.type === "circle" ? shape.brush : undefined;
}

function sameGeometry(a: Shape, b: Shape): boolean {
  if (a.type === "arrow" && b.type === "arrow") return a.from === b.from && a.to === b.to;
  if (a.type === "circle" && b.type === "circle") return a.square === b.square;
  return false;
}

function commit(state: State, shape: Shape): void {
  const shapes = state.drawable.shapes;
  const index = shapes.findIndex((existing) => sameGeometry(existing, shape));
  let next: Shape[];
  if (index === -1) next = [...shapes, shape];
  else if (brushKeyOf(shapes[index]) === brushKeyOf(shape)) {
    next = shapes.filter((_, i) => i !== index);
  } else {
    next = shapes.map((existing, i) => (i === index ? shape : existing));
  }
  state.drawable.shapes = next;
  callUserFunction(state.drawable.onChange, next);
}

const frames = new WeakMap<State, number>();

function cancelFrame(state: State): void {
  const frame = frames.get(state);
  if (frame !== undefined) cancelAnimationFrame(frame);
  frames.delete(state);
}

function processDraw(state: State): void {
  frames.set(state, requestAnimationFrame(() => {
    frames.delete(state);
    const current = state.drawable.current;
    if (!current || state.dom.destroyed) return;
    const key = getKeyAtDomPos(current.pos, whitePov(state), state.dom.bounds());
    const dest: Key | undefined = key && key !== current.orig ? key : undefined;
    if (dest !== current.dest) {
      current.dest = dest;
      state.dom.redraw();
    }
    processDraw(state);
  }));
}

export function start(state: State, e: Event): void {
  if (!isTrusted(state, e)) return;
  if (!state.drawable.enabled) return;
  if (e.cancelable) e.preventDefault();

  const position = eventPosition(e);
  if (!position) return;
  const orig = getKeyAtDomPos(position, whitePov(state), state.dom.bounds());
  if (!orig) return;

  const current: DrawCurrent = { orig, pos: position, brush: brushForEvent(state, e) };
  state.drawable.current = current;
  cancelFrame(state);
  processDraw(state);
  state.dom.redraw();
}

export function move(state: State, e: Event): void {
  const current = state.drawable.current;
  if (current) {
    const position = eventPosition(e);
    if (position) current.pos = position;
  }
}

export function end(state: State, e?: Event): void {
  const current = state.drawable.current;
  if (!current) return;
  cancelFrame(state);
  state.drawable.current = undefined;
  state.dom.endGesture?.();
  const position = (e && eventPosition(e)) ?? current.pos;
  const key = getKeyAtDomPos(position, whitePov(state), state.dom.bounds());
  current.dest = key && key !== current.orig ? key : undefined;
  const shape: Shape = current.dest
    ? { type: "arrow", from: current.orig, to: current.dest, brush: current.brush }
    : { type: "circle", square: current.orig, brush: current.brush };
  commit(state, shape);
  state.dom.redraw();
}

export function cancel(state: State): void {
  cancelFrame(state);
  state.dom.endGesture?.();
  if (!state.drawable.current) return;
  cancelFrame(state);
  state.drawable.current = undefined;
  state.dom.endGesture?.();
  state.dom.redraw();
}

/** A plain left click wipes the user's scribbles; autoShapes are untouched. */
export function clearOnClick(state: State): void {
  if (!state.drawable.enabled || !state.drawable.eraseOnClick) return;
  if (state.drawable.shapes.length === 0) return;
  state.drawable.shapes = [];
  callUserFunction(state.drawable.onChange, []);
}
