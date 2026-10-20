import "../assets/chess-board.css";
import "../assets/piece-sets.css";
import { Chess } from "chess.js";
import type { Square } from "chess.js";
import { ChessBoard } from "../src/index.ts";
import type { Api, Dests, Key, PromotionRole, Shape } from "../src/index.ts";

const PROMO: Record<PromotionRole, "q" | "r" | "b" | "n"> = { queen: "q", rook: "r", bishop: "b", knight: "n" };
const el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const color = (c: "w" | "b") => (c === "w" ? "white" : "black") as "white" | "black";

function destsOf(game: Chess): Dests {
  const dests: Dests = new Map();
  for (const m of game.moves({ verbose: true })) {
    const list = dests.get(m.from as Key) ?? [];
    list.push(m.to as Key);
    dests.set(m.from as Key, list);
  }
  return dests;
}

function lastMoveOf(game: Chess): Key[] | undefined {
  const last = game.history({ verbose: true }).at(-1);
  return last ? [last.from as Key, last.to as Key] : undefined;
}

// Hero: play the board against a random mover.
{
  let game = new Chess();
  const status = el("hero-status");
  const board: Api = ChessBoard(el("hero-board"), {
    movable: { color: "white", dests: destsOf(game), events: { after: (from, to, meta) => userMove(from, to, meta.promotion) } },
    premovable: { enabled: true },
  });

  const sync = (): void => {
    const turn = color(game.turn());
    board.set({
      fen: game.fen(),
      turnColor: turn,
      check: game.inCheck(),
      lastMove: lastMoveOf(game),
      movable: { color: "white", dests: turn === "white" ? destsOf(game) : new Map() },
    });
    if (game.isCheckmate()) status.textContent = turn === "white" ? "Checkmate, black wins." : "Checkmate, you win.";
    else if (game.isGameOver()) status.textContent = "Draw.";
  };

  function userMove(from: Key, to: Key, promotion?: PromotionRole): void {
    try {
      game.move({ from: from as Square, to: to as Square, promotion: promotion ? PROMO[promotion] : undefined });
    } catch {
      sync();
      return;
    }
    sync();
    if (game.isGameOver()) return;
    status.textContent = "Black is thinking...";
    setTimeout(() => {
      const moves = game.moves({ verbose: true });
      const pick = moves[Math.floor(Math.random() * moves.length)];
      game.move(pick);
      sync();
      if (!game.isGameOver()) status.textContent = "Your move.";
    }, 500);
  }

  el("hero-reset").addEventListener("click", () => {
    game = new Chess();
    status.textContent = "You are white. Drag a piece, or click and click.";
    sync();
  });
}

// Replay: the Opera Game.
{
  const san = "e4 e5 Nf3 d6 d4 Bg4 dxe5 Bxf3 Qxf3 dxe5 Bc4 Nf6 Qb3 Qe7 Nc3 c6 Bg5 b5 Nxb5 cxb5 Bxb5+ Nbd7 O-O-O Rd8 Rxd7 Rxd7 Rd1 Qe6 Bxd7+ Nxd7 Qb8+ Nxb8 Rd8#".split(" ");
  const game = new Chess();
  const steps: { fen: string; last?: Key[]; check: boolean; label: string }[] = [{ fen: game.fen(), check: false, label: "Start. Paul Morphy vs. Duke of Brunswick and Count Isouard, Paris 1858." }];
  san.forEach((m, i) => {
    const mv = game.move(m);
    steps.push({ fen: game.fen(), last: [mv.from as Key, mv.to as Key], check: game.inCheck(), label: `${Math.floor(i / 2) + 1}${i % 2 ? "..." : "."} ${m}` });
  });
  let at = 0;
  let timer: number | undefined;
  const board = ChessBoard(el("replay-board"), { viewOnly: true, animation: { duration: 280 } });
  const label = el("r-label");
  const play = el<HTMLButtonElement>("r-play");
  const show = (i: number): void => {
    at = Math.max(0, Math.min(steps.length - 1, i));
    const s = steps[at];
    board.set({ fen: s.fen, lastMove: s.last, check: s.check });
    label.textContent = s.label;
  };
  const stop = (): void => {
    window.clearInterval(timer);
    timer = undefined;
    play.textContent = "Play";
  };
  el("r-first").addEventListener("click", () => { stop(); show(0); });
  el("r-prev").addEventListener("click", () => { stop(); show(at - 1); });
  el("r-next").addEventListener("click", () => { stop(); show(at + 1); });
  el("r-last").addEventListener("click", () => { stop(); show(steps.length - 1); });
  play.addEventListener("click", () => {
    if (timer) return stop();
    if (at >= steps.length - 1) show(0);
    play.textContent = "Pause";
    timer = window.setInterval(() => {
      if (at >= steps.length - 1) return stop();
      show(at + 1);
    }, 900);
  });
  show(0);
}

// Shapes.
{
  const board = ChessBoard(el("shapes-board"), { fen: "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4", movable: { free: true, color: "both" } });
  const presets: Record<string, Shape[]> = {
    Arrows: [
      { type: "arrow", from: "h5", to: "f7", brush: "red" },
      { type: "arrow", from: "c4", to: "f7", brush: "green" },
    ],
    Regions: [
      { type: "region", region: { kind: "file", file: "f" }, brush: "paleBlue" },
      { type: "region", region: { kind: "diagonal", from: "c4", to: "g8" }, brush: "paleGreen" },
    ],
    Glyphs: [
      { type: "glyph", square: "f7", glyph: { kind: "target" } },
      { type: "glyph", square: "g8", glyph: { kind: "cross" } },
      { type: "label", square: "h5", text: "Q" },
    ],
    Effects: [
      { type: "effect", square: "f7", effect: "pulse" },
      { type: "effect", square: "c4", effect: "glow" },
    ],
    Clear: [],
  };
  const wrap = el("shape-buttons");
  const apply = (name: string): void => board.setAutoShapes(presets[name]);
  for (const name of Object.keys(presets)) {
    const b = document.createElement("button");
    b.textContent = name;
    b.addEventListener("click", () => apply(name));
    wrap.append(b);
  }
  apply("Arrows");
}

// Piece sets and theme.
{
  const host = el("theme-board");
  const board = ChessBoard(host, { fen: "start", movable: { free: true, color: "both" } });
  void board;
  host.dataset.cbPieces = "cburnett";
  const sets = ["cburnett", "celtic", "chessnut", "fantasy", "firi", "flat-cc0", "font-awesome", "kiwen-suwi", "livius", "material-design", "rhosgfx", "spatial"];
  const select = el<HTMLSelectElement>("set-select");
  for (const s of sets) select.add(new Option(s, s));
  select.addEventListener("change", () => { host.dataset.cbPieces = select.value; });
  el<HTMLInputElement>("c-light").addEventListener("input", (e) => host.style.setProperty("--cb-light", (e.target as HTMLInputElement).value));
  el<HTMLInputElement>("c-dark").addEventListener("input", (e) => host.style.setProperty("--cb-dark", (e.target as HTMLInputElement).value));
}
