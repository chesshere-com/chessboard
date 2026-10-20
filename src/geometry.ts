/*
 * Board geometry: key/pos conversion and pixel mapping. DOM-free.
 */

import type { Color, File, Key, Piece, Pos, PxPos, Rank } from "./types.ts";

export const files: File[] = ["a", "b", "c", "d", "e", "f", "g", "h"];
export const ranks: Rank[] = ["1", "2", "3", "4", "5", "6", "7", "8"];

/** File-major: a1,a2..a8,b1..h8. `allKeys[i]` and `allPos[i]` are the same square. */
export const allKeys: Key[] = files.flatMap((f) => ranks.map((r) => `${f}${r}` as Key));

export const allPos: Pos[] = allKeys.map(
  (k) => [k.charCodeAt(0) - 97, k.charCodeAt(1) - 49] as Pos,
);

export function key2pos(k: Key): Pos {
  return [k.charCodeAt(0) - 97, k.charCodeAt(1) - 49];
}

export function pos2key(pos: Pos): Key {
  return (files[pos[0]] + ranks[pos[1]]) as Key;
}

export function opposite(c: Color): Color {
  return c === "white" ? "black" : "white";
}

export function distanceSq(a: Pos, b: Pos): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

export function samePiece(a: Piece, b: Piece): boolean {
  return a.role === b.role && a.color === b.color;
}

export function containsPos(pos: Pos): boolean {
  return pos[0] >= 0 && pos[0] < 8 && pos[1] >= 0 && pos[1] < 8;
}

export interface Bounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Board-relative (not page-relative) top-left pixel of the square. */
export function posToTranslate(bounds: Bounds, pos: Pos, asWhite: boolean): PxPos {
  return [
    ((asWhite ? pos[0] : 7 - pos[0]) * bounds.width) / 8,
    ((asWhite ? 7 - pos[1] : pos[1]) * bounds.height) / 8,
  ];
}

/** `pos` is page-relative (pointer coordinates); bounds carry the board offset. */
export function getKeyAtDomPos(pos: PxPos, asWhite: boolean, bounds: Bounds): Key | undefined {
  let file = Math.floor((8 * (pos[0] - bounds.left)) / bounds.width);
  if (!asWhite) file = 7 - file;
  let rank = 7 - Math.floor((8 * (pos[1] - bounds.top)) / bounds.height);
  if (!asWhite) rank = 7 - rank;
  const target: Pos = [file, rank];
  return containsPos(target) ? pos2key(target) : undefined;
}

/** Page-relative centre of the square, matching `getKeyAtDomPos` coordinates. */
export function computeSquareCenter(key: Key, asWhite: boolean, bounds: Bounds): PxPos {
  const translate = posToTranslate(bounds, key2pos(key), asWhite);
  return [
    bounds.left + translate[0] + bounds.width / 16,
    bounds.top + translate[1] + bounds.height / 16,
  ];
}
