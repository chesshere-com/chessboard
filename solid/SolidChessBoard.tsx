/*
 * Thin SolidJS wrapper around the DOM-direct core.
 *
 * Deliberately NOT reactive per square: the core owns everything inside the
 * host div (element pooling, rAF drag/draw loops, converging animations).
 * Wrapping squares or pieces in Solid primitives would fight that ownership and
 * cost a diff per frame for nothing.
 */

import { createEffect, on, onCleanup, onMount } from "solid-js";
import { ChessBoard } from "../src/index.ts";
import type { Api, Config } from "../src/index.ts";

export interface SolidChessBoardProps {
  /**
   * Applied through `api.set` whenever this object's IDENTITY changes.
   * Consumers should hold stable sub-objects (a memo per config slice, or a
   * store) and hand a fresh top-level object only when something really
   * changed — `set` replaces `dests`/`autoShapes` wholesale rather than merging.
   */
  config?: Config;
  class?: string;
  /** Piece-set key from piece-sets.css; undefined inherits the ancestor theme. */
  pieceSet?: string;
  onReady?: (api: Api) => void;
}

export function SolidChessBoard(props: SolidChessBoardProps) {
  let host!: HTMLDivElement;
  let api: Api | undefined;

  onMount(() => {
    api = ChessBoard(host, props.config);
    props.onReady?.(api);
  });

  onCleanup(() => {
    api?.destroy();
    api = undefined;
  });

  // `defer` skips the initial run: ChessBoard() already consumed that config.
  createEffect(
    on(
      () => props.config,
      (config) => {
        if (config) api?.set(config);
      },
      { defer: true },
    ),
  );

  let consumerClasses = new Set<string>();
  createEffect(() => {
    const coreClasses = /^(cb-wrap|cb-outside-coords|cb-ranks-left|cb-ranks-right|orientation-white|orientation-black|manipulable)$/;
    const next = new Set((props.class ?? "").split(/\s+/).filter((name) => name && !coreClasses.test(name)));
    for (const name of consumerClasses) {
      if (!next.has(name)) host.classList.remove(name);
    }
    for (const name of next) host.classList.add(name);
    consumerClasses = next;
  });

  // The data attribute below is a reactive JSX binding, which Solid compiles
  // into exactly the fine-grained effect this would otherwise be written as;
  // an undefined pieceSet removes the attribute so ancestor theming applies.
  return <div ref={host} data-cb-pieces={props.pieceSet} />;
}
