/*
 * Move-list transport. Stateless: the caller owns the cursor and tells this
 * strip what is reachable. Every label arrives through props — the package
 * ships no user-facing English.
 */

import { onCleanup, onMount } from "solid-js";

export interface NavControlsLabels {
  first: string;
  prev: string;
  next: string;
  last: string;
}

export interface NavControlsProps {
  onFirst: () => void;
  onPrev: () => void;
  onNext: () => void;
  onLast: () => void;
  canPrev: boolean;
  canNext: boolean;
  labels: NavControlsLabels;
  /** Enable keyboard navigation while focus is inside the controls. Default true. */
  keyboard?: boolean;
  /** Optional enclosing board region whose focused descendants enable navigation. */
  keyboardTarget?: HTMLElement;
  class?: string;
}

const TEXT_ENTRY = /^(INPUT|TEXTAREA|SELECT)$/;

function isTextEntry(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== "string") return false;
  return el.isContentEditable === true || TEXT_ENTRY.test(el.tagName);
}

export function NavControls(props: NavControlsProps) {
  let host!: HTMLDivElement;
  onMount(() => {
    // One listener for the lifetime of the component, gated on props.keyboard
    // inside: toggling the prop must not thrash addEventListener.
    const onKeyDown = (e: KeyboardEvent): void => {
      if (props.keyboard === false) return;
      const target = e.target;
      if (!(target instanceof Node) || !(props.keyboardTarget ?? host).contains(target)) return;
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      if (isTextEntry(e.target)) return;

      const fire = (allowed: boolean, run: () => void): void => {
        if (!allowed) return;
        e.preventDefault();
        run();
      };

      switch (e.key) {
        case "ArrowLeft":
          fire(props.canPrev, props.onPrev);
          break;
        case "ArrowRight":
          fire(props.canNext, props.onNext);
          break;
        case "Home":
          fire(props.canPrev, props.onFirst);
          break;
        case "End":
          fire(props.canNext, props.onLast);
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    onCleanup(() => window.removeEventListener("keydown", onKeyDown));
  });

  return (
    <div ref={host} tabIndex={0} class={`cb-nav${props.class ? ` ${props.class}` : ""}`} role="group">
      <button
        type="button"
        class="cb-nav-btn"
        aria-label={props.labels.first}
        title={props.labels.first}
        disabled={!props.canPrev}
        onClick={() => props.onFirst()}
      >
        <svg class="cb-nav-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M18 5 11 12l7 7M8 5v14" />
        </svg>
      </button>
      <button
        type="button"
        class="cb-nav-btn"
        aria-label={props.labels.prev}
        title={props.labels.prev}
        disabled={!props.canPrev}
        onClick={() => props.onPrev()}
      >
        <svg class="cb-nav-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M15 5 8 12l7 7" />
        </svg>
      </button>
      <button
        type="button"
        class="cb-nav-btn"
        aria-label={props.labels.next}
        title={props.labels.next}
        disabled={!props.canNext}
        onClick={() => props.onNext()}
      >
        <svg class="cb-nav-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 5l7 7-7 7" />
        </svg>
      </button>
      <button
        type="button"
        class="cb-nav-btn"
        aria-label={props.labels.last}
        title={props.labels.last}
        disabled={!props.canNext}
        onClick={() => props.onLast()}
      >
        <svg class="cb-nav-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 5l7 7-7 7M16 5v14" />
        </svg>
      </button>
    </div>
  );
}
