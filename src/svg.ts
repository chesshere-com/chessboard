/*
 * Shape rendering.
 *
 * The SVG layers use a scale-free user space: viewBox "-4 -4 8 8" makes one
 * square exactly one unit with the origin at the board centre, so orientation
 * is a sign flip and no shape geometry depends on pixel size. Stroke widths
 * follow the chess convention of 1/64 board units (brush lineWidth 10 is the
 * default arrow).
 *
 * Sync is hash-based: every root shape becomes one <g cb-hash="...">, and a
 * re-render matches groups by hash, appending and removing only. A full-list
 * hash short-circuits the whole pass, which is what keeps drag frames free.
 */

import type { Brush, Key, Pos, PxPos, Shape } from "./types.ts";
import type { State } from "./dom-state.ts";
import { key2pos } from "./geometry.ts";
import { expandRegion } from "./region.ts";
import { instanceIdOf } from "./wrap.ts";

const SVG_NS = "http://www.w3.org/2000/svg";

/** Arrow tip stops this far short of the target centre (user units). */
const ARROW_MARGIN = 0.22;
/** Extra shortening when several arrows converge on one square. */
const CONVERGE_MARGIN = 0.34;
const CIRCLE_RADIUS = 0.46;
const CIRCLE_STROKE = 4 / 64;
/** Outline ring for `outline` arrows; half of it sits outside the fill. */
const OUTLINE_STROKE = 4.5 / 64;
/** 16 slots of 22.5 degrees each; 90 degrees is 4 slots. */
const ANGLE_SLOTS = 16;
const CONVERGE_SLOT_SPAN = 4;

const DEFAULT_BRUSH = "green";

interface RenderItem {
  hash: string;
  shape: Shape;
  brush: Brush;
  /** extra arrow shortening decided by the converge pass */
  shorten?: boolean;
}

/**
 * Effects removed on animationend must not be resurrected by the next sync.
 * Keyed on the state, not on any element: redrawAll replaces the overlay host
 * (and mints a new instance id), which would otherwise replay every effect.
 */
const consumedEffects = new WeakMap<State, Set<string>>();

function svgEl(tag: string, attrs: Record<string, string | number>): SVGElement {
  const node = document.createElementNS(SVG_NS, tag);
  for (const name of Object.keys(attrs)) node.setAttribute(name, String(attrs[name]));
  return node;
}

/** Square centre in user space; both axes flip for black. */
function orient(pos: Pos, asWhite: boolean): PxPos {
  return asWhite ? [pos[0] - 3.5, 3.5 - pos[1]] : [3.5 - pos[0], pos[1] - 3.5];
}

function brushOf(state: State, key: string | undefined): Brush {
  const brushes = state.drawable.brushes;
  return brushes[key ?? DEFAULT_BRUSH] ?? brushes[DEFAULT_BRUSH] ?? {
    key: "fallback",
    color: "#15781B",
    opacity: 1,
    lineWidth: 10,
  };
}

/**
 * Exported for tests. The brush is hashed by value, not by key: brushes are
 * reconfigurable at runtime, and a recolour under the same key must repaint.
 */
export function shapeHash(shape: Shape, brush: Brush, asWhite: boolean, shorten: boolean): string {
  const parts: (string | number)[] = [
    shape.type,
    brush.key,
    brush.color,
    brush.opacity,
    brush.lineWidth,
    asWhite ? "w" : "b",
    shorten ? "s" : "",
  ];
  switch (shape.type) {
    case "arrow":
      parts.push(shape.from, shape.to, shape.hilite ?? "", shape.outline ?? "", shape.lineWidth ?? "", shape.label ?? "");
      break;
    case "circle":
      parts.push(shape.square);
      break;
    case "region":
      parts.push(JSON.stringify(shape.region));
      break;
    case "glyph":
      parts.push(shape.square, JSON.stringify(shape.glyph), shape.scale ?? "");
      break;
    case "label":
      parts.push(shape.square, shape.text, shape.fill ?? "");
      break;
    case "piece":
      parts.push(shape.square, shape.piece.color, shape.piece.role, shape.scale ?? "");
      break;
    case "effect":
      parts.push(shape.square, shape.effect, shape.sticky ? "1" : "");
      break;
  }
  return parts.join(",");
}

function angleSlot(from: PxPos, to: PxPos): number {
  const angle = Math.atan2(to[1] - from[1], to[0] - from[0]);
  const slot = Math.round((angle / (2 * Math.PI)) * ANGLE_SLOTS);
  return ((slot % ANGLE_SLOTS) + ANGLE_SLOTS) % ANGLE_SLOTS;
}

function slotDistance(a: number, b: number): number {
  const raw = Math.abs(a - b);
  return Math.min(raw, ANGLE_SLOTS - raw);
}

/**
 * Two arrows landing on the same square from similar directions overlap head
 * to head; shortening both leaves the destination readable.
 */
function markConverging(items: RenderItem[], asWhite: boolean): void {
  const byDest: Map<Key, { item: RenderItem; slot: number }[]> = new Map();
  for (const item of items) {
    if (item.shape.type !== "arrow") continue;
    const slot = angleSlot(
      orient(key2pos(item.shape.from), asWhite),
      orient(key2pos(item.shape.to), asWhite),
    );
    const bucket = byDest.get(item.shape.to);
    if (bucket) bucket.push({ item, slot });
    else byDest.set(item.shape.to, [{ item, slot }]);
  }
  for (const bucket of byDest.values()) {
    if (bucket.length < 2) continue;
    for (const a of bucket) {
      for (const b of bucket) {
        if (a === b || a.slot === b.slot) continue;
        if (slotDistance(a.slot, b.slot) <= CONVERGE_SLOT_SPAN) {
          a.item.shorten = true;
          b.item.shorten = true;
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Glyph path data (original, authored in a -1..1 box centred on the origin)
// ---------------------------------------------------------------------------

const STAR_PATH = (() => {
  const points: string[] = [];
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? 1 : 0.42;
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    points.push(`${(Math.cos(angle) * radius).toFixed(4)},${(Math.sin(angle) * radius).toFixed(4)}`);
  }
  return `M${points.join("L")}Z`;
})();

const CROSS_PATH =
  "M-0.86,-0.62 L-0.62,-0.86 L0,-0.24 L0.62,-0.86 L0.86,-0.62 L0.24,0 " +
  "L0.86,0.62 L0.62,0.86 L0,0.24 L-0.62,0.86 L-0.86,0.62 L-0.24,0 Z";

const CHECK_PATH = "M-0.9,0.06 L-0.6,-0.24 L-0.28,0.08 L0.62,-0.82 L0.92,-0.52 L-0.28,0.68 Z";

function glyphContent(shape: Extract<Shape, { type: "glyph" }>, color: string): SVGElement[] {
  const glyph = shape.glyph;
  switch (glyph.kind) {
    case "star":
      return [svgEl("path", { d: STAR_PATH, fill: color })];
    case "cross":
      return [svgEl("path", { d: CROSS_PATH, fill: color })];
    case "check":
      return [svgEl("path", { d: CHECK_PATH, fill: color })];
    case "target":
      return [
        svgEl("circle", { cx: 0, cy: 0, r: 0.92, fill: "none", stroke: color, "stroke-width": 0.2 }),
        svgEl("circle", { cx: 0, cy: 0, r: 0.5, fill: "none", stroke: color, "stroke-width": 0.2 }),
        svgEl("circle", { cx: 0, cy: 0, r: 0.16, fill: color }),
      ];
    case "question": {
      const text = svgEl("text", {
        x: 0,
        y: 0,
        fill: color,
        "font-size": 2,
        "font-weight": "bold",
        "text-anchor": "middle",
        "dominant-baseline": "central",
      });
      text.textContent = "?";
      return [text];
    }
    case "custom": {
      const group = svgEl("g", {});
      // Documented trusted input: callers embed their own lesson artwork.
      group.innerHTML = glyph.svg;
      return [group];
    }
  }
}

// ---------------------------------------------------------------------------
// Shape builders
// ---------------------------------------------------------------------------

/**
 * Shaft plus head as one closed outline, so a stroke can ring the head too (a
 * marker cannot be outlined to match its line). Head proportions reproduce the
 * marker path below, in multiples of the shaft width `w`.
 */
function outlinedArrowPath(from: PxPos, tip: PxPos, w: number): string {
  const dx = tip[0] - from[0];
  const dy = tip[1] - from[1];
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const at = (along: number, across: number): string =>
    `${round(from[0] + ux * along - uy * across)},${round(from[1] + uy * along + ux * across)}`;
  const h = w / 2;
  const neck = Math.max(0, len - 2.62 * w);
  const back = Math.max(0, len - 3.17 * w);
  return (
    `M${at(0, -h)} L${at(neck, -h)} L${at(back, -1.42 * w)} L${at(len, 0)} ` +
    `L${at(back, 1.42 * w)} L${at(neck, h)} L${at(0, h)} A${round(h)},${round(h)} 0 0 1 ${at(0, -h)} Z`
  );
}

function round(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function buildArrow(
  shape: Extract<Shape, { type: "arrow" }>,
  brush: Brush,
  asWhite: boolean,
  shorten: boolean,
  markerId: string,
): SVGElement {
  const group = svgEl("g", {});
  const from = orient(key2pos(shape.from), asWhite);
  const to = orient(key2pos(shape.to), asWhite);
  const width = (shape.lineWidth ?? brush.lineWidth) / 64;
  const angle = Math.atan2(to[1] - from[1], to[0] - from[0]);
  const margin = ARROW_MARGIN + (shorten ? CONVERGE_MARGIN : 0);
  const endX = to[0] - Math.cos(angle) * margin;
  const endY = to[1] - Math.sin(angle) * margin;

  if (shape.outline) {
    group.setAttribute("opacity", String(brush.opacity));
    group.appendChild(
      svgEl("path", {
        d: outlinedArrowPath(from, [endX, endY], width),
        fill: brush.color,
        stroke: shape.outline,
        "stroke-width": OUTLINE_STROKE,
        "stroke-linejoin": "round",
        "paint-order": "stroke",
      }),
    );
  } else if (shape.hilite) {
    group.appendChild(
      svgEl("line", {
        x1: from[0],
        y1: from[1],
        x2: endX,
        y2: endY,
        stroke: shape.hilite,
        "stroke-width": width * 2.1,
        "stroke-linecap": "round",
        opacity: 0.45,
      }),
    );
  }

  if (!shape.outline) {
    group.appendChild(
      svgEl("line", {
        x1: from[0],
        y1: from[1],
        x2: endX,
        y2: endY,
        stroke: brush.color,
        "stroke-width": width,
        "stroke-linecap": "round",
        opacity: brush.opacity,
        "marker-end": `url(#${markerId})`,
      }),
    );
  }

  if (shape.label) {
    const label = svgEl("text", {
      x: (from[0] + endX) / 2,
      y: (from[1] + endY) / 2,
      fill: brush.color,
      "font-size": 0.42,
      "font-weight": "bold",
      "text-anchor": "middle",
      "dominant-baseline": "central",
      "paint-order": "stroke",
      stroke: "#fff",
      "stroke-width": 0.09,
    });
    label.textContent = shape.label;
    group.appendChild(label);
  }
  return group;
}

function buildCircle(
  shape: Extract<Shape, { type: "circle" }>,
  brush: Brush,
  asWhite: boolean,
): SVGElement {
  const centre = orient(key2pos(shape.square), asWhite);
  const group = svgEl("g", {});
  group.appendChild(
    svgEl("circle", {
      cx: centre[0],
      cy: centre[1],
      r: CIRCLE_RADIUS,
      fill: "none",
      stroke: brush.color,
      "stroke-width": CIRCLE_STROKE,
      opacity: brush.opacity,
    }),
  );
  return group;
}

function buildRegion(
  shape: Extract<Shape, { type: "region" }>,
  brush: Brush,
  asWhite: boolean,
): SVGElement {
  const group = svgEl("g", {});
  for (const square of expandRegion(shape.region)) {
    const centre = orient(key2pos(square), asWhite);
    group.appendChild(
      svgEl("rect", {
        x: centre[0] - 0.5,
        y: centre[1] - 0.5,
        width: 1,
        height: 1,
        fill: brush.color,
        opacity: 0.35 * brush.opacity,
      }),
    );
  }
  return group;
}

function buildGlyph(
  shape: Extract<Shape, { type: "glyph" }>,
  brush: Brush,
  asWhite: boolean,
): SVGElement {
  const centre = orient(key2pos(shape.square), asWhite);
  const scale = (shape.scale ?? 1) * 0.36;
  const group = svgEl("g", {
    transform: `translate(${centre[0]},${centre[1]}) scale(${scale})`,
    opacity: brush.opacity,
  });
  for (const child of glyphContent(shape, brush.color)) group.appendChild(child);
  return group;
}

function labelFontSize(text: string): number {
  if (text.length <= 1) return 0.5;
  if (text.length === 2) return 0.4;
  if (text.length === 3) return 0.32;
  return 0.26;
}

function buildLabel(
  shape: Extract<Shape, { type: "label" }>,
  brush: Brush,
  asWhite: boolean,
): SVGElement {
  const centre = orient(key2pos(shape.square), asWhite);
  const group = svgEl("g", {});
  group.appendChild(
    svgEl("circle", {
      cx: centre[0],
      cy: centre[1],
      r: 0.34,
      fill: shape.fill ?? brush.color,
      opacity: brush.opacity,
    }),
  );
  const text = svgEl("text", {
    x: centre[0],
    y: centre[1],
    fill: "#fff",
    "font-size": labelFontSize(shape.text),
    "font-weight": "bold",
    "text-anchor": "middle",
    "dominant-baseline": "central",
  });
  text.textContent = shape.text;
  group.appendChild(text);
  return group;
}

// ---------------------------------------------------------------------------
// Defs / markers
// ---------------------------------------------------------------------------

/** Anything outside this set would break the `url(#id)` reference. */
function idSafe(value: string): string {
  return value.replace(/[^a-zA-Z0-9]+/g, "-");
}

/**
 * Paint, not key, decides identity: a marker element cannot be repainted in
 * place, so a recoloured brush has to resolve to a different id for syncDefs
 * to build a replacement and drop the old one.
 */
function markerIdFor(instance: string, brush: Brush): string {
  return `cb-arrow-${instance}-${idSafe(brush.key)}-${idSafe(brush.color)}-${idSafe(String(brush.opacity))}`;
}

function syncDefs(svg: SVGElement, items: RenderItem[], instance: string): void {
  let defs = svg.querySelector("defs");
  if (!defs) {
    defs = document.createElementNS(SVG_NS, "defs");
    svg.insertBefore(defs, svg.firstChild);
  }
  const wanted: Map<string, Brush> = new Map();
  for (const item of items) {
    if (item.shape.type === "arrow" && !item.shape.outline) wanted.set(markerIdFor(instance, item.brush), item.brush);
  }

  const existing: Set<string> = new Set();
  for (const child of Array.from(defs.children)) {
    const id = child.getAttribute("id") ?? "";
    if (wanted.has(id)) existing.add(id);
    else defs.removeChild(child);
  }

  for (const [id, brush] of wanted) {
    if (existing.has(id)) continue;
    const marker = svgEl("marker", {
      id,
      viewBox: "0 0 6 6",
      refX: 6,
      refY: 3,
      markerWidth: 3.4,
      markerHeight: 3.4,
      markerUnits: "strokeWidth",
      orient: "auto",
    });
    marker.appendChild(
      svgEl("path", {
        d: "M0.4,0.5 L6,3 L0.4,5.5 L1.9,3 Z",
        fill: brush.color,
        opacity: brush.opacity,
      }),
    );
    defs.appendChild(marker);
  }
}

// ---------------------------------------------------------------------------
// Layer sync
// ---------------------------------------------------------------------------

function syncLayer(
  svg: SVGElement,
  items: RenderItem[],
  build: (item: RenderItem) => SVGElement,
): void {
  const pool: Map<string, SVGElement[]> = new Map();
  for (const child of Array.from(svg.children)) {
    const hash = child.getAttribute("cb-hash");
    if (hash === null) continue;
    const bucket = pool.get(hash);
    if (bucket) bucket.push(child as SVGElement);
    else pool.set(hash, [child as SVGElement]);
  }

  for (const item of items) {
    const bucket = pool.get(item.hash);
    if (bucket && bucket.length) {
      bucket.pop();
      continue;
    }
    const group = build(item);
    group.setAttribute("cb-hash", item.hash);
    svg.appendChild(group);
  }

  for (const bucket of pool.values()) {
    for (const leftover of bucket) svg.removeChild(leftover);
  }
}

function syncOverlay(state: State, items: RenderItem[]): void {
  const host = state.dom.elements.autoPieces;
  if (!host) return;
  const bounds = state.dom.bounds();
  const asWhite = state.orientation === "white";
  const size = bounds.width / 8;

  const consumed = consumedEffects.get(state) ?? new Set<string>();
  consumedEffects.set(state, consumed);

  const pool: Map<string, HTMLElement[]> = new Map();
  for (const child of Array.from(host.children)) {
    const hash = child.getAttribute("cb-hash") ?? "";
    const bucket = pool.get(hash);
    if (bucket) bucket.push(child as HTMLElement);
    else pool.set(hash, [child as HTMLElement]);
  }

  // An effect that left the shape list may be re-added later; forgetting it
  // here is what lets a caller replay the same effect on the same square.
  const desired = new Set(items.map((item) => item.hash));
  for (const hash of consumed) {
    if (!desired.has(hash)) consumed.delete(hash);
  }

  for (const item of items) {
    const shape = item.shape;
    if (shape.type !== "piece" && shape.type !== "effect") continue;
    if (shape.type === "effect" && consumed.has(item.hash)) continue;

    const pos = key2pos(shape.square);
    const x = (asWhite ? pos[0] : 7 - pos[0]) * size;
    const y = (asWhite ? 7 - pos[1] : pos[1]) * size;

    const bucket = pool.get(item.hash);
    let el = bucket && bucket.length ? bucket.pop() : undefined;
    if (!el) {
      if (shape.type === "piece") {
        el = document.createElement("piece");
        el.className = `${shape.piece.color} ${shape.piece.role}`;
        el.style.opacity = "0.3";
      } else {
        el = document.createElement("div");
        el.className = `cb-effect cb-effect-${shape.effect}`;
        if (!shape.sticky) {
          const hash = item.hash;
          el.addEventListener("animationend", () => {
            consumed.add(hash);
            el?.remove();
          });
        }
      }
      el.setAttribute("cb-hash", item.hash);
      host.appendChild(el);
    }
    const scale = shape.type === "piece" ? (shape.scale ?? 1) : 1;
    el.style.transform =
      scale === 1 ? `translate(${x}px,${y}px)` : `translate(${x}px,${y}px) scale(${scale})`;
  }

  for (const bucket of pool.values()) {
    for (const leftover of bucket) leftover.remove();
  }
}

// ---------------------------------------------------------------------------

function collect(state: State): RenderItem[] {
  const asWhite = state.orientation === "white";
  const shapes: Shape[] = [...state.drawable.autoShapes, ...state.drawable.shapes];

  const live = state.drawable.current;
  if (live && live.dest) {
    shapes.push({ type: "arrow", from: live.orig, to: live.dest, brush: live.brush });
  } else if (live) {
    shapes.push({ type: "circle", square: live.orig, brush: live.brush });
  }

  const premove = state.premovable.current;
  if (premove && state.premovable.enabled) {
    shapes.push({ type: "arrow", from: premove.from, to: premove.to, brush: "paleBlue" });
  }

  const items: RenderItem[] = shapes.map((shape) => {
    const brushKey =
      shape.type === "label" || shape.type === "piece" || shape.type === "effect"
        ? DEFAULT_BRUSH
        : (shape.brush ?? DEFAULT_BRUSH);
    return { hash: "", shape, brush: brushOf(state, brushKey) };
  });

  markConverging(items, asWhite);
  for (const item of items) {
    item.hash = shapeHash(item.shape, item.brush, asWhite, item.shorten === true);
  }
  return items;
}

export function renderSvg(state: State): void {
  const elements = state.dom.elements;
  const svgBelow = elements.svgBelow;
  const svgAbove = elements.svgAbove;
  if (!svgBelow || !svgAbove) return;

  const items = state.drawable.visible ? collect(state) : [];
  const bounds = state.dom.bounds();
  const fullHash = `${items.map((i) => i.hash).join("|")}#${Math.round(bounds.width)}x${Math.round(
    bounds.height,
  )}#${state.orientation}`;
  if (fullHash === state.drawable.prevSvgHash) return;
  state.drawable.prevSvgHash = fullHash;

  const asWhite = state.orientation === "white";
  const instance = instanceIdOf(state);

  const below: RenderItem[] = [];
  const above: RenderItem[] = [];
  const overlay: RenderItem[] = [];
  for (const item of items) {
    if (item.shape.type === "piece" || item.shape.type === "effect") overlay.push(item);
    else if (item.shape.type === "region") below.push(item);
    else above.push(item);
  }

  syncDefs(svgAbove, above, instance);

  const build = (item: RenderItem): SVGElement => {
    const shape = item.shape;
    switch (shape.type) {
      case "arrow":
        return buildArrow(
          shape,
          item.brush,
          asWhite,
          item.shorten === true,
          markerIdFor(instance, item.brush),
        );
      case "circle":
        return buildCircle(shape, item.brush, asWhite);
      case "region":
        return buildRegion(shape, item.brush, asWhite);
      case "glyph":
        return buildGlyph(shape, item.brush, asWhite);
      case "label":
        return buildLabel(shape, item.brush, asWhite);
      default:
        return svgEl("g", {});
    }
  };

  syncLayer(svgBelow, below, build);
  syncLayer(svgAbove, above, build);
  syncOverlay(state, overlay);
}

export function clearSvgCache(state: State): void {
  state.drawable.prevSvgHash = "";
}
