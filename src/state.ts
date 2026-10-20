/*
 * Headless board state, configuration merging and the selection rules. DOM
 * modules extend this state with element/drag/draw fields; everything here is
 * serialisable-ish plain data plus caller callbacks.
 */

import type {
  AnimationConfig,
  Color,
  Config,
  CoordinatesConfig,
  DraggableConfig,
  DrawableConfig,
  HighlightConfig,
  Key,
  MovableConfig,
  MovePair,
  Piece,
  Pieces,
  PremovableConfig,
  PromotionConfig,
  SelectableConfig,
  VariantConfig,
} from "./types.ts";
import { INITIAL_FEN, readFen } from "./fen.ts";
import { samePiece } from "./geometry.ts";
import { premove } from "./premove.ts";

export interface HeadlessState {
  pieces: Pieces;
  positionVersion: number;
  promotionSequence: number;
  orientation: Color;
  turnColor: Color;
  check?: Key;
  lastMove?: Key[];
  selected?: Key;
  viewOnly: boolean;
  resizable: boolean;
  disableContextMenu: boolean;
  snapPixels: boolean;
  trustAllEvents: boolean;
  coordinates: CoordinatesConfig;
  highlight: HighlightConfig;
  animation: AnimationConfig;
  movable: MovableConfig;
  /** `dests` is the cached premove geometry for `selected`, filled by setSelected. */
  premovable: PremovableConfig & { current?: MovePair; dests?: Key[] };
  draggable: DraggableConfig;
  selectable: SelectableConfig;
  drawable: DrawableConfig & { current?: unknown };
  promotion: PromotionConfig & {
    current?: {
      requestId: number;
      version: number;
      orig: Key;
      dest: Key;
      color: Color;
      premove?: boolean;
      byDrag?: boolean;
      holdTime?: number;
    };
  };
  variant: VariantConfig;
  events: NonNullable<Config["events"]>;
  stats: { dragged: boolean };
}

export function defaults(): HeadlessState {
  return {
    pieces: readFen(INITIAL_FEN),
    positionVersion: 0,
    promotionSequence: 0,
    orientation: "white",
    turnColor: "white",
    viewOnly: false,
    resizable: false,
    disableContextMenu: false,
    snapPixels: true,
    trustAllEvents: false,
    coordinates: { show: true, placement: "inside", ranksPosition: "right" },
    highlight: { lastMove: true, check: true },
    animation: { enabled: true, duration: 200 },
    movable: {
      free: false,
      color: undefined,
      showDests: true,
      rookCastle: true,
      events: {},
    },
    premovable: {
      enabled: true,
      showDests: true,
      events: {},
    },
    draggable: {
      mouse: true,
      touch: true,
      distance: 3,
      autoDistance: true,
      showGhost: true,
      liftScale: 1.1,
      deleteOnDropOff: false,
      touchIgnoreRadius: 1,
    },
    selectable: { enabled: true },
    drawable: {
      enabled: true,
      visible: true,
      shapes: [],
      autoShapes: [],
      brushes: {
        green: { key: "green", color: "#15781B", opacity: 1, lineWidth: 10 },
        red: { key: "red", color: "#882020", opacity: 1, lineWidth: 10 },
        blue: { key: "blue", color: "#003088", opacity: 1, lineWidth: 10 },
        yellow: { key: "yellow", color: "#e68f00", opacity: 1, lineWidth: 10 },
        paleGreen: { key: "paleGreen", color: "#15781B", opacity: 0.4, lineWidth: 15 },
        paleRed: { key: "paleRed", color: "#882020", opacity: 0.4, lineWidth: 15 },
        paleBlue: { key: "paleBlue", color: "#003088", opacity: 0.4, lineWidth: 15 },
      },
      brushSelectors: ["green", "red", "blue", "yellow"],
      eraseOnClick: true,
    },
    promotion: { dialog: true, autoQueen: false },
    variant: { key: "standard" },
    events: {},
    stats: { dragged: false },
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  if (Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

// Maps, arrays and functions are wholesale replacements: merging `dests`,
// `shapes` or `lastMove` element-wise would resurrect stale entries.
function deepMerge(base: Record<string, unknown>, extra: Record<string, unknown>): void {
  for (const key of Object.keys(extra)) {
    const incoming = extra[key];
    const existing = base[key];
    if (isPlainObject(existing) && isPlainObject(incoming)) {
      deepMerge(existing, incoming);
    } else {
      base[key] = incoming;
    }
  }
}

export function setCheck(state: HeadlessState, color: Color | boolean): void {
  const resolved: Color | undefined =
    color === true ? state.turnColor : color === false ? undefined : color;
  state.check = undefined;
  if (!resolved) return;
  for (const [key, piece] of state.pieces) {
    if (piece.role === "king" && piece.color === resolved) {
      state.check = key;
      return;
    }
  }
}

export function unselect(state: HeadlessState): void {
  state.selected = undefined;
  state.premovable.dests = undefined;
}

export function isMovable(state: HeadlessState, orig: Key): boolean {
  const piece = state.pieces.get(orig);
  if (!piece || state.viewOnly) return false;
  return (
    state.movable.color === "both" ||
    (state.movable.color === piece.color && state.turnColor === piece.color)
  );
}

export function isPremovable(state: HeadlessState, orig: Key): boolean {
  const piece = state.pieces.get(orig);
  if (!piece || state.viewOnly || !state.premovable.enabled) return false;
  return state.movable.color === piece.color && state.turnColor !== piece.color;
}

export function setSelected(state: HeadlessState, key: Key | undefined): void {
  if (state.selected !== key) invalidateDests(state);
  state.selected = key;
  state.premovable.dests =
    key !== undefined && isPremovable(state, key)
      ? premove(state.pieces, key, state.variant.key, state.premovable.filter)
      : undefined;
}

/**
 * An update never cancels the user's selection by itself: the opponent's move
 * landing while a piece is selected is the normal case, and the click that
 * follows must still move that piece against the new position. The selection
 * goes only when there is nothing left to act on: the square is empty or holds
 * a different piece (captured, taken back, an enemy landing there — with
 * movable.color "both" that enemy piece would pass isMovable, so identity is
 * checked first), or the new configuration lets the piece neither move nor
 * premove (viewOnly, side switched, premoves disabled). A kept selection
 * re-derives its premove geometry, which is position-bound. Never fires
 * events.select: nothing here is a user selection.
 */
function reconcileSelection(state: HeadlessState, before: Piece | undefined): void {
  const key = state.selected;
  if (key === undefined) return;
  const now = state.pieces.get(key);
  if (!before || !now || !samePiece(before, now) || !(isMovable(state, key) || isPremovable(state, key))) {
    unselect(state);
    return;
  }
  setSelected(state, key);
}

export function configure(state: HeadlessState, config: Config): void {
  invalidateDests(state);
  // Which piece the selection is about, read before the merge or a fen re-read
  // replaces the pieces; reconcileSelection compares against it afterwards.
  const selectedKey = "selected" in config ? config.selected : state.selected;
  const selectedPiece = selectedKey !== undefined ? state.pieces.get(selectedKey) : undefined;
  // `fen` and `check` are config-only spellings of derived state; merging them
  // verbatim would leave junk fields on the state object.
  const mergeable: Record<string, unknown> = { ...(config as Record<string, unknown>) };
  delete mergeable.fen;
  delete mergeable.check;
  deepMerge(state as unknown as Record<string, unknown>, mergeable);

  if (config.fen !== undefined) {
    state.positionVersion++;
    state.pieces = readFen(config.fen);
    // The premove itself survives: the documented flow is set({fen}) for the
    // opponent's move followed by playPremove(), whose canMove check is the
    // staleness guard. Only the cached selection geometry is position-bound.
    state.premovable.dests = undefined;
    // A pending choice belongs to the position it was raised in; committing it
    // against a new one would write a piece onto an unrelated square.
    state.promotion.current = undefined;
  }

  // Presence-of-key: `{check: undefined}` clears, an absent key leaves state.
  if ("check" in config) setCheck(state, config.check ?? false);
  if ("lastMove" in config && !config.lastMove) state.lastMove = undefined;
  reconcileSelection(state, selectedPiece);
}

const destinationCaches = new WeakMap<HeadlessState, Map<Key, Key[] | undefined>>();

export function invalidateDests(state: HeadlessState): void {
  destinationCaches.delete(state);
}

export function destinations(state: HeadlessState, orig: Key): Key[] | undefined {
  const explicit = state.movable.dests?.get(orig);
  if (explicit !== undefined) return explicit;
  let cache = destinationCaches.get(state);
  if (!cache) {
    cache = new Map();
    destinationCaches.set(state, cache);
  }
  if (!cache.has(orig)) cache.set(orig, state.movable.getDests?.(orig));
  return cache.get(orig);
}
