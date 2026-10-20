/*
 * Region expansion: the lesson-highlight primitive. A region spec is
 * serialisable shorthand for a square set.
 */

import type { Key, RegionSpec } from "./types.ts";
import { containsPos, files, key2pos, pos2key, ranks } from "./geometry.ts";

export function expandRegion(spec: RegionSpec): Key[] {
  switch (spec.kind) {
    case "rank":
      return files.map((file) => (file + spec.rank) as Key);
    case "file":
      return ranks.map((rank) => (spec.file + rank) as Key);
    case "diagonal": {
      const from = key2pos(spec.from);
      const to = key2pos(spec.to);
      const dx = to[0] - from[0];
      const dy = to[1] - from[1];
      if (dx === 0 || Math.abs(dx) !== Math.abs(dy)) return [];
      // Any two squares on a diagonal name the whole line: walk back to one
      // edge, then forward to the other.
      const stepX = Math.sign(dx);
      const stepY = Math.sign(dy);
      let x = from[0];
      let y = from[1];
      while (containsPos([x - stepX, y - stepY])) {
        x -= stepX;
        y -= stepY;
      }
      const squares: Key[] = [];
      while (containsPos([x, y])) {
        squares.push(pos2key([x, y]));
        x += stepX;
        y += stepY;
      }
      return squares;
    }
    case "squares":
      return [...new Set(spec.squares)];
  }
}
