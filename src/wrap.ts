/*
 * DOM construction. Built once per board instance; render.ts then only ever
 * diffs the children of `cb-board`.
 *
 * Custom tag names (cb-container, cb-board, cb-square, cb-auto-pieces, piece)
 * are unregistered elements styled purely by CSS — no shadow DOM, so the host
 * page can theme the board with plain custom properties.
 */

import type { Elements, File, Rank } from "./types.ts";
import type { State } from "./dom-state.ts";
import { files, ranks } from "./geometry.ts";

const SVG_NS = "http://www.w3.org/2000/svg";

let instanceCounter = 0;

export function nextInstanceId(): string {
  instanceCounter += 1;
  return `cb${instanceCounter}`;
}

function createSvg(className: string): SVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", className);
  // A -4..4 box means one square is one unit and the origin is the board
  // centre, so orientation is a sign flip and shape maths stays scale-free.
  svg.setAttribute("viewBox", "-4 -4 8 8");
  svg.setAttribute("preserveAspectRatio", "xMidYMid slice");
  return svg;
}

function fileLabel(state: State, index: number): string {
  return state.coordinates.fileLabels?.[index] ?? (files[index] as File);
}

function rankLabel(state: State, index: number): string {
  return state.coordinates.rankLabels?.[index] ?? (ranks[index] as Rank);
}

/**
 * Inside coordinates ride on the edge squares themselves, so they must be
 * tinted to contrast with the square they sit on; outside coordinates are
 * plain strips flanking the board.
 */
function renderCoords(state: State): HTMLElement[] {
  const coords = state.coordinates;
  if (!coords.show || coords.placement === "hidden") return [];

  const asWhite = state.orientation === "white";
  const inside = coords.placement === "inside";
  const placementClass = inside ? "cb-coords-inside" : "cb-coords-outside";

  const fileStrip = document.createElement("div");
  fileStrip.className = `cb-coords cb-coords-files ${placementClass}`;
  const rankStrip = document.createElement("div");
  rankStrip.className = `cb-coords cb-coords-ranks ${placementClass} cb-coords-${coords.ranksPosition}`;

  for (let i = 0; i < 8; i++) {
    const fileIndex = asWhite ? i : 7 - i;
    const el = document.createElement("span");
    el.className = "cb-coord";
    el.textContent = fileLabel(state, fileIndex);
    if (inside) {
      // Even (file + rank) is a dark square (a1), so it takes the light label.
      const edgeRank = asWhite ? 0 : 7;
      el.classList.add((fileIndex + edgeRank) % 2 === 0 ? "cb-coord-light" : "cb-coord-dark");
    }
    fileStrip.appendChild(el);
  }

  for (let i = 0; i < 8; i++) {
    const rankIndex = asWhite ? 7 - i : i;
    const el = document.createElement("span");
    el.className = "cb-coord";
    el.textContent = rankLabel(state, rankIndex);
    if (inside) {
      const edgeFile = coords.ranksPosition === "left" ? (asWhite ? 0 : 7) : asWhite ? 7 : 0;
      el.classList.add((edgeFile + rankIndex) % 2 === 0 ? "cb-coord-light" : "cb-coord-dark");
    }
    rankStrip.appendChild(el);
  }

  return [fileStrip, rankStrip];
}

export function renderWrap(element: HTMLElement, state: State): Elements {
  element.innerHTML = "";

  const instanceId = nextInstanceId();
  element.classList.add("cb-wrap");
  element.dataset.cbInstance = instanceId;
  // The board grid is inherently LTR; isolating it keeps Arabic/Hebrew hosts
  // from mirroring squares or reordering coordinate labels.
  element.setAttribute("dir", "ltr");

  const container = document.createElement("cb-container");
  const board = document.createElement("cb-board");

  const svgBelow = createSvg("cb-shapes-below");
  const svgAbove = createSvg("cb-shapes");
  svgAbove.appendChild(document.createElementNS(SVG_NS, "defs"));

  const autoPieces = document.createElement("cb-auto-pieces");

  container.appendChild(board);
  container.appendChild(svgBelow);
  container.appendChild(svgAbove);
  container.appendChild(autoPieces);

  let ghost: HTMLElement | undefined;
  if (!state.viewOnly && state.draggable.showGhost) {
    ghost = document.createElement("piece");
    ghost.className = "cb-ghost";
    container.appendChild(ghost);
  }

  let resize: HTMLElement | undefined;
  if (state.resizable && !state.viewOnly) {
    resize = document.createElement("cb-resize");
    container.appendChild(resize);
  }

  element.appendChild(container);
  for (const strip of renderCoords(state)) element.appendChild(strip);

  // Outside coordinates turn the wrap into a grid so the strips claim their own
  // tracks instead of overlapping the board.
  const outside =
    state.coordinates.show &&
    state.coordinates.placement === "outside";
  element.classList.toggle("cb-outside-coords", outside);
  element.classList.toggle("cb-ranks-left", outside && state.coordinates.ranksPosition === "left");
  element.classList.toggle("cb-ranks-right", outside && state.coordinates.ranksPosition !== "left");

  applyWrapClasses(element, state);

  return {
    wrap: element,
    container: container as HTMLElement,
    board: board as HTMLElement,
    ghost,
    resize,
    svgBelow,
    svgAbove,
    autoPieces: autoPieces as HTMLElement,
  };
}

export function applyWrapClasses(wrap: HTMLElement, state: State): void {
  wrap.classList.toggle("orientation-white", state.orientation === "white");
  wrap.classList.toggle("orientation-black", state.orientation === "black");
  wrap.classList.toggle("manipulable", !state.viewOnly);
}

export function instanceIdOf(state: State): string {
  return state.dom.elements.wrap.dataset.cbInstance ?? "cb0";
}
