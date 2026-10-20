/*
 * Pseudo-legal premove geometry.
 *
 * Deliberately permissive: a premove is played AFTER the opponent moves, so
 * paths that look blocked now may be clear then, and a friendly-occupied
 * square may be vacated. We therefore ignore occupancy entirely except for
 * castling (which needs to see own rooks). Callers narrow further through the
 * `filter` hook.
 */

import type { Key, Pieces, Pos } from "./types.ts";
import { allKeys, key2pos } from "./geometry.ts";

export type VariantKey = "standard" | "chess960" | "threeCheck";

type Mobility = (x1: number, y1: number, x2: number, y2: number) => boolean;

function diff(a: number, b: number): number {
  return Math.abs(a - b);
}

const knight: Mobility = (x1, y1, x2, y2) => {
  const xd = diff(x1, x2);
  const yd = diff(y1, y2);
  return xd * yd === 2;
};

const bishop: Mobility = (x1, y1, x2, y2) => diff(x1, x2) === diff(y1, y2) && x1 !== x2;

const rook: Mobility = (x1, y1, x2, y2) => (x1 === x2) !== (y1 === y2);

const queen: Mobility = (x1, y1, x2, y2) =>
  bishop(x1, y1, x2, y2) || rook(x1, y1, x2, y2);

function pawn(color: "white" | "black"): Mobility {
  return (x1, y1, x2, y2) => {
    if (diff(x1, x2) > 1) return false;
    if (color === "white") {
      if (y2 <= y1) return false;
      if (x1 !== x2) return y2 - y1 === 1;
      return y2 - y1 === 1 || (y1 <= 1 && y2 - y1 === 2);
    }
    if (y2 >= y1) return false;
    if (x1 !== x2) return y1 - y2 === 1;
    return y1 - y2 === 1 || (y1 >= 6 && y1 - y2 === 2);
  };
}

function kingRing(x1: number, y1: number, x2: number, y2: number): boolean {
  return diff(x1, x2) < 2 && diff(y1, y2) < 2 && !(x1 === x2 && y1 === y2);
}

function ownRookFilesOnBackRank(pieces: Pieces, color: "white" | "black", rank: number): number[] {
  const found: number[] = [];
  for (const key of allKeys) {
    const piece = pieces.get(key);
    if (!piece || piece.color !== color || piece.role !== "rook") continue;
    const pos = key2pos(key);
    if (pos[1] === rank) found.push(pos[0]);
  }
  return found;
}

function king(pieces: Pieces, color: "white" | "black", origin: Pos, variant: VariantKey): Mobility {
  const backRank = color === "white" ? 0 : 7;
  const castleFiles = new Set<number>();
  if (origin[1] === backRank) {
    const rookFiles = ownRookFilesOnBackRank(pieces, color, backRank);
    // King-onto-rook is the only 960 castling input, and is also accepted in
    // standard so `movable.rookCastle` input reaches the premove slot.
    for (const file of rookFiles) castleFiles.add(file);
    if (variant !== "chess960" && origin[0] === 4) {
      if (rookFiles.includes(0)) castleFiles.add(2);
      if (rookFiles.includes(7)) castleFiles.add(6);
    }
  }
  return (x1, y1, x2, y2) => {
    if (kingRing(x1, y1, x2, y2)) return true;
    return y2 === backRank && y1 === backRank && castleFiles.has(x2);
  };
}

export function premove(
  pieces: Pieces,
  key: Key,
  variant: VariantKey,
  filter?: (orig: Key, dest: Key, pieces: Pieces) => boolean,
): Key[] {
  const piece = pieces.get(key);
  if (!piece) return [];
  const pos = key2pos(key);
  let mobility: Mobility;
  switch (piece.role) {
    case "pawn":
      mobility = pawn(piece.color);
      break;
    case "knight":
      mobility = knight;
      break;
    case "bishop":
      mobility = bishop;
      break;
    case "rook":
      mobility = rook;
      break;
    case "queen":
      mobility = queen;
      break;
    case "king":
      mobility = king(pieces, piece.color, pos, variant);
      break;
  }
  const dests: Key[] = [];
  for (const dest of allKeys) {
    const target = key2pos(dest);
    if (!mobility(pos[0], pos[1], target[0], target[1])) continue;
    if (filter && !filter(key, dest, pieces)) continue;
    dests.push(dest);
  }
  return dests;
}
