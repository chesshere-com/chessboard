/*
 * FEN piece-placement parsing/serialisation. Only the first FEN field matters
 * to the board; everything else (turn, castling rights, clocks) is the
 * caller's business.
 */

import type { Key, Pieces, Role } from "./types.ts";
import { files, ranks } from "./geometry.ts";

export const INITIAL_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";

const roles: Record<string, Role> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
};

const letters: Record<Role, string> = {
  pawn: "p",
  knight: "n",
  bishop: "b",
  rook: "r",
  queen: "q",
  king: "k",
};

export function readFen(fen: string): Pieces {
  const pieces: Pieces = new Map();
  if (!fen) return pieces;
  const placement = (fen === "start" ? INITIAL_FEN : fen).split(" ")[0];

  let file = 0;
  let rank = 7;
  for (const char of placement) {
    if (char === "/") {
      rank--;
      file = 0;
      if (rank < 0) break;
      continue;
    }
    if (char >= "1" && char <= "8") {
      file += char.charCodeAt(0) - 48;
      continue;
    }
    const role = roles[char.toLowerCase()];
    // Unknown glyphs (crazyhouse promoted markers, corrupt input) are skipped
    // rather than aborting the parse: a partly readable board beats none.
    if (role && file < 8) {
      const key = (files[file] + ranks[rank]) as Key;
      pieces.set(key, { role, color: char === char.toLowerCase() ? "black" : "white" });
    }
    file++;
  }
  return pieces;
}

export function writeFen(pieces: Pieces): string {
  const rows: string[] = [];
  for (let rank = 7; rank >= 0; rank--) {
    let row = "";
    let empty = 0;
    for (let file = 0; file < 8; file++) {
      const piece = pieces.get((files[file] + ranks[rank]) as Key);
      if (piece) {
        if (empty > 0) {
          row += empty;
          empty = 0;
        }
        const letter = letters[piece.role];
        row += piece.color === "white" ? letter.toUpperCase() : letter;
      } else {
        empty++;
      }
    }
    if (empty > 0) row += empty;
    rows.push(row);
  }
  return rows.join("/");
}
