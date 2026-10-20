/*
 * The diff renderer.
 *
 * Invariants that make this cheap enough to run on every state change:
 * - One pass over `cb-board`'s children collects survivors and recycling
 *   pools; nothing is queried by selector and no element is created when a
 *   pooled one fits.
 * - Squares are pooled by *hiding*, never removing: highlight sets churn every
 *   selection and node churn is what costs.
 * - Pieces are keyed by "color role" so a knight element is reused for another
 *   knight regardless of square.
 * - The dragged piece's element is never moved or removed here; drag.ts owns
 *   its transform until the drop.
 */

import type { Key, Piece, PxPos } from "./types.ts";
import type { State } from "./dom-state.ts";
import { resolveDragElement } from "./dom-state.ts";
import { destinations } from "./state.ts";
import { whitePov } from "./board.ts";
import { getKeyAtDomPos, key2pos, posToTranslate, samePiece } from "./geometry.ts";

interface PieceNode extends HTMLElement {
  cbKey?: Key;
  cbPiece?: Piece;
  cbFading?: boolean;
}

interface SquareNode extends HTMLElement {
  cbKey?: Key;
  cbClass?: string;
}

function pieceClass(piece: Piece): string {
  return `${piece.color} ${piece.role}`;
}

function isPieceNode(node: Node): node is PieceNode {
  return node.nodeName === "PIECE";
}

function isSquareNode(node: Node): node is SquareNode {
  return node.nodeName === "CB-SQUARE";
}

function pushPool<T>(pool: Map<string, T[]>, key: string, value: T): void {
  const bucket = pool.get(key);
  if (bucket) bucket.push(value);
  else pool.set(key, [value]);
}

function takeExact<T>(pool: Map<string, T[]>, key: string): T | undefined {
  const bucket = pool.get(key);
  return bucket && bucket.length ? bucket.pop() : undefined;
}

function takeAny<T>(pool: Map<string, T[]>): T | undefined {
  for (const bucket of pool.values()) {
    if (bucket.length) return bucket.pop();
  }
  return undefined;
}

function addClass(map: Map<Key, string>, key: Key, cls: string): void {
  const existing = map.get(key);
  map.set(key, existing ? `${existing} ${cls}` : cls);
}

/**
 * The square under the pointer during an active drag, when it is a legal
 * target. Derived rather than stored so it survives a redraw replacing nodes.
 */
export function hoveredDragDest(state: State): Key | undefined {
  const current = state.draggable.current;
  if (!current || !current.started) return undefined;
  const key = getKeyAtDomPos(current.pos, whitePov(state), state.dom.bounds());
  if (!key || key === current.orig) return undefined;
  const moveDests = state.movable.free ? undefined : destinations(state, current.orig);
  if (state.movable.free || moveDests?.includes(key)) return key;
  if (state.premovable.dests?.includes(key)) return key;
  return undefined;
}

export function computeSquareClasses(state: State): Map<Key, string> {
  const classes: Map<Key, string> = new Map();

  if (state.lastMove && state.highlight.lastMove) {
    for (const key of state.lastMove) {
      // A null move (orig === dest) still highlights once.
      if (!classes.get(key)?.includes("cb-last-move")) addClass(classes, key, "cb-last-move");
    }
  }

  if (state.check && state.highlight.check) addClass(classes, state.check, "cb-check");

  if (state.selected) {
    addClass(classes, state.selected, "cb-selected");
    if (state.movable.showDests) {
      const dests = destinations(state, state.selected);
      if (dests) {
        for (const dest of dests) {
          addClass(classes, dest, state.pieces.has(dest) ? "cb-move-dest cb-oc" : "cb-move-dest");
        }
      }
    }
    if (state.premovable.showDests && state.premovable.dests) {
      for (const dest of state.premovable.dests) {
        addClass(
          classes,
          dest,
          state.pieces.has(dest) ? "cb-premove-dest cb-oc" : "cb-premove-dest",
        );
      }
    }
  }

  const premove = state.premovable.current;
  if (premove) {
    addClass(classes, premove.from, "cb-current-premove");
    addClass(classes, premove.to, "cb-current-premove");
  }

  const hovered = hoveredDragDest(state);
  if (hovered) addClass(classes, hovered, "cb-drag-over");

  const custom = state.highlight.custom;
  if (custom) {
    for (const [key, suffix] of custom) addClass(classes, key, `cb-hl-${suffix}`);
  }

  return classes;
}

function translateOf(
  state: State,
  key: Key,
  asWhite: boolean,
  width: number,
  height: number,
): PxPos {
  const base = posToTranslate({ left: 0, top: 0, width, height }, key2pos(key), asWhite);
  const anim = state.animation.current?.plan.anims.get(key);
  if (!anim) return base;
  // Plan vectors are white-POV square units; posToTranslate flips the base
  // position but not the offset, so the flip is applied here.
  const sw = width / 8;
  const sh = height / 8;
  return [
    base[0] + (asWhite ? anim[2] : -anim[2]) * sw,
    base[1] + (asWhite ? -anim[3] : anim[3]) * sh,
  ];
}

function setTranslate(el: HTMLElement, pos: PxPos): void {
  const transform = `translate(${pos[0]}px, ${pos[1]}px)`;
  if (el.style.transform !== transform) el.style.transform = transform;
}

export function render(state: State): void {
  const elements = state.dom.elements;
  const board = elements.board;
  const asWhite = whitePov(state);
  const bounds = state.dom.bounds();
  const width = bounds.width;
  const height = bounds.height;

  const anims = state.animation.current?.plan.anims;
  const fadings = state.animation.current?.plan.fadings;
  const drag = state.draggable.current;
  const draggedElement =
    drag && drag.started ? resolveDragElement(drag) : undefined;

  const desiredSquares = computeSquareClasses(state);

  const survivors: Map<Key, PieceNode> = new Map();
  const piecePool: Map<string, PieceNode[]> = new Map();
  const fadingPool: PieceNode[] = [];
  const squarePool: Map<string, SquareNode[]> = new Map();

  let node = board.firstChild;
  while (node) {
    const next = node.nextSibling;
    if (isPieceNode(node)) {
      if (node.cbFading) {
        fadingPool.push(node);
      } else {
        const key = node.cbKey;
        const piece = node.cbPiece;
        const wanted = key ? state.pieces.get(key) : undefined;
        if (key && piece && wanted && samePiece(wanted, piece) && !survivors.has(key)) {
          survivors.set(key, node);
        } else if (node !== draggedElement) {
          // The dragged node belongs to drag.ts until the drop: recycling it
          // would strand cb-dragging on another square's piece and leave the
          // gesture holding a node that is no longer its own.
          if (piece) pushPool(piecePool, pieceClass(piece), node);
          else board.removeChild(node);
        }
      }
    } else if (isSquareNode(node)) {
      pushPool(squarePool, node.cbClass ?? "", node);
    }
    node = next;
  }

  for (const [key, className] of desiredSquares) {
    let square = takeExact(squarePool, className);
    if (!square) {
      square = takeAny(squarePool);
      if (square) square.className = className;
    }
    if (!square) {
      square = document.createElement("cb-square") as SquareNode;
      square.className = className;
      board.appendChild(square);
    }
    square.cbClass = className;
    square.cbKey = key;
    if (square.style.display !== "") square.style.display = "";
    setTranslate(square, posToTranslate({ left: 0, top: 0, width, height }, key2pos(key), asWhite));
  }

  for (const bucket of squarePool.values()) {
    for (const leftover of bucket) {
      if (leftover.style.display !== "none") leftover.style.display = "none";
      leftover.cbKey = undefined;
    }
  }

  for (const [key, piece] of state.pieces) {
    const existing = survivors.get(key);
    const animated = anims?.has(key) === true;
    if (existing) {
      existing.classList.toggle("cb-anim", animated);
      if (existing !== draggedElement) setTranslate(existing, translateOf(state, key, asWhite, width, height));
      continue;
    }
    const className = pieceClass(piece);
    let el = takeExact(piecePool, className);
    if (!el) {
      el = document.createElement("piece") as PieceNode;
      el.className = className;
      board.appendChild(el);
    }
    el.cbKey = key;
    el.cbPiece = piece;
    el.cbFading = false;
    el.classList.remove("cb-fading");
    el.classList.toggle("cb-anim", animated);
    setTranslate(el, translateOf(state, key, asWhite, width, height));
  }

  if (fadings) {
    for (const [key, piece] of fadings) {
      const className = pieceClass(piece);
      let el = fadingPool.pop();
      if (el) el.className = className;
      else {
        el = document.createElement("piece") as PieceNode;
        el.className = className;
        board.appendChild(el);
      }
      el.classList.add("cb-fading");
      el.cbKey = key;
      el.cbPiece = piece;
      el.cbFading = true;
      setTranslate(el, posToTranslate({ left: 0, top: 0, width, height }, key2pos(key), asWhite));
    }
  }

  for (const leftover of fadingPool) board.removeChild(leftover);
  for (const bucket of piecePool.values()) {
    for (const leftover of bucket) {
      if (leftover !== draggedElement) board.removeChild(leftover);
    }
  }
}

/** Re-translate existing nodes after a resize; no diffing, no allocation. */
export function renderResized(state: State): void {
  const board = state.dom.elements.board;
  const asWhite = whitePov(state);
  const bounds = state.dom.bounds();
  const box = { left: 0, top: 0, width: bounds.width, height: bounds.height };
  const drag = state.draggable.current;
  const draggedElement = drag && drag.started ? resolveDragElement(drag) : undefined;

  let node = board.firstChild;
  while (node) {
    const next = node.nextSibling;
    if ((isPieceNode(node) || isSquareNode(node)) && node.cbKey && node !== draggedElement) {
      const key = node.cbKey;
      const pos =
        isPieceNode(node) && !node.cbFading
          ? translateOf(state, key, asWhite, bounds.width, bounds.height)
          : posToTranslate(box, key2pos(key), asWhite);
      setTranslate(node, pos);
    }
    node = next;
  }

  // The ghost sits outside `board` and carries pixel sizes drag.ts wrote once
  // at grab time, so a mid-drag resize would leave it at the old scale.
  const ghost = drag?.ghost;
  if (ghost) {
    const size = bounds.width / 8;
    ghost.style.width = `${size}px`;
    ghost.style.height = `${size}px`;
    setTranslate(ghost, posToTranslate(box, key2pos(drag.orig), asWhite));
  }
}

/**
 * Snap the board to a whole number of device pixels per square. Without this a
 * fractional square width leaves seams between squares and blurs piece art.
 */
export function updateBounds(state: State): void {
  const elements = state.dom.elements;
  const container = elements.container;
  if (state.snapPixels) {
    // Measured with the inline size cleared: outside coordinates give the wrap
    // extra width that is not available to the board.
    container.style.width = "";
    container.style.height = "";
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const snapped = (Math.floor((rect.width * dpr) / 8) * 8) / dpr;
    if (snapped > 0) {
      container.style.width = `${snapped}px`;
      container.style.height = `${snapped}px`;
    }
  } else {
    container.style.width = "";
    container.style.height = "";
  }
  state.dom.bounds = memoizedBounds(elements.board);
}

export function memoizedBounds(board: HTMLElement): () => DOMRect {
  let cached: DOMRect | undefined;
  return () => {
    if (!cached) cached = board.getBoundingClientRect();
    return cached;
  };
}
