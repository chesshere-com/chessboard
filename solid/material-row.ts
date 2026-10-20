/*
 * Captured-material presentation logic. JSX-free (plain .ts) so it runs under
 * the `node --experimental-strip-types --test` runner.
 */

import type { Color, MaterialCount, MaterialDiff } from "../src/types.ts";

/** The five capturable roles; kings never enter a material row. */
export type CapturedRole = keyof MaterialCount;

export interface CapturedEntry {
  role: CapturedRole;
  count: number;
}

/** Ascending value: pawns lead the row, the queen closes it. */
const ORDER: CapturedRole[] = ["pawn", "knight", "bishop", "rook", "queen"];

/**
 * Roles `side` has captured, in display order, zero counts dropped.
 * The pieces themselves belong to the opposite color.
 */
export function capturedRow(diff: MaterialDiff, side: Color): CapturedEntry[] {
  const counts = diff.capturedBy[side];
  const row: CapturedEntry[] = [];
  for (const role of ORDER) {
    const count = counts[role];
    if (count > 0) row.push({ role, count });
  }
  return row;
}

/**
 * Positive point lead for `side`, or undefined when it is level or behind —
 * only the leading side shows a `+N`, so both rows can call this blindly.
 */
export function leadingScore(diff: MaterialDiff, side: Color): number | undefined {
  if (side === "white") return diff.score > 0 ? diff.score : undefined;
  return diff.score < 0 ? -diff.score : undefined;
}
