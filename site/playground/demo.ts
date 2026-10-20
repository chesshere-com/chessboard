/*
 * Dev-only demo harness. Vanilla TS, no framework, no dependencies — the point
 * is to exercise the component exactly as a plain consumer would.
 *
 * The move generator below is demo-only and deliberately naive (pseudo-legal:
 * no pin or check detection). Legality is the caller's job by design, and this
 * stands in for the real engine so the dests pipeline can be driven by hand.
 */

import "../../assets/chess-board.css";
import "../../assets/piece-sets.css";
import "../../assets/chrome.css";

import { ChessBoard, pos2key, readFen } from "../../src/index.ts";
import { mountGameFrame } from "./game-frame.tsx";
import type { Api, Color, Dests, Key, MoveMetadata, Piece, Pieces, Pos, Shape } from "../../src/index.ts";

// ---------------------------------------------------------------------------
// Demo-only pseudo-legal move generation
// ---------------------------------------------------------------------------

type Step = [number, number];

const KNIGHT_STEPS: Step[] = [
  [1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2],
];
const DIAGONALS: Step[] = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
const ORTHOGONALS: Step[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function pieceAt(pieces: Pieces, file: number, rank: number): Piece | undefined {
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return undefined;
  return pieces.get(pos2key([file, rank]));
}

function slide(pieces: Pieces, from: Pos, color: Color, steps: Step[], limit: number): Key[] {
  const out: Key[] = [];
  for (const [df, dr] of steps) {
    let file = from[0] + df;
    let rank = from[1] + dr;
    let taken = 0;
    while (file >= 0 && file <= 7 && rank >= 0 && rank <= 7 && taken < limit) {
      const occupant = pieces.get(pos2key([file, rank]));
      if (!occupant) out.push(pos2key([file, rank]));
      else {
        if (occupant.color !== color) out.push(pos2key([file, rank]));
        break;
      }
      file += df;
      rank += dr;
      taken += 1;
    }
  }
  return out;
}

function pawnDests(pieces: Pieces, from: Pos, color: Color): Key[] {
  const out: Key[] = [];
  const forward = color === "white" ? 1 : -1;
  const homeRank = color === "white" ? 1 : 6;
  const [file, rank] = from;
  const ahead = rank + forward;
  if (ahead >= 0 && ahead <= 7 && !pieceAt(pieces, file, ahead)) {
    out.push(pos2key([file, ahead]));
    const twoAhead = rank + 2 * forward;
    if (rank === homeRank && !pieceAt(pieces, file, twoAhead)) out.push(pos2key([file, twoAhead]));
  }
  for (const side of [-1, 1]) {
    const target = pieceAt(pieces, file + side, ahead);
    if (target && target.color !== color) out.push(pos2key([file + side, ahead]));
  }
  return out;
}

function castleDests(pieces: Pieces, from: Pos, color: Color): Key[] {
  const backRank = color === "white" ? 0 : 7;
  if (from[1] !== backRank) return [];
  const out: Key[] = [];
  for (let file = 0; file <= 7; file++) {
    const candidate = pieces.get(pos2key([file, backRank]));
    if (!candidate || candidate.color !== color || candidate.role !== "rook") continue;
    const direction = file > from[0] ? 1 : -1;
    let clear = true;
    for (let f = from[0] + direction; f !== file; f += direction) {
      if (pieces.get(pos2key([f, backRank]))) clear = false;
    }
    // King-onto-rook is the 960 form; board.ts rewrites it into the castled
    // placement via movable.rookCastle.
    if (clear) out.push(pos2key([file, backRank]));
    if (clear && from[0] === 4) out.push(pos2key([direction > 0 ? 6 : 2, backRank]));
  }
  return out;
}

function demoDests(pieces: Pieces, color: Color): Dests {
  const dests: Dests = new Map();
  for (const [key, piece] of pieces) {
    if (piece.color !== color) continue;
    const from: Pos = [key.charCodeAt(0) - 97, key.charCodeAt(1) - 49];
    let targets: Key[];
    switch (piece.role) {
      case "pawn":
        targets = pawnDests(pieces, from, color);
        break;
      case "knight":
        targets = KNIGHT_STEPS.map(([df, dr]): Pos => [from[0] + df, from[1] + dr])
          .filter((p) => p[0] >= 0 && p[0] <= 7 && p[1] >= 0 && p[1] <= 7)
          .filter((p) => pieces.get(pos2key(p))?.color !== color)
          .map(pos2key);
        break;
      case "bishop":
        targets = slide(pieces, from, color, DIAGONALS, 8);
        break;
      case "rook":
        targets = slide(pieces, from, color, ORTHOGONALS, 8);
        break;
      case "queen":
        targets = slide(pieces, from, color, [...DIAGONALS, ...ORTHOGONALS], 8);
        break;
      case "king":
        targets = [
          ...slide(pieces, from, color, [...DIAGONALS, ...ORTHOGONALS], 1),
          ...castleDests(pieces, from, color),
        ];
        break;
    }
    if (targets.length) dests.set(key, targets);
  }
  return dests;
}

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

function need<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`demo: missing #${id}`);
  return el as T;
}

interface PeekState {
  turnColor: Color;
  pieces: Pieces;
  orientation: Color;
}

const peek = (api: Api): PeekState => api.state as PeekState;

const PIECE_SETS = [
  "cburnett", "celtic", "chessnut", "fantasy", "firi", "flat-cc0",
  "font-awesome", "kiwen-suwi", "livius", "material-design", "rhosgfx", "spatial",
];

const PRESETS: Record<string, string> = {
  start: "start",
  clear: "8/8/8/8/8/8/8/8",
  promotion: "4k3/3P4/8/8/8/8/4p3/4K3",
  endgame: "r3k3/5ppp/8/8/8/8/5PPP/2B1K2R",
  castle960: "1k6/8/8/8/8/8/8/1KR4R",
};

// ---------------------------------------------------------------------------
// Board A
// ---------------------------------------------------------------------------

const hostA = need("board-a");
const tagA = need("a-tag");
const fenOut = need("a-fen");
const materialOut = need("a-material");
const eventOut = need("a-event");

const freeToggle = need<HTMLInputElement>("opt-free");
const viewOnlyToggle = need<HTMLInputElement>("opt-viewonly");
const ghostToggle = need<HTMLInputElement>("opt-ghost");

function note(text: string): void {
  eventOut.textContent = text;
}

const boardA: Api = ChessBoard(hostA, {
  resizable: true,
  movable: {
    free: true,
    color: "both",
    events: { after: (orig, dest, meta) => onMove(orig, dest, meta) },
  },
  premovable: {
    enabled: true,
    events: {
      set: (orig, dest) => note(`premove set ${orig}${dest}`),
      unset: () => note("premove unset"),
    },
  },
  drawable: {
    enabled: true,
    onChange: (shapes) => note(`drawing: ${shapes.length} user shape(s)`),
  },
  events: {
    change: () => syncReadout(),
    select: (key) => note(`select ${key}`),
    cancel: () => note("cancel"),
  },
});

function onMove(orig: Key, dest: Key, meta: MoveMetadata): void {
  const bits = [
    `${orig}${dest}`,
    meta.promotion ? `=${meta.promotion}` : "",
    meta.captured ? ` x${meta.captured.role}` : "",
    meta.premove ? " (premove)" : "",
    meta.byDrag ? " [drag]" : " [click]",
  ];
  note(`move ${bits.join("")}`);
  applyMoveMode();
}

function syncReadout(): void {
  fenOut.textContent = boardA.getFen();
  const diff = boardA.getMaterialDiff();
  const roles = ["queen", "rook", "bishop", "knight", "pawn"] as const;
  const side = (which: "white" | "black"): string =>
    roles
      .map((role) => (diff.capturedBy[which][role] ? `${diff.capturedBy[which][role]}${role[0]}` : ""))
      .filter(Boolean)
      .join(" ") || "-";
  const sign = diff.score > 0 ? "+" : "";
  materialOut.textContent = `W captured: ${side("white")} | B captured: ${side("black")} | score ${sign}${diff.score}`;
}

function applyMoveMode(): void {
  const free = freeToggle.checked;
  tagA.textContent = free ? "free mode" : "dests mode";
  if (free) {
    boardA.set({ movable: { free: true, color: "both", dests: undefined } });
  } else {
    const current = peek(boardA);
    boardA.set({
      movable: { free: false, color: "both", dests: demoDests(current.pieces, current.turnColor) },
    });
  }
  syncReadout();
}

// --- position controls ------------------------------------------------------

const fenInput = need<HTMLInputElement>("fen-input");
need("fen-set").addEventListener("click", () => {
  const value = fenInput.value.trim();
  if (value) {
    boardA.set({ fen: value, turnColor: "white" });
    applyMoveMode();
  }
});

for (const button of Array.from(document.querySelectorAll("[data-preset]"))) {
  button.addEventListener("click", () => {
    const name = (button as HTMLElement).dataset.preset ?? "start";
    const fen = PRESETS[name] ?? "start";
    fenInput.value = fen;
    boardA.set({
      fen,
      turnColor: "white",
      lastMove: undefined,
      variant: { key: name === "castle960" ? "chess960" : "standard" },
    });
    applyMoveMode();
    note(`preset ${name}`);
  });
}

// --- interaction controls ---------------------------------------------------

freeToggle.addEventListener("change", () => applyMoveMode());
viewOnlyToggle.addEventListener("change", () => {
  boardA.set({ viewOnly: viewOnlyToggle.checked });
});
ghostToggle.addEventListener("change", () => {
  boardA.set({ draggable: { showGhost: ghostToggle.checked } });
});
need("flip").addEventListener("click", () => boardA.toggleOrientation());
need("stop").addEventListener("click", () => {
  boardA.stop();
  note("stop() — board is now inert");
});

// --- appearance -------------------------------------------------------------

const pieceSetSelect = need<HTMLSelectElement>("piece-set");
for (const name of PIECE_SETS) {
  const option = document.createElement("option");
  option.value = name;
  option.textContent = name;
  pieceSetSelect.appendChild(option);
}
pieceSetSelect.value = "cburnett";
pieceSetSelect.addEventListener("change", () => {
  hostA.dataset.cbPieces = pieceSetSelect.value;
});

const coordsSelect = need<HTMLSelectElement>("coords");
const ranksSelect = need<HTMLSelectElement>("ranks-position");
function applyCoords(): void {
  const placement = coordsSelect.value as "inside" | "outside" | "hidden";
  boardA.set({
    coordinates: {
      show: placement !== "hidden",
      placement,
      ranksPosition: ranksSelect.value as "left" | "right",
    },
  });
  boardA.redrawAll();
}
coordsSelect.addEventListener("change", applyCoords);
ranksSelect.addEventListener("change", applyCoords);

const animRange = need<HTMLInputElement>("anim");
const animOut = need<HTMLOutputElement>("anim-out");
animRange.addEventListener("input", () => {
  const duration = Number(animRange.value);
  animOut.textContent = `${duration} ms${duration < 40 ? " (off)" : ""}`;
  boardA.set({ animation: { enabled: duration >= 40, duration } });
});

// --- shapes -----------------------------------------------------------------

const SHAPE_SETS: Record<string, Shape[]> = {
  arrows: [
    { type: "arrow", from: "e2", to: "e4" },
    { type: "arrow", from: "g1", to: "f3", brush: "blue" },
    { type: "arrow", from: "d1", to: "h5", brush: "red", label: "?!" },
    { type: "arrow", from: "b1", to: "c3", brush: "yellow", hilite: "#ffe066" },
  ],
  converging: [
    { type: "arrow", from: "e2", to: "e4" },
    { type: "arrow", from: "c2", to: "e4", brush: "red" },
    { type: "arrow", from: "g2", to: "e4", brush: "blue" },
  ],
  circles: [
    { type: "circle", square: "d4" },
    { type: "circle", square: "e5", brush: "red" },
    { type: "circle", square: "f6", brush: "blue" },
    { type: "circle", square: "c3", brush: "yellow" },
  ],
  glyphs: [
    { type: "glyph", square: "a1", glyph: { kind: "star" }, brush: "yellow" },
    { type: "glyph", square: "b2", glyph: { kind: "target" }, brush: "red" },
    { type: "glyph", square: "c3", glyph: { kind: "cross" }, brush: "red" },
    { type: "glyph", square: "d4", glyph: { kind: "check" }, brush: "green" },
    { type: "glyph", square: "e5", glyph: { kind: "question" }, brush: "blue" },
    {
      type: "glyph",
      square: "f6",
      glyph: { kind: "custom", svg: '<rect x="-0.8" y="-0.8" width="1.6" height="1.6" rx="0.3" fill="#e68f00"/>' },
    },
  ],
  regions: [
    { type: "region", region: { kind: "diagonal", from: "a1", to: "h8" }, brush: "paleGreen" },
    { type: "region", region: { kind: "rank", rank: "4" }, brush: "paleBlue" },
    { type: "region", region: { kind: "file", file: "d" }, brush: "paleRed" },
    { type: "region", region: { kind: "squares", squares: ["b7", "g7", "b2", "g2"] }, brush: "yellow" },
  ],
  labels: [
    { type: "label", square: "e4", text: "1" },
    { type: "label", square: "d5", text: "12" },
    { type: "label", square: "c6", text: "0.42" },
  ],
  pieces: [
    { type: "piece", square: "e4", piece: { color: "white", role: "queen" } },
    { type: "piece", square: "d5", piece: { color: "black", role: "knight" }, scale: 0.75 },
  ],
  effects: [
    { type: "effect", square: "e4", effect: "correct" },
    { type: "effect", square: "d4", effect: "wrong" },
    { type: "effect", square: "c4", effect: "pulse" },
    { type: "effect", square: "b4", effect: "glow" },
    { type: "effect", square: "a4", effect: "shake" },
  ],
  clear: [],
};

for (const button of Array.from(document.querySelectorAll("[data-shapes]"))) {
  button.addEventListener("click", () => {
    const name = (button as HTMLElement).dataset.shapes ?? "clear";
    const shapes = SHAPE_SETS[name] ?? [];
    // Clearing first lets a repeat press replay one-shot effect animations.
    boardA.setAutoShapes([]);
    if (shapes.length) window.setTimeout(() => boardA.setAutoShapes(shapes), 60);
    note(`autoShapes: ${name} (${shapes.length})`);
  });
}

// --- premove ----------------------------------------------------------------

need("premove-setup").addEventListener("click", () => {
  freeToggle.checked = false;
  tagA.textContent = "premove scenario";
  boardA.set({
    fen: "start",
    turnColor: "black",
    lastMove: undefined,
    // White may act, but it is black's turn: any white input becomes a premove.
    movable: { free: false, color: "white", dests: new Map() },
  });
  syncReadout();
  note("black to move — drag a white piece to store a premove");
});

need("premove-play").addEventListener("click", () => {
  const before = peek(boardA);
  const blackDests = demoDests(before.pieces, "black");
  const preferred = blackDests.get("e7")?.includes("e5") ? (["e7", "e5"] as const) : undefined;
  const fallback = Array.from(blackDests.entries()).find(([, list]) => list.length > 0);
  const reply = preferred ?? (fallback ? ([fallback[0], fallback[1][0]] as const) : undefined);
  if (!reply) {
    note("no black reply available");
    return;
  }
  boardA.move(reply[0], reply[1]);
  const after = peek(boardA);
  boardA.set({
    turnColor: "white",
    movable: { free: false, color: "white", dests: demoDests(after.pieces, "white") },
  });
  const played = boardA.playPremove();
  syncReadout();
  note(`black played ${reply[0]}${reply[1]} — playPremove() -> ${played}`);
});

need("premove-cancel").addEventListener("click", () => {
  boardA.cancelPremove();
  note("cancelPremove()");
});

// ---------------------------------------------------------------------------
// Board B — a second instance to prove nothing is global
// ---------------------------------------------------------------------------

const hostB = need("board-b");
hostB.dataset.cbPieces = "fantasy";

const boardB: Api = ChessBoard(hostB, {
  fen: "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R",
  orientation: "black",
  turnColor: "white",
  coordinates: { placement: "outside", ranksPosition: "left" },
  movable: { free: true, color: "both" },
  drawable: {
    enabled: true,
    autoShapes: [
      { type: "arrow", from: "c4", to: "f7", brush: "red" },
      { type: "arrow", from: "f3", to: "e5", brush: "blue" },
      { type: "circle", square: "f7", brush: "red" },
      { type: "region", region: { kind: "diagonal", from: "a2", to: "g8" }, brush: "paleRed" },
    ],
  },
});

need("destroy-b").addEventListener("click", () => {
  boardB.destroy();
  note("board B destroyed");
});

// ---------------------------------------------------------------------------
// Game frame — the Solid wrapper + chrome modules, mounted into the vanilla
// page via solid's render(). The sections above stay framework-free.
// ---------------------------------------------------------------------------

mountGameFrame(need("game-frame"));

// ---------------------------------------------------------------------------

fenInput.value = boardA.getFen();
applyMoveMode();
syncReadout();

// Handy for manual poking from the console.
Object.assign(window as unknown as Record<string, unknown>, { boardA, boardB, demoDests, readFen });
