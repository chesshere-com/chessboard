/*
 * chess-board core types — the public contract.
 *
 * Design constraints:
 * - Zero runtime dependencies; no chess.js. Legality is supplied by the caller
 *   through `movable.dests` / `movable.getDests`; the board owns only premove
 *   pseudo-legal geometry and castling UX.
 * - Every module importing only from this file must stay DOM-free so pure
 *   logic runs under `node --test` with type stripping (no enums, no
 *   namespaces, no parameter properties — erasable syntax only).
 * - Shape/effect records are serializable (JSON round-trip) so lessons and
 *   studies can persist them.
 */

export type Color = "white" | "black";
export type Role = "pawn" | "knight" | "bishop" | "rook" | "queen" | "king";
export type File = "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h";
export type Rank = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8";
export type Key = `${File}${Rank}`;
/** [file 0-7, rank 0-7] from white's perspective; a1 = [0,0]. */
export type Pos = [number, number];
/** Board-relative pixel pair. */
export type PxPos = [number, number];

export interface Piece {
  color: Color;
  role: Role;
}

export type Pieces = Map<Key, Piece>;
/** Diff for setPieces: undefined value deletes the square's piece. */
export type PiecesDiff = Map<Key, Piece | undefined>;
export type Dests = Map<Key, Key[]>;

export type PromotionRole = "queen" | "rook" | "bishop" | "knight";

/** UCI-ish move pair; promotion carried separately in metadata. */
export interface MovePair {
  from: Key;
  to: Key;
}

export interface MoveMetadata {
  /** True when this move was executed from a stored premove. */
  premove: boolean;
  /** Piece occupying the destination before the move, if any. */
  captured?: Piece;
  /** Set when the move was a promotion chosen via the dialog or autoQueen. */
  promotion?: PromotionRole;
  /** True when the move was performed by drag (vs click-move / api). */
  byDrag: boolean;
  /** Milliseconds the piece was held before drop (drag only). */
  holdTime?: number;
}

// ---------------------------------------------------------------------------
// Shapes: one serializable vocabulary for arrows, circles, markers, lesson
// regions, glyphs and effects. Two channels exist in state/config:
// `shapes` (user scribbles) and `autoShapes` (app-authored) — user erasure
// never touches autoShapes.
// ---------------------------------------------------------------------------

export interface Brush {
  /** stable key, used in CSS classes and SVG marker ids */
  key: string;
  color: string;
  opacity: number;
  /** stroke width in 1/64 board units (chess-convention: 10 ≈ default) */
  lineWidth: number;
}

export type RegionSpec =
  /** every square of a rank, e.g. "4" */
  | { kind: "rank"; rank: Rank }
  /** every square of a file, e.g. "d" */
  | { kind: "file"; file: File }
  /** full diagonal through from→to (both inclusive); must be a diagonal */
  | { kind: "diagonal"; from: Key; to: Key }
  /** arbitrary set */
  | { kind: "squares"; squares: Key[] };

/**
 * Built-in glyph names render packaged SVGs (star, target, cross, check-mark,
 * question); `custom` embeds caller SVG markup (trusted input only).
 */
export type GlyphSpec =
  | { kind: "star" }
  | { kind: "target" }
  | { kind: "cross" }
  | { kind: "check" }
  | { kind: "question" }
  | { kind: "custom"; svg: string };

/**
 * Effects are CSS-animation classes applied to a square overlay; they expire
 * on their own (animation end) unless `sticky`.
 */
export type EffectKind = "pulse" | "glow" | "shake" | "correct" | "wrong";

export type Shape =
  | {
      type: "arrow";
      from: Key;
      to: Key;
      brush?: string;
      /** extra hex glow under the arrow line */
      hilite?: string;
      /** opaque outline colour; draws the arrow as one outlined shape, head included */
      outline?: string;
      lineWidth?: number;
      label?: string;
    }
  | { type: "circle"; square: Key; brush?: string }
  | {
      /** square-fill highlight; the lesson region primitive */
      type: "region";
      region: RegionSpec;
      brush?: string;
    }
  | { type: "glyph"; square: Key; glyph: GlyphSpec; brush?: string; scale?: number }
  | { type: "label"; square: Key; text: string; fill?: string }
  | { type: "piece"; square: Key; piece: Piece; scale?: number }
  | { type: "effect"; square: Key; effect: EffectKind; sticky?: boolean };

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface HighlightConfig {
  lastMove: boolean;
  check: boolean;
  /** square -> extra css class suffix rendered as `cb-hl-<value>` */
  custom?: Map<Key, string>;
}

export interface AnimationConfig {
  enabled: boolean;
  /** ms; values < 40 disable animation */
  duration: number;
}

export interface MovableConfig {
  /** move any piece anywhere, ignoring dests (editor/free mode) */
  free: boolean;
  /** which color the user may move; undefined = none */
  color?: Color | "both";
  dests?: Dests;
  /**
   * Lazy narrowing hook consulted at piece pick-up when `dests` has no entry.
   * Return undefined to mean "no moves".
   */
  getDests?: (orig: Key) => Key[] | undefined;
  showDests: boolean;
  /** accept king-onto-rook input for castling (also the only 960 form) */
  rookCastle: boolean;
  events: {
    /** called after a user move is committed to board state */
    after?: (orig: Key, dest: Key, meta: MoveMetadata) => void;
  };
}

export interface PremovableConfig {
  enabled: boolean;
  showDests: boolean;
  /** extra veto over pseudo-legal geometry */
  filter?: (orig: Key, dest: Key, pieces: Pieces) => boolean;
  events: {
    set?: (orig: Key, dest: Key) => void;
    unset?: () => void;
  };
}

export interface DraggableConfig {
  /** master switch for mouse drags */
  mouse: boolean;
  /** master switch for touch drags */
  touch: boolean;
  /** px the pointer must travel before a drag starts */
  distance: number;
  /** drop the threshold to 0 once the user has successfully dragged */
  autoDistance: boolean;
  showGhost: boolean;
  /** scale factor applied to the dragged piece (1 = none) */
  liftScale: number;
  deleteOnDropOff: boolean;
  /**
   * touch grabs within this radius (in square-halves) of a movable piece
   * preventDefault scrolling; farther touches scroll the page. 0 = never
   * block scroll (correspondence), 1 = default live-board behaviour.
   */
  touchIgnoreRadius: number;
}

export interface SelectableConfig {
  /** enable click-move / tap-tap */
  enabled: boolean;
}

export interface CoordinatesConfig {
  show: boolean;
  placement: "inside" | "outside" | "hidden";
  ranksPosition: "left" | "right";
  /** custom label sets; default a-h / 1-8 */
  fileLabels?: string[];
  rankLabels?: string[];
}

export interface DrawableConfig {
  enabled: boolean;
  visible: boolean;
  /** user scribbles */
  shapes: Shape[];
  /** app-authored channel (engine arrows, lesson targets) */
  autoShapes: Shape[];
  brushes: Record<string, Brush>;
  /** modifier bit-index [plain, modA, modB, both] -> brush key */
  brushSelectors: [string, string, string, string];
  eraseOnClick: boolean;
  onChange?: (shapes: Shape[]) => void;
}

export interface PromotionConfig {
  labels?: { dialog: string; cancel: string; queen: string; rook: string; bishop: string; knight: string };
  /** show built-in dialog; false = caller handles via events.promotion */
  dialog: boolean;
  autoQueen: boolean;
  /** called when a promotion is required and dialog=false */
  onRequired?: (orig: Key, dest: Key, color: Color, requestId: number) => void;
}

export interface VariantConfig {
  /** "standard" | "chess960" | "threeCheck" — geometry/UX switches only */
  key: "standard" | "chess960" | "threeCheck";
}

export interface Config {
  /** piece-placement FEN (first field); "start" accepted */
  fen?: string;
  orientation?: Color;
  turnColor?: Color;
  /** true = infer side in check from turnColor; or explicit color */
  check?: boolean | Color;
  lastMove?: Key[];
  /** kept, across this and later updates, only while the piece there can move or premove */
  selected?: Key;
  viewOnly?: boolean;
  /** show a corner grip that resizes the board by writing the host's width */
  resizable?: boolean;
  disableContextMenu?: boolean;
  /** snap container width to whole device pixels per square */
  snapPixels?: boolean;
  /** reject untrusted (synthetic) events */
  trustAllEvents?: boolean;
  coordinates?: Partial<CoordinatesConfig>;
  highlight?: Partial<HighlightConfig>;
  animation?: Partial<AnimationConfig>;
  movable?: Partial<MovableConfig>;
  premovable?: Partial<PremovableConfig>;
  draggable?: Partial<DraggableConfig>;
  selectable?: Partial<SelectableConfig>;
  drawable?: Partial<DrawableConfig>;
  promotion?: Partial<PromotionConfig>;
  variant?: Partial<VariantConfig>;
  events?: {
    /** any state change that altered the position */
    change?: () => void;
    /** any move rendered on the board (user or programmatic) */
    move?: (orig: Key, dest: Key, captured?: Piece) => void;
    select?: (key: Key) => void;
    /**
     * A pointer gesture ended with nothing selected and nothing played: a
     * press on an empty or unselectable square, a drop back on the origin or
     * on a square that is no target, a second tap on the selected piece. The
     * board drops its own premove at that moment; a caller that owns premoves
     * should do the same. Fires whether or not anything was pending, and never
     * on picking a piece up, selecting another one, a move, a new premove, a
     * pending promotion, an aborted drag (blur, touchcancel) or an API call.
     */
    cancel?: () => void;
    /** board DOM (re)inserted — attach chrome here */
    insert?: (elements: Elements) => void;
  };
}

// ---------------------------------------------------------------------------
// State & API (DOM-facing modules narrow these)
// ---------------------------------------------------------------------------

export interface Elements {
  wrap: HTMLElement;
  container: HTMLElement;
  board: HTMLElement;
  ghost?: HTMLElement;
  resize?: HTMLElement;
  svgBelow?: SVGElement;
  svgAbove?: SVGElement;
  autoPieces?: HTMLElement;
}

export interface Position {
  fen: string;
  turnColor: Color;
  check?: boolean | Color;
  lastMove?: Key[];
  dests?: Dests;
}

export interface Api {
  /**
   * Authoritative replacement: drops the premove, a drawing in progress and
   * stale legality. A selection or drag whose piece still sits on its square
   * and can still act survives, so an opponent move never cancels user input.
   */
  setPosition(position: Position): void;
  /** Pass onRequired's requestId when resolving an asynchronous custom dialog. */
  resolvePromotion(role: PromotionRole, requestId?: number): boolean;
  cancelPromotion(): void;
  /** Patch configuration; arrays/maps replace. Call again to invalidate lazy destinations. */
  set(config: Config): void;
  state: unknown;
  getFen(): string;
  toggleOrientation(): void;
  move(orig: Key, dest: Key): void;
  setPieces(pieces: PiecesDiff): void;
  selectSquare(key: Key | null, force?: boolean): void;
  playPremove(): boolean;
  cancelPremove(): void;
  cancelMove(): void;
  stop(): void;
  setShapes(shapes: Shape[]): void;
  setAutoShapes(shapes: Shape[]): void;
  getKeyAtDomPos(pos: PxPos): Key | undefined;
  /** material diff derived from current position vs the standard start */
  getMaterialDiff(): MaterialDiff;
  redrawAll(): void;
  destroy(): void;
}

export interface MaterialCount {
  pawn: number;
  knight: number;
  bishop: number;
  rook: number;
  queen: number;
}

export interface MaterialDiff {
  /** pieces each side has captured (derived: start-set minus on-board) */
  capturedBy: { white: MaterialCount; black: MaterialCount };
  /** point score: positive = white ahead */
  score: number;
}
