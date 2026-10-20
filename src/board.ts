/*
 * Headless move execution. No DOM: the render/drag layers call into these and
 * then reconcile pixels. Legality comes from `movable.dests`; the only rules
 * this file owns are premove geometry, castling rewriting and promotion
 * detection.
 */

import type { Key, MoveMetadata, Piece, PromotionRole } from "./types.ts";
import type { HeadlessState } from "./state.ts";
import {
  destinations,
  invalidateDests,
  isMovable,
  isPremovable,
  unselect,
} from "./state.ts";

// The selection rules live with the headless state so configure() can apply
// them; re-exported here because they read as board rules to callers.
export { isMovable, isPremovable, setSelected, unselect } from "./state.ts";
import { key2pos, opposite, pos2key } from "./geometry.ts";
import { premove } from "./premove.ts";

// User callbacks are deferred so a consumer calling back into the board
// (set/move) cannot re-enter a half-applied state change.
function callUserFunction<T extends unknown[]>(
  f: ((...args: T) => void) | undefined,
  ...args: T
): void {
  if (f) queueMicrotask(() => f(...args));
}

export function whitePov(state: HeadlessState): boolean {
  return state.orientation === "white";
}

export function canMove(state: HeadlessState, orig: Key, dest: Key): boolean {
  if (orig === dest || !isMovable(state, orig)) return false;
  if (state.movable.free) return true;
  return destinations(state, orig)?.includes(dest) === true;
}

export function canPremove(state: HeadlessState, orig: Key, dest: Key): boolean {
  if (orig === dest || !isPremovable(state, orig)) return false;
  return premove(state.pieces, orig, state.variant.key, state.premovable.filter).includes(dest);
}

/**
 * The one place a stored premove is dropped: every clear path routes here so
 * `premovable.events.unset` cannot be skipped by a caller clearing the field.
 */
export function unsetPremove(state: HeadlessState): void {
  if (!state.premovable.current) return;
  state.premovable.current = undefined;
  callUserFunction(state.premovable.events.unset);
}

/**
 * Rewrites a king-onto-rook (or classical e-file two-square) input into the
 * canonical castled placement. Returns false when the move is not a castle.
 */
function tryAutoCastle(state: HeadlessState, orig: Key, dest: Key): boolean {
  if (!state.movable.rookCastle) return false;
  const king = state.pieces.get(orig);
  if (!king || king.role !== "king") return false;
  const origPos = key2pos(orig);
  const destPos = key2pos(dest);
  const backRank = king.color === "white" ? 0 : 7;
  if (origPos[1] !== backRank || destPos[1] !== backRank) return false;

  let rookKey = dest;
  if (origPos[0] === 4 && !state.pieces.has(dest)) {
    if (destPos[0] === 6) rookKey = pos2key([7, backRank]);
    else if (destPos[0] === 2) rookKey = pos2key([0, backRank]);
  }
  const rook = state.pieces.get(rookKey);
  if (!rook || rook.color !== king.color || rook.role !== "rook") return false;

  // Side is decided by where the target square sits relative to the king, so
  // 960 layouts (king b1, rook c1) castle kingside like the classical form.
  const kingSide = origPos[0] < destPos[0];
  state.pieces.delete(orig);
  state.pieces.delete(rookKey);
  state.pieces.set(pos2key([kingSide ? 6 : 2, backRank]), king);
  state.pieces.set(pos2key([kingSide ? 5 : 3, backRank]), rook);
  return true;
}

export function baseMove(state: HeadlessState, orig: Key, dest: Key): Piece | boolean {
  const origPiece = state.pieces.get(orig);
  const destPiece = state.pieces.get(dest);
  if (orig === dest || !origPiece) return false;

  const captured = destPiece && destPiece.color !== origPiece.color ? destPiece : undefined;
  if (dest === state.selected) unselect(state);

  if (!tryAutoCastle(state, orig, dest)) {
    state.pieces.set(dest, origPiece);
    state.pieces.delete(orig);
  }
  state.promotion.current = undefined;
  state.positionVersion++;
  invalidateDests(state);
  state.lastMove = [orig, dest];
  state.check = undefined;
  state.turnColor = opposite(origPiece.color);
  // Destination lists always belong to a position; the caller supplies fresh
  // ones for the new one.
  state.movable.dests = undefined;

  callUserFunction(state.events.move, orig, dest, captured);
  callUserFunction(state.events.change);
  return captured || true;
}

function isPromotionMove(state: HeadlessState, orig: Key, dest: Key): boolean {
  const piece = state.pieces.get(orig);
  if (!piece || piece.role !== "pawn") return false;
  return key2pos(dest)[1] === (piece.color === "white" ? 7 : 0);
}

function commitMove(
  state: HeadlessState,
  orig: Key,
  dest: Key,
  meta: { premove: boolean; byDrag: boolean; promotion?: PromotionRole; holdTime?: number },
): boolean {
  const result = baseMove(state, orig, dest);
  if (!result) return false;
  if (meta.promotion) {
    const piece = state.pieces.get(dest);
    if (piece) state.pieces.set(dest, { color: piece.color, role: meta.promotion });
  }
  unselect(state);
  const metadata: MoveMetadata = {
    premove: meta.premove,
    byDrag: meta.byDrag,
  };
  if (result !== true) metadata.captured = result;
  if (meta.promotion) metadata.promotion = meta.promotion;
  if (meta.holdTime !== undefined) metadata.holdTime = meta.holdTime;
  callUserFunction(state.movable.events.after, orig, dest, metadata);
  return true;
}

function attemptMove(
  state: HeadlessState,
  orig: Key,
  dest: Key,
  byDrag: boolean,
  isPremove: boolean,
  holdTime?: number,
): boolean {
  if (isPromotionMove(state, orig, dest)) {
    const color = state.pieces.get(orig)!.color;
    if (state.promotion.autoQueen) {
      return commitMove(state, orig, dest, {
        premove: isPremove,
        byDrag,
        promotion: "queen",
        holdTime,
      });
    }
    // The choice is pending: the DOM dialog (or the caller, via onRequired)
    // resolves it through finishPromotion, which commits the move.
    const pending: NonNullable<HeadlessState["promotion"]["current"]> = {
      requestId: ++state.promotionSequence,
      version: state.positionVersion,
      orig,
      dest,
      color,
      premove: isPremove,
      byDrag,
    };
    // Assigned conditionally so the record keeps the same shape as before when
    // the move did not come from a drag.
    if (holdTime !== undefined) pending.holdTime = holdTime;
    state.promotion.current = pending;
    if (!state.promotion.dialog) callUserFunction(state.promotion.onRequired, orig, dest, color, pending.requestId);
    return true;
  }
  return commitMove(state, orig, dest, { premove: isPremove, byDrag, holdTime });
}

export function userMove(
  state: HeadlessState,
  orig: Key,
  dest: Key,
  byDrag: boolean,
  /** ms the piece was held before release; drag layer only. */
  holdTime?: number,
): boolean {
  if (canMove(state, orig, dest)) return attemptMove(state, orig, dest, byDrag, false, holdTime);
  if (canPremove(state, orig, dest)) {
    state.premovable.current = { from: orig, to: dest };
    unselect(state);
    callUserFunction(state.premovable.events.set, orig, dest);
    return true;
  }
  unselect(state);
  return false;
}

export function finishPromotion(state: HeadlessState, role: PromotionRole, requestId?: number): boolean {
  const pending = state.promotion.current;
  if (!pending || (requestId !== undefined && requestId !== pending.requestId)) return false;
  state.promotion.current = undefined;
  if (pending.version !== state.positionVersion ||
      !["queen", "rook", "bishop", "knight"].includes(role) ||
      !canMove(state, pending.orig, pending.dest)) return false;
  return commitMove(state, pending.orig, pending.dest, {
    premove: pending.premove === true,
    byDrag: pending.byDrag === true,
    promotion: role,
    holdTime: pending.holdTime,
  });
}

export function playPremove(state: HeadlessState): boolean {
  const move = state.premovable.current;
  if (!move) return false;
  let played = false;
  if (canMove(state, move.from, move.to)) {
    played = attemptMove(state, move.from, move.to, false, true);
  }
  unsetPremove(state);
  return played;
}

export function stop(state: HeadlessState): void {
  state.movable.color = undefined;
  state.movable.dests = undefined;
  state.movable.getDests = undefined;
  state.promotion.current = undefined;
  unsetPremove(state);
  unselect(state);
}
