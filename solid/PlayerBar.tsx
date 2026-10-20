/*
 * One player row: avatar, identity, slots for app-supplied icons and a clock.
 *
 * Laid out with logical properties throughout so an RTL host mirrors the row
 * for free (unlike the board interior, which is pinned LTR).
 */

import { Index, Show } from "solid-js";
import type { JSX } from "solid-js";

/** 0 = worst, 4 = best; undefined hides the meter entirely. */
export type ConnectionLevel = 0 | 1 | 2 | 3 | 4;

export interface PlayerBarLabels {
  online: string;
  offline: string;
  connection: string;
}

export interface PlayerBarProps {
  name: string;
  rating?: number | string;
  avatarUrl?: string;
  /** undefined hides the presence dot. */
  online?: boolean;
  connection?: ConnectionLevel;
  /** App-supplied badges (country flag, captured material, verified mark...). */
  icons?: JSX.Element;
  clock?: JSX.Element;
  /** Highlights the row when it is this player's turn. */
  active?: boolean;
  /** Small badge, e.g. a federation title. */
  title?: string;
  labels: PlayerBarLabels;
  class?: string;
}

const BARS = [1, 2, 3, 4];

function initial(name: string): string {
  // Array.from, not charAt: a name starting with an astral glyph must not be
  // sliced into half a surrogate pair.
  return (Array.from(name.trim())[0] ?? "").toLocaleUpperCase();
}

export function PlayerBar(props: PlayerBarProps) {
  return (
    <div
      class={`cb-playerbar${props.class ? ` ${props.class}` : ""}`}
      classList={{ "cb-playerbar-active": props.active === true }}
    >
      <span class="cb-playerbar-figure">
        <span class="cb-playerbar-avatar" aria-hidden="true">
          <Show
            when={props.avatarUrl}
            fallback={<span class="cb-playerbar-initial">{initial(props.name)}</span>}
          >
            {(url) => <img class="cb-playerbar-photo" src={url()} alt="" loading="lazy" />}
          </Show>
        </span>
        <Show when={props.online !== undefined}>
          <span
            class="cb-playerbar-dot"
            classList={{ "cb-playerbar-dot-on": props.online === true }}
            role="img"
            aria-label={props.online ? props.labels.online : props.labels.offline}
            title={props.online ? props.labels.online : props.labels.offline}
          />
        </Show>
      </span>

      <span class="cb-playerbar-id">
        <span class="cb-playerbar-name">{props.name}</span>
        <Show when={props.title}>
          <span class="cb-playerbar-title">{props.title}</span>
        </Show>
        <Show when={props.rating !== undefined}>
          <span class="cb-playerbar-rating">{props.rating}</span>
        </Show>
        <Show when={props.icons}>
          <span class="cb-playerbar-icons">{props.icons}</span>
        </Show>
      </span>

      <span class="cb-playerbar-spacer" />

      <Show when={props.connection !== undefined}>
        <span
          class="cb-playerbar-conn"
          data-cb-conn={props.connection}
          // A meter carries the level numerically, so no "3 of 4" string has to
          // be assembled (and translated) inside the package.
          role="meter"
          aria-label={props.labels.connection}
          aria-valuemin={0}
          aria-valuemax={4}
          aria-valuenow={props.connection}
          title={props.labels.connection}
        >
          <Index each={BARS}>
            {(step) => (
              <span
                class="cb-playerbar-conn-bar"
                classList={{ "cb-playerbar-conn-on": (props.connection ?? 0) >= step() }}
              />
            )}
          </Index>
        </span>
      </Show>

      <Show when={props.clock}>
        <span class="cb-playerbar-clock">{props.clock}</span>
      </Show>
    </div>
  );
}
