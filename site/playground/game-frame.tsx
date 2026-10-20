/*
 * Demo-only "game frame": the Solid wrapper plus every chrome module wired
 * together the way a real game surface would assemble them.
 *
 * The labels below are inline English on purpose — this file is dev-only and
 * never ships. It stands in for the call site, which is exactly where i18n
 * belongs; the package itself carries no user-facing strings.
 */

import { createSignal } from "solid-js";
import { render } from "solid-js/web";

import { CapturedMaterial } from "../../solid/CapturedMaterial.tsx";
import { Clock } from "../../solid/Clock.tsx";
import { NavControls } from "../../solid/NavControls.tsx";
import { PlayerBar } from "../../solid/PlayerBar.tsx";
import { SolidChessBoard } from "../../solid/SolidChessBoard.tsx";
import type { Api, Config, MaterialDiff } from "../../src/index.ts";

const PIECE_SET = "cburnett";

const EMPTY_DIFF: MaterialDiff = {
  capturedBy: {
    white: { pawn: 0, knight: 0, bishop: 0, rook: 0, queen: 0 },
    black: { pawn: 0, knight: 0, bishop: 0, rook: 0, queen: 0 },
  },
  score: 0,
};

const NAV_LABELS = { first: "First move", prev: "Previous move", next: "Next move", last: "Latest move" };
const PLAYER_LABELS = { online: "Online", offline: "Offline", connection: "Connection quality" };

function GameFrame() {
  let api: Api | undefined;

  // The FEN stack is the demo's whole "game": recorded forward, replayed by nav.
  const [history, setHistory] = createSignal<string[]>([]);
  const [cursor, setCursor] = createSignal(0);
  const [diff, setDiff] = createSignal<MaterialDiff>(EMPTY_DIFF);

  const canPrev = () => cursor() > 0;
  const canNext = () => cursor() < history().length - 1;

  const record = (): void => {
    if (!api) return;
    const fen = api.getFen();
    // A move made while rewound truncates the future, like any move list.
    setHistory((stack) => [...stack.slice(0, cursor() + 1), fen]);
    setCursor((index) => index + 1);
    setDiff(api.getMaterialDiff());
  };

  const goTo = (index: number): void => {
    const stack = history();
    if (!api || stack.length === 0) return;
    const target = Math.min(Math.max(index, 0), stack.length - 1);
    if (target === cursor()) return;
    // configure() does not emit events.change, so replaying a FEN cannot
    // re-enter record() and corrupt the stack.
    api.set({ fen: stack[target], lastMove: undefined });
    setCursor(target);
    setDiff(api.getMaterialDiff());
  };

  // Built once: SolidChessBoard re-applies config on identity change, and an
  // inline object literal in JSX would mint a new one on every read.
  const boardConfig: Config = {
    movable: { free: true, color: "both" },
    events: { change: record },
  };

  const onReady = (ready: Api): void => {
    api = ready;
    setHistory([ready.getFen()]);
    setCursor(0);
    setDiff(ready.getMaterialDiff());
  };

  return (
    <div class="game-frame">
      <PlayerBar
        name="Nightfall"
        rating={2214}
        title="GM"
        online
        connection={3}
        labels={PLAYER_LABELS}
        icons={<CapturedMaterial diff={diff()} side="black" pieceSet={PIECE_SET} />}
        clock={<Clock ms={272_000} />}
      />

      <SolidChessBoard
        class="game-frame-board"
        pieceSet={PIECE_SET}
        config={boardConfig}
        onReady={onReady}
      />

      <PlayerBar
        name="Ada"
        rating={2190}
        active
        online
        connection={4}
        labels={PLAYER_LABELS}
        icons={<CapturedMaterial diff={diff()} side="white" pieceSet={PIECE_SET} />}
        clock={<Clock ms={8_500} running />}
      />

      <NavControls
        labels={NAV_LABELS}
        canPrev={canPrev()}
        canNext={canNext()}
        onFirst={() => goTo(0)}
        onPrev={() => goTo(cursor() - 1)}
        onNext={() => goTo(cursor() + 1)}
        onLast={() => goTo(history().length - 1)}
      />

      <p class="hint">
        Move pieces freely, then step back and forward. Arrow keys, Home and End
        drive the same navigation while this page has focus.
      </p>
    </div>
  );
}

/** Returns the Solid disposer so the demo can tear the section down. */
export function mountGameFrame(host: HTMLElement): () => void {
  return render(() => <GameFrame />, host);
}
