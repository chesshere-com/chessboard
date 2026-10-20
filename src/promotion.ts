/*
 * Built-in promotion dialog.
 *
 * The choices stack down the destination file from the promotion rank, so the
 * piece the user wants is closest to where they dropped. The stack always
 * grows toward the board centre, which keeps all four inside the board without
 * needing to clamp; the clamp below is a guard for non-standard geometry.
 */

import type { Key, PromotionRole } from "./types.ts";
import type { State } from "./dom-state.ts";
import { finishPromotion, unselect, whitePov } from "./board.ts";
import { key2pos } from "./geometry.ts";

const CHOICES: PromotionRole[] = ["queen", "knight", "rook", "bishop"];

const focusOwners = new WeakMap<State, HTMLElement>();

function restoreFocus(state: State): void {
  const owner = focusOwners.get(state);
  focusOwners.delete(state);
  if (owner?.isConnected) owner.focus({ preventScroll: true });
}

function cancel(state: State): void {
  state.promotion.current = undefined;
  unselect(state);
  state.dom.redrawNow();
}

export function renderPromotion(state: State): void {
  const container = state.dom.elements.container;
  const existing = container.querySelector(".cb-promotion") as HTMLElement | null;
  const pending = state.promotion.current;

  if (!pending || !state.promotion.dialog) {
    existing?.remove();
    restoreFocus(state);
    return;
  }

  const bounds = state.dom.bounds();
  // Geometry is baked into inline pixel styles, so board size and orientation
  // are part of what identifies a reusable dialog.
  const signature = `${pending.orig}:${pending.dest}:${pending.color}:${Math.round(bounds.width)}:${state.orientation}:${JSON.stringify(state.promotion.labels)}`;
  if (existing && existing.dataset.cbPromotion === signature) return;
  existing?.remove();

  const size = bounds.width / 8;
  const asWhite = whitePov(state);
  const destPos = key2pos(pending.dest as Key);
  const column = asWhite ? destPos[0] : 7 - destPos[0];
  const topRow = asWhite ? 7 - destPos[1] : destPos[1];
  // Grow away from the edge the pawn just reached.
  const direction = topRow === 0 ? 1 : -1;

  const overlay = document.createElement("div");
  overlay.className = "cb-promotion";
  overlay.dataset.cbPromotion = signature;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  if (state.promotion.labels) overlay.setAttribute("aria-label", state.promotion.labels.dialog);
  if (!focusOwners.has(state) && document.activeElement instanceof HTMLElement) {
    focusOwners.set(state, document.activeElement);
  }
  overlay.addEventListener("mousedown", (event) => event.stopPropagation());
  overlay.addEventListener("touchstart", (event) => event.stopPropagation());

  const backdrop = document.createElement("button");
  backdrop.type = "button";
  backdrop.setAttribute("aria-label", state.promotion.labels?.cancel ?? "×");
  backdrop.className = "cb-promotion-cancel";
  backdrop.addEventListener("click", () => cancel(state));
  overlay.appendChild(backdrop);

  CHOICES.forEach((role, index) => {
    const row = Math.min(7, Math.max(0, topRow + direction * index));
    const choice = document.createElement("button");
    choice.type = "button";
    const symbols = { queen: "♕", knight: "♘", rook: "♖", bishop: "♗" };
    choice.setAttribute("aria-label", state.promotion.labels?.[role] ?? symbols[role]);
    const piece = document.createElement("piece");
    piece.className = `${pending.color} ${role}`;
    piece.setAttribute("aria-hidden", "true");
    choice.appendChild(piece);
    choice.className = `cb-promotion-choice ${pending.color} ${role}`;
    choice.style.width = `${size}px`;
    choice.style.height = `${size}px`;
    choice.style.transform = `translate(${column * size}px,${row * size}px)`;
    // Staggered slide-in; the stylesheet reads the index as a delay multiplier.
    choice.style.setProperty("--cb-promo-index", String(index));
    choice.addEventListener("click", () => {
      finishPromotion(state, role);
      state.dom.redrawNow();
    });
    overlay.appendChild(choice);
  });

  overlay.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      cancel(state);
    } else if (event.key === "Tab") {
      const buttons = Array.from(overlay.querySelectorAll("button"));
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = (index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
      event.preventDefault();
      event.stopPropagation();
      buttons[next].focus();
    }
  });
  container.appendChild(overlay);
  overlay.querySelector<HTMLButtonElement>(".cb-promotion-choice")?.focus({ preventScroll: true });
}
