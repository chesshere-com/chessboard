/*
 * Pointer interaction: selection, click-move and drag.
 *
 * Two rules shape this file:
 * - Move/end handlers only *latch* coordinates; all reading of layout and all
 *   writing of style happens in a self-rescheduling rAF loop, so a fast
 *   pointer cannot force one layout per event.
 * - Touch must not steal page scrolling. `touchstart` only calls
 *   preventDefault when the touch actually landed near something the user can
 *   move (or a selection is already open); otherwise the board declines the
 *   gesture and the page scrolls normally.
 */

import type { Key, PxPos } from "./types.ts";
import type { DragCurrent, State } from "./dom-state.ts";
import { callUserFunction, resolveDragElement } from "./dom-state.ts";
import {
  isMovable,
  isPremovable,
  setSelected,
  unselect,
  unsetPremove,
  userMove,
  whitePov,
} from "./board.ts";
import { computeSquareCenter, getKeyAtDomPos, samePiece } from "./geometry.ts";
import { hoveredDragDest } from "./render.ts";
import { cancelAnimAt } from "./anim.ts";
import { invalidateDests } from "./state.ts";

/** Last square the drag hovered, per drag; a change triggers one redraw. */
const lastHover = new WeakMap<DragCurrent, Key | undefined>();

export function eventPosition(e: Event): PxPos | undefined {
  const touch = e as TouchEvent;
  if (touch.touches && touch.touches.length > 0) {
    return [touch.touches[0].clientX, touch.touches[0].clientY];
  }
  if (touch.changedTouches && touch.changedTouches.length > 0) {
    return [touch.changedTouches[0].clientX, touch.changedTouches[0].clientY];
  }
  const mouse = e as MouseEvent;
  if (typeof mouse.clientX === "number") return [mouse.clientX, mouse.clientY];
  return undefined;
}

function isTouchEvent(e: Event): boolean {
  return e.type.startsWith("touch");
}

function touchById(list: TouchList | undefined, id: number): Touch | undefined {
  if (!list) return undefined;
  for (let i = 0; i < list.length; i++) {
    if (list[i].identifier === id) return list[i];
  }
  return undefined;
}

/**
 * A second finger resting on the page also appears in `touches`, so a drag
 * follows only the finger it started with; every other touch is invisible to
 * it. Undefined means "this event is not about that finger".
 */
function dragPosition(current: DragCurrent, e: Event): PxPos | undefined {
  if (current.touchId === undefined || !isTouchEvent(e)) return eventPosition(e);
  const touch = e as TouchEvent;
  const list = e.type === "touchmove" ? touch.touches : touch.changedTouches;
  const finger = touchById(list, current.touchId);
  return finger ? [finger.clientX, finger.clientY] : undefined;
}

export function isRightButton(e: Event): boolean {
  const mouse = e as MouseEvent;
  return mouse.buttons === 2 || mouse.button === 2;
}

export function isTrusted(state: State, e: Event): boolean {
  return e.isTrusted || state.trustAllEvents;
}

interface PieceNode extends HTMLElement {
  cbKey?: Key;
  cbFading?: boolean;
}

function pieceElementAt(state: State, key: Key): HTMLElement | undefined {
  const board = state.dom.elements.board;
  for (const child of Array.from(board.children)) {
    if (child.nodeName !== "PIECE") continue;
    const node = child as PieceNode;
    if (node.cbKey === key && !node.cbFading) return node;
  }
  return undefined;
}

/**
 * Touch arbitration: a grab counts as board interaction only if a movable
 * piece sits within `touchIgnoreRadius` square-halves (measured to the square
 * centre, hence the sqrt(2) for the corner reach) of the finger.
 */
function nearMovablePiece(state: State, position: PxPos): boolean {
  const bounds = state.dom.bounds();
  const radius = (state.draggable.touchIgnoreRadius * (bounds.width / 8)) / 2 * Math.SQRT2;
  if (radius <= 0) return false;
  const asWhite = whitePov(state);
  for (const key of state.pieces.keys()) {
    if (!isMovable(state, key) && !isPremovable(state, key)) continue;
    const centre = computeSquareCenter(key, asWhite, bounds);
    const dx = centre[0] - position[0];
    const dy = centre[1] - position[1];
    if (dx * dx + dy * dy <= radius * radius) return true;
  }
  return false;
}

/**
 * Click-move / selection. `force` lets the API move a piece the current
 * `selectable` setting would not. Returns true when the press played a move,
 * stored a premove or raised a promotion choice.
 */
export function selectSquare(state: State, key: Key, force?: boolean): boolean {
  const previous = state.selected;
  if (previous !== undefined) {
    if (previous === key) {
      // A second press on the selected square only deselects on release, so a
      // drag starting there is still possible.
      if (!state.draggable.current) unselect(state);
      return false;
    }
    if (state.selectable.enabled || force) {
      if (userMove(state, previous, key, false)) {
        state.stats.dragged = false;
        return true;
      }
    }
  }
  if (isMovable(state, key) || isPremovable(state, key)) {
    setSelected(state, key);
    callUserFunction(state.events.select, key);
  } else {
    unselect(state);
  }
  return false;
}

/**
 * A gesture is over and nothing came of it: the user pressed an empty or
 * unselectable square, dropped the piece back or onto a square that is no
 * target, or tapped the selected piece again. The board is idle, so a stored
 * premove goes with it, and events.cancel lets a caller that keeps its own
 * premoves do the same. Picking a piece up or selecting another one ends
 * nothing: the drop decides, which is why start() skips this while a drag is
 * in flight. API calls (cancelMove, stop, set) never pass through here; they
 * are the caller's own doing.
 */
function settle(state: State, acted: boolean): void {
  if (acted || state.selected !== undefined || state.draggable.current) return;
  unsetPremove(state);
  callUserFunction(state.events.cancel);
}

function showGhost(state: State, current: DragCurrent): void {
  const ghost = state.dom.elements.ghost;
  if (!ghost || !state.draggable.showGhost || current.ghost) return;
  const bounds = state.dom.bounds();
  const size = bounds.width / 8;
  const origin = pieceElementAt(state, current.orig);
  ghost.className = `cb-ghost ${current.piece.color} ${current.piece.role}`;
  ghost.style.width = `${size}px`;
  ghost.style.height = `${size}px`;
  // The origin element already carries the correct board-relative transform.
  ghost.style.transform = origin ? origin.style.transform : "";
  ghost.style.display = "block";
  current.ghost = ghost;
}

function hideGhost(state: State): void {
  const ghost = state.dom.elements.ghost;
  if (ghost) ghost.style.display = "";
}

const frames = new WeakMap<State, number>();

function cancelFrame(state: State): void {
  const frame = frames.get(state);
  if (frame !== undefined) cancelAnimationFrame(frame);
  frames.delete(state);
}

function processDrag(state: State): void {
  frames.set(state, requestAnimationFrame(() => {
    frames.delete(state);
    const current = state.draggable.current;
    if (!current || state.dom.destroyed) return;

    // The piece left its square between frames (a caller rewrote the pieces
    // outside the api, or an animation plan moved it); nothing left to drop.
    const at = state.pieces.get(current.orig);
    if (!at || !samePiece(at, current.piece)) {
      cancel(state);
      return;
    }

    if (!current.started) {
      const dx = current.pos[0] - current.origPos[0];
      const dy = current.pos[1] - current.origPos[1];
      const threshold = state.draggable.distance;
      if (dx * dx + dy * dy >= threshold * threshold) current.started = true;
    }

    if (current.started) {
      showGhost(state, current);
      const element = resolveDragElement(current);
      if (element) {
        const bounds = state.dom.bounds();
        const size = bounds.width / 8;
        const x = current.pos[0] - bounds.left - size / 2;
        const y = current.pos[1] - bounds.top - size / 2;
        element.classList.add("cb-dragging");
        element.style.transform = `translate(${x}px,${y}px) scale(${state.draggable.liftScale})`;
      }

      const key = getKeyAtDomPos(current.pos, whitePov(state), state.dom.bounds());
      if (key && key !== current.orig) current.keyHasChanged = true;

      // Highlighting the hovered target is a square-class change, so it goes
      // through the normal (rAF-debounced) redraw rather than ad-hoc DOM edits.
      const hover = hoveredDragDest(state);
      if (lastHover.get(current) !== hover) {
        lastHover.set(current, hover);
        state.dom.redraw();
      }
    }

    processDrag(state);
  }));
}

export function start(state: State, e: Event): void {
  if (!isTrusted(state, e)) return;
  const mouse = e as MouseEvent;
  const isTouch = e.type === "touchstart";
  if (!isTouch && mouse.button !== undefined && mouse.button !== 0) return;
  const touch = e as TouchEvent;
  if (isTouch && touch.touches && touch.touches.length > 1) return;

  const position = eventPosition(e);
  if (!position) return;
  const bounds = state.dom.bounds();
  const orig = getKeyAtDomPos(position, whitePov(state), bounds);
  if (!orig) return;

  const previouslySelected = state.selected;
  const shouldPrevent =
    e.cancelable &&
    (!isTouch || previouslySelected !== undefined || nearMovablePiece(state, position));
  // Declining the gesture entirely is what lets a correspondence board scroll.
  if (isTouch && !shouldPrevent) return;
  if (shouldPrevent) e.preventDefault();

  const piece = state.pieces.get(orig);
  const canDrag =
    !state.viewOnly && (isTouch ? state.draggable.touch : state.draggable.mouse);

  if (piece && canDrag && (isMovable(state, orig) || isPremovable(state, orig))) {
    const current: DragCurrent = {
      orig,
      piece,
      origPos: position,
      pos: position,
      // autoDistance drops the threshold to zero once the user has proven they
      // drag rather than tap.
      started: state.draggable.autoDistance && state.stats.dragged,
      element: () => pieceElementAt(state, orig),
      previouslySelected,
      keyHasChanged: false,
      holdStart: performance.now(),
    };
    if (isTouch) {
      const started = touch.changedTouches?.[0] ?? touch.touches?.[0];
      if (started) current.touchId = started.identifier;
    }
    state.draggable.current = current;
    cancelAnimAt(state, orig);
    cancelFrame(state);
    processDrag(state);
  }

  let acted = false;
  if (!state.viewOnly && state.selectable.enabled) {
    acted = selectSquare(state, orig);
  } else if (!state.viewOnly && piece && (isMovable(state, orig) || isPremovable(state, orig))) {
    // Click-move is off but the drag still needs its destination hints.
    setSelected(state, orig);
  }

  // The press completed a click-move onto this square (a capture, a castle
  // by king-onto-rook): the piece under the pointer is no longer the one the
  // drag was set up for, so the drag ends here rather than judging a second
  // move, or a dismissal, on release.
  if (acted && state.draggable.current) finishDrag(state, state.draggable.current);

  // A press that picked a piece up is not over yet: end() settles it. A
  // view-only board has no input to settle.
  if (!state.viewOnly && !state.draggable.current) settle(state, acted);

  state.dom.redraw();
}

export function move(state: State, e: Event): void {
  const current = state.draggable.current;
  if (!current) return;
  const position = dragPosition(current, e);
  if (position) current.pos = position;
}

export function end(state: State, e: Event): void {
  const current = state.draggable.current;
  if (!current) return;
  const position = dragPosition(current, e);
  // Another finger lifting is not this drag's release; suppressing its default
  // would break whatever gesture that finger belonged to.
  if (position === undefined && current.touchId !== undefined && isTouchEvent(e)) return;
  // Preventing the default on touchend suppresses the synthetic mouse events
  // the browser fires afterwards, which would otherwise re-select the square.
  if (e.type === "touchend" && e.cancelable) e.preventDefault();

  const release = position ?? current.pos;
  const dest = getKeyAtDomPos(release, whitePov(state), state.dom.bounds());

  // A flick can complete inside a single frame, so the rAF loop may never have
  // run; decide `started` from the release point rather than losing the move.
  if (!current.started) {
    const dx = release[0] - current.origPos[0];
    const dy = release[1] - current.origPos[1];
    const threshold = state.draggable.distance;
    if (dx * dx + dy * dy >= threshold * threshold) current.started = true;
  }

  finishDrag(state, current);

  let acted = false;
  if (current.started) {
    state.stats.dragged = true;
    if (dest && dest !== current.orig) {
      acted = userMove(state, current.orig, dest, true, performance.now() - current.holdStart);
    } else if (!dest && state.draggable.deleteOnDropOff && !state.viewOnly) {
      state.pieces.delete(current.orig);
      state.positionVersion++;
      state.promotion.current = undefined;
      state.movable.dests = undefined;
      invalidateDests(state);
      unselect(state);
      callUserFunction(state.events.change);
      // An edit, not a dismissal.
      acted = true;
    } else if (current.keyHasChanged || current.previouslySelected === current.orig) {
      unselect(state);
    }
  } else if (current.previouslySelected === current.orig && state.selected === current.orig) {
    // Tap-tap on the same square deselects; deferred to release so the first
    // tap can still become a drag.
    unselect(state);
  }

  settle(state, acted);
  state.dom.redraw();
}

function finishDrag(state: State, current: DragCurrent): void {
  cancelFrame(state);
  state.draggable.current = undefined;
  state.dom.endGesture?.();
  lastHover.delete(current);
  hideGhost(state);
  const element = resolveDragElement(current);
  if (element) {
    element.classList.remove("cb-dragging");
    // render() reasserts the square-anchored transform on the next pass.
    element.style.transform = "";
  }
}

/**
 * A position update landed mid-drag: the opponent moved, the server
 * reconciled, the caller navigated. The gesture belongs to the user, not to
 * the position, so as long as the piece they picked up still sits on its
 * origin the drag goes on and the drop is judged against the new position.
 * configure() already keeps a selection whose piece can still act; re-selecting
 * the origin here also covers a surviving piece that no longer can, so the drag
 * keeps its hints and the drop is judged by userMove (setSelected, not
 * selectSquare: this is not a user selection and must not fire events.select).
 * A piece that vanished from its origin (captured, taken back) leaves nothing
 * to drop, so the drag ends now rather than a frame later.
 */
export function reconcile(state: State): void {
  const current = state.draggable.current;
  if (!current) return;
  const piece = state.pieces.get(current.orig);
  if (!piece || !samePiece(piece, current.piece)) {
    cancel(state);
    return;
  }
  setSelected(state, current.orig);
}

/** Abort an in-flight drag without applying it (api.stop / destroy / cancelMove). */
export function cancel(state: State): void {
  cancelFrame(state);
  state.dom.endGesture?.();
  const current = state.draggable.current;
  if (!current) return;
  finishDrag(state, current);
  unselect(state);
  state.dom.redraw();
}
