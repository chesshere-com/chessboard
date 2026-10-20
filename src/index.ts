/*
 * Package entry point. Consumers import only from here; everything else is an
 * implementation detail that may move between milestones.
 */

export { ChessBoard } from "./api.ts";

export type {
  Api,
  Brush,
  Color,
  Config,
  CoordinatesConfig,
  Dests,
  DraggableConfig,
  DrawableConfig,
  EffectKind,
  Elements,
  File,
  GlyphSpec,
  HighlightConfig,
  Key,
  MaterialCount,
  MaterialDiff,
  MovableConfig,
  MoveMetadata,
  MovePair,
  Piece,
  Pieces,
  PiecesDiff,
  Pos,
  Position,
  PremovableConfig,
  PromotionConfig,
  PromotionRole,
  PxPos,
  Rank,
  RegionSpec,
  Role,
  SelectableConfig,
  Shape,
  VariantConfig,
} from "./types.ts";

export type { HeadlessState } from "./state.ts";
export type { State } from "./dom-state.ts";

export { INITIAL_FEN, readFen, writeFen } from "./fen.ts";
export { allKeys, key2pos, opposite, pos2key } from "./geometry.ts";
export { expandRegion } from "./region.ts";
export { materialDiff } from "./material.ts";
export { premove } from "./premove.ts";
