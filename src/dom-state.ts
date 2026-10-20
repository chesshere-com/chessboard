/*
 * DOM-facing state. `HeadlessState` stays serialisable-ish plain data; every
 * field added here is live DOM or transient interaction bookkeeping.
 *
 * Each re-declared property is an intersection of the headless field with the
 * DOM extras, so `State` remains assignable to `HeadlessState` and the pure
 * core modules (board.ts, state.ts) operate on it unchanged.
 *
 * CSS class contract (shared by render.ts, svg.ts, drag.ts, draw.ts,
 * promotion.ts and assets/chess-board.css — change here, change everywhere):
 *
 *   wrap      cb-wrap, orientation-white | orientation-black, manipulable
 *   elements  cb-container, cb-board, cb-shapes-below, cb-shapes,
 *             cb-auto-pieces, cb-coords (+cb-coords-files/-ranks/-inside/
 *             -outside, cb-coord, cb-coord-light/-dark), cb-ghost
 *   squares   cb-selected, cb-move-dest, cb-premove-dest, cb-oc,
 *             cb-last-move, cb-check, cb-current-premove, cb-drag-over,
 *             cb-hl-<custom>
 *   pieces    <piece class="white knight">, cb-dragging, cb-anim, cb-fading
 *   shapes    cb-effect cb-effect-<kind>
 *   promotion cb-promotion, cb-promotion-choice, cb-promotion-cancel
 */

import type { Elements, Key, Piece, PxPos } from "./types.ts";
import type { HeadlessState } from "./state.ts";
import type { AnimPlan } from "./anim-plan.ts";

export interface DragCurrent {
  orig: Key;
  piece: Piece;
  /** page-relative pointer position when the drag started */
  origPos: PxPos;
  /** latched page-relative pointer position; the rAF loop reads this */
  pos: PxPos;
  /** true once the distance threshold was crossed */
  started: boolean;
  /**
   * A redraw can replace the piece node, so callers may hand a getter that
   * re-resolves it instead of a captured reference.
   */
  element: HTMLElement | (() => HTMLElement | undefined);
  ghost?: HTMLElement;
  previouslySelected?: Key;
  /**
   * Identifier of the finger that started the drag; absent for mouse drags.
   * Other fingers touching the page must not move or end this gesture.
   */
  touchId?: number;
  /** the pointer has visited a square other than `orig` at least once */
  keyHasChanged: boolean;
  holdStart: number;
}

export interface DrawCurrent {
  orig: Key;
  /** page-relative pointer position, latched by the rAF loop */
  pos: PxPos;
  dest?: Key;
  brush: string;
}

export interface AnimCurrent {
  start: number;
  /** 1 / duration; `elapsed * frequency` is the consumed fraction */
  frequency: number;
  plan: AnimPlan;
}

export interface DomState {
  elements: Elements;
  /** memoized board rect; cleared on resize/scroll and by updateBounds */
  bounds: () => DOMRect;
  /** rAF-debounced redraw */
  redraw: () => void;
  redrawNow: (skipSvg?: boolean) => void;
  unbind: () => void;
  endGesture?: () => void;
  destroyed: boolean;
}

export interface State extends HeadlessState {
  dom: DomState;
  draggable: HeadlessState["draggable"] & { current?: DragCurrent };
  animation: HeadlessState["animation"] & { current?: AnimCurrent };
  drawable: HeadlessState["drawable"] & { current?: DrawCurrent; prevSvgHash: string };
}

/** Local mirror of board.ts's deferral: consumers must not re-enter mid-update. */
export function callUserFunction<T extends unknown[]>(
  f: ((...args: T) => void) | undefined,
  ...args: T
): void {
  if (f) queueMicrotask(() => f(...args));
}

export function resolveDragElement(current: DragCurrent): HTMLElement | undefined {
  return typeof current.element === "function" ? current.element() : current.element;
}
