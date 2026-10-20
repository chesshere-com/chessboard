/*
 * Event wiring. Press handlers live on `cb-board` only; move/end handlers are
 * document-level so a pointer leaving the board still finishes the gesture.
 * Document gesture handlers exist only while a gesture is active.
 */

import type { State } from "./dom-state.ts";
import * as drag from "./drag.ts";
import * as draw from "./draw.ts";
import { cancelAnimation } from "./anim.ts";
import { memoizedBounds } from "./render.ts";

/** touchstart/touchmove must be non-passive or preventDefault silently no-ops. */
const ACTIVE: AddEventListenerOptions = { passive: false };

function isDrawGesture(e: Event): boolean {
  if (e.type === "touchstart") return false;
  const mouse = e as MouseEvent;
  return drag.isRightButton(e) || (mouse.shiftKey && mouse.button === 0);
}

function onPress(state: State, e: Event): void {
  if (state.dom.destroyed) return;
  // A press is the moment coordinates start to matter, and scroll-invalidation
  // can race a programmatic scroll (scrollIntoView then immediate click), so
  // never trust the memo across presses; one rect read per press is cheap.
  state.dom.bounds = memoizedBounds(state.dom.elements.board);
  if (isDrawGesture(e)) {
    draw.start(state, e);
    return;
  }
  const mouse = e as MouseEvent;
  if (e.type !== "touchstart" && mouse.button !== undefined && mouse.button !== 0) return;
  draw.cancel(state);
  draw.clearOnClick(state);
  drag.start(state, e);
}

export function bindEvents(state: State): () => void {
  const board = state.dom.elements.board;
  const wrap = state.dom.elements.wrap;

  let listening = false;
  const press = (e: Event): void => {
    if (state.draggable.current || state.drawable.current) return;
    onPress(state, e);
    if (state.draggable.current || state.drawable.current) listen();
  };
  const move = (e: Event): void => {
    drag.move(state, e);
    draw.move(state, e);
  };
  const release = (e: Event): void => {
    drag.end(state, e);
    draw.end(state, e);
    endGesture();
  };
  const abort = (): void => {
    drag.cancel(state);
    draw.cancel(state);
    endGesture();
  };
  const contextMenu = (e: Event): void => {
    if (state.disableContextMenu || state.drawable.enabled) e.preventDefault();
  };
  // Layout moved under the board without the board itself changing size.
  const invalidate = (): void => {
    state.dom.bounds = memoizedBounds(board);
  };

  board.addEventListener("touchstart", press, ACTIVE);
  board.addEventListener("mousedown", press, ACTIVE);
  wrap.addEventListener("contextmenu", contextMenu);

  function listen(): void {
    if (listening) return;
    listening = true;
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", release);
    document.addEventListener("touchmove", move, ACTIVE);
    document.addEventListener("touchend", release, ACTIVE);
    document.addEventListener("touchcancel", abort);
    window.addEventListener("blur", abort);
  }

  function endGesture(): void {
    if (state.draggable.current || state.drawable.current) return;
    listening = false;
    document.removeEventListener("mousemove", move);
    document.removeEventListener("mouseup", release);
    document.removeEventListener("touchmove", move, ACTIVE);
    document.removeEventListener("touchend", release, ACTIVE);
    document.removeEventListener("touchcancel", abort);
    window.removeEventListener("blur", abort);
  }
  state.dom.endGesture = endGesture;

  window.addEventListener("scroll", invalidate, { capture: true, passive: true });
  window.addEventListener("resize", invalidate, { passive: true });

  return () => {
    abort();
    cancelAnimation(state);
    state.dom.endGesture = undefined;
    board.removeEventListener("touchstart", press, ACTIVE);
    board.removeEventListener("mousedown", press, ACTIVE);
    wrap.removeEventListener("contextmenu", contextMenu);
    window.removeEventListener("scroll", invalidate, { capture: true });
    window.removeEventListener("resize", invalidate);
  };
}
