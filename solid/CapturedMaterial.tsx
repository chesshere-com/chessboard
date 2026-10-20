/*
 * Captured pieces + material lead for ONE side. Render two of these, one per
 * player row; only the leading side shows a score, so both can be mounted
 * unconditionally.
 *
 * Piece art: chess-board.css scopes its `piece.white.pawn` rules to `.cb-wrap`,
 * and the default variable block lives on `.cb-wrap` too, so neither reaches a
 * chrome row outside the board. chrome.css therefore declares its own
 * `.cb-captured-piece.<color>.<role>` rules that read the same
 * `--cb-piece-*` variables with a built-in url() fallback — an ancestor
 * `[data-cb-pieces]` (or the pieceSet prop below) still wins.
 */

import { For, Index, Show } from "solid-js";
import type { Color, MaterialDiff } from "../src/types.ts";
import { opposite } from "../src/geometry.ts";
import { capturedRow, leadingScore } from "./material-row.ts";

export interface CapturedMaterialProps {
  diff: MaterialDiff;
  /** The capturing side; the icons drawn are the opposite color's pieces. */
  side: Color;
  pieceSet?: string;
  /** Default true. */
  showScore?: boolean;
  class?: string;
}

const slots = (count: number): null[] => new Array<null>(count).fill(null);

export function CapturedMaterial(props: CapturedMaterialProps) {
  const row = () => capturedRow(props.diff, props.side);
  const lead = () => leadingScore(props.diff, props.side);
  const takenColor = () => opposite(props.side);

  return (
    <span class={`cb-captured${props.class ? ` ${props.class}` : ""}`} data-cb-pieces={props.pieceSet}>
      {/* Icons are decoration with no accessible name to give them (no label
          props by design); the numeric lead below stays in the a11y tree. */}
      <For each={row()}>
        {(entry) => (
          <span class="cb-captured-group" aria-hidden="true">
            <Index each={slots(entry.count)}>
              {() => <span class={`cb-captured-piece ${takenColor()} ${entry.role}`} />}
            </Index>
          </span>
        )}
      </For>
      <Show when={props.showScore !== false && lead() !== undefined}>
        <span class="cb-captured-score">+{lead()}</span>
      </Show>
    </span>
  );
}
