/*
 * Material derivation. Captures are inferred from the position against the
 * standard start set, so no move history is needed. Promotions can therefore
 * push a count negative in principle; counts are floored at 0.
 */

import type { MaterialCount, MaterialDiff, Pieces } from "./types.ts";

const START_COUNTS: MaterialCount = { pawn: 8, knight: 2, bishop: 2, rook: 2, queen: 1 };

const VALUES: MaterialCount = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9 };

const COUNTED: (keyof MaterialCount)[] = ["pawn", "knight", "bishop", "rook", "queen"];

function emptyCount(): MaterialCount {
  return { pawn: 0, knight: 0, bishop: 0, rook: 0, queen: 0 };
}

export function materialDiff(pieces: Pieces): MaterialDiff {
  const surviving = { white: emptyCount(), black: emptyCount() };
  for (const piece of pieces.values()) {
    if (piece.role === "king") continue;
    surviving[piece.color][piece.role] += 1;
  }

  const capturedBy = { white: emptyCount(), black: emptyCount() };
  let score = 0;
  for (const role of COUNTED) {
    capturedBy.white[role] = Math.max(0, START_COUNTS[role] - surviving.black[role]);
    capturedBy.black[role] = Math.max(0, START_COUNTS[role] - surviving.white[role]);
    score += VALUES[role] * (surviving.white[role] - surviving.black[role]);
  }
  return { capturedBy, score };
}
