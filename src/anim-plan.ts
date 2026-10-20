/*
 * Two-snapshot animation planning. Given the position before and after a
 * change, decide which arriving pieces slide (and from where) and which
 * departing pieces cross-fade.
 *
 * The plan is orientation-free: vectors are in board-square units from
 * white's perspective and the DOM layer applies the flip.
 */

import type { Key, Piece, Pieces, Pos } from "./types.ts";
import { distanceSq, key2pos, samePiece } from "./geometry.ts";

/** [goalDx, goalDy, currentDx, currentDy] in square units. */
export type AnimVector = [number, number, number, number];

export interface AnimPlan {
  anims: Map<Key, AnimVector>;
  fadings: Map<Key, Piece>;
}

interface Departure {
  key: Key;
  pos: Pos;
  piece: Piece;
}

export function computePlan(prevPieces: Pieces, currentPieces: Pieces): AnimPlan {
  const anims: Map<Key, AnimVector> = new Map();
  const fadings: Map<Key, Piece> = new Map();
  const arrivals: { key: Key; pos: Pos; piece: Piece }[] = [];
  const departures: Departure[] = [];

  for (const [key, piece] of currentPieces) {
    const before = prevPieces.get(key);
    if (!before || !samePiece(before, piece)) {
      arrivals.push({ key, pos: key2pos(key), piece });
    }
  }
  for (const [key, piece] of prevPieces) {
    const after = currentPieces.get(key);
    if (!after || !samePiece(after, piece)) {
      departures.push({ key, pos: key2pos(key), piece });
    }
  }

  const consumed = new Set<Key>();
  for (const arrival of arrivals) {
    let best: Departure | undefined;
    let bestDistance = Infinity;
    for (const departure of departures) {
      if (consumed.has(departure.key)) continue;
      if (!samePiece(departure.piece, arrival.piece)) continue;
      const distance = distanceSq(departure.pos, arrival.pos);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = departure;
      }
    }
    if (!best) continue;
    consumed.add(best.key);
    const dx = best.pos[0] - arrival.pos[0];
    const dy = best.pos[1] - arrival.pos[1];
    anims.set(arrival.key, [dx, dy, dx, dy]);
  }

  for (const departure of departures) {
    if (!consumed.has(departure.key)) fadings.set(departure.key, departure.piece);
  }

  return { anims, fadings };
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
