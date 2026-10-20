/*
 * Corner resize grip. Dragging writes an inline width on the wrap host; the
 * instance's ResizeObserver is the single sizing authority, so no board
 * geometry is recomputed here.
 */

import type { State } from "./dom-state.ts";

const MIN_WIDTH = 160;

const activeResizes = new Set<HTMLElement>();

export function attachResize(state: State, grip: HTMLElement): () => void {
  let finish: (() => void) | undefined;
  const onDown = (e: PointerEvent): void => {
    if (e.button !== 0 || finish || state.dom.destroyed) return;
    e.preventDefault();
    // Keep the press from reaching the board's own pointer handlers.
    e.stopPropagation();

    const wrap = state.dom.elements.wrap;
    const startWidth = wrap.getBoundingClientRect().width;
    const startX = e.clientX;
    const startY = e.clientY;
    activeResizes.add(grip);
    document.body.classList.add("cb-resizing");

    // Capture routes every later event for this pointer to the grip, so a
    // release outside the window still reaches onUp instead of leaving the
    // drag latched with body.cb-resizing stuck on.
    grip.setPointerCapture?.(e.pointerId);

    const onMove = (ev: PointerEvent): void => {
      if (ev.pointerId !== e.pointerId) return;
      // Averaging both axes makes the grip feel diagonal regardless of which
      // axis the pointer favours.
      const delta = (ev.clientX - startX + (ev.clientY - startY)) / 2;
      wrap.style.width = `${Math.max(MIN_WIDTH, startWidth + delta)}px`;
    };
    const onUp = (ev?: PointerEvent): void => {
      if (ev && ev.pointerId !== e.pointerId) return;
      finish = undefined;
      grip.removeEventListener("pointermove", onMove);
      grip.removeEventListener("pointerup", onUp);
      grip.removeEventListener("pointercancel", onUp);
      grip.removeEventListener("lostpointercapture", onUp);
      window.removeEventListener("blur", onBlur);
      if (grip.hasPointerCapture?.(e.pointerId)) grip.releasePointerCapture(e.pointerId);
      activeResizes.delete(grip);
      if (activeResizes.size === 0) document.body.classList.remove("cb-resizing");
    };
    const onBlur = (): void => onUp();
    finish = onBlur;
    grip.addEventListener("pointermove", onMove);
    grip.addEventListener("pointerup", onUp);
    grip.addEventListener("pointercancel", onUp);
    // Capture is released by a tab switch or a drag into browser chrome, and
    // no pointerup follows.
    grip.addEventListener("lostpointercapture", onUp);
    window.addEventListener("blur", onBlur);
  };
  grip.addEventListener("pointerdown", onDown);
  return () => {
    finish?.();
    grip.removeEventListener("pointerdown", onDown);
  };
}
