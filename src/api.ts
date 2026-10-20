/*
 * Public API and instance assembly.
 *
 * Every position-changing entry point goes through `animate`, so a caller
 * setting a whole new FEN gets the same converging animation as a single
 * move — and racing updates never rebuild the DOM.
 *
 * None of them ends a drag. The opponent's move landing while the user holds
 * a piece is the normal case, not an interruption: the gesture continues and
 * the drop is judged against whatever position exists then. Only the paths
 * that make the gesture meaningless (stop, orientation flip, viewOnly,
 * destroy) cancel it. A click-selection follows the same rule: configure()
 * keeps it while its piece stays on the square and can still act.
 */

import type { Api, Config, Key, MaterialDiff, PiecesDiff, PxPos, Shape } from "./types.ts";
import type { State } from "./dom-state.ts";
import { callUserFunction } from "./dom-state.ts";
import { configure, defaults, invalidateDests } from "./state.ts";
import {
  baseMove,
  finishPromotion,
  playPremove as boardPlayPremove,
  stop as boardStop,
  unselect,
  unsetPremove,
  whitePov,
} from "./board.ts";
import { getKeyAtDomPos as keyAtPos, opposite } from "./geometry.ts";
import { materialDiff } from "./material.ts";
import { writeFen } from "./fen.ts";
import { animate, cancelAnimation } from "./anim.ts";
import { memoizedBounds, render, renderResized, updateBounds } from "./render.ts";
import { clearSvgCache, renderSvg } from "./svg.ts";
import { renderPromotion } from "./promotion.ts";
import { renderWrap } from "./wrap.ts";
import { bindEvents } from "./events.ts";
import * as drag from "./drag.ts";
import * as draw from "./draw.ts";
import { attachResize } from "./resize.ts";

export function ChessBoard(element: HTMLElement, config?: Config): Api {
  const state = defaults() as State;
  state.drawable.prevSvgHash = "";
  configure(state, config ?? {});

  const elements = renderWrap(element, state);

  let redrawFrame: number | undefined;
  const redrawNow = (skipSvg?: boolean): void => {
    if (state.dom.destroyed) return;
    render(state);
    if (!skipSvg) {
      renderSvg(state);
      renderPromotion(state);
    }
  };
  const redraw = (): void => {
    if (redrawFrame !== undefined || state.dom.destroyed) return;
    redrawFrame = requestAnimationFrame(() => {
      redrawFrame = undefined;
      redrawNow();
    });
  };

  state.dom = {
    elements,
    bounds: memoizedBounds(elements.board),
    redraw,
    redrawNow,
    unbind: () => undefined,
    destroyed: false,
  };
  state.dom.unbind = bindEvents(state);
  let unbindResize = elements.resize ? attachResize(state, elements.resize) : undefined;

  // A ResizeObserver on the wrap is the only sizing authority: the board is
  // container-driven, so nothing needs to tell it about layout changes.
  const observer =
    typeof ResizeObserver === "undefined"
      ? undefined
      : new ResizeObserver(() => {
          if (state.dom.destroyed) return;
          updateBounds(state);
          renderResized(state);
          renderSvg(state);
          renderPromotion(state);
        });
  observer?.observe(elements.wrap);

  const redrawAll = (): void => {
    if (state.dom.destroyed) return;
    state.dom.unbind();
    unbindResize?.();
    const rebuilt = renderWrap(element, state);
    state.dom.elements = rebuilt;
    state.dom.bounds = memoizedBounds(rebuilt.board);
    state.dom.unbind = bindEvents(state);
    unbindResize = rebuilt.resize ? attachResize(state, rebuilt.resize) : undefined;
    clearSvgCache(state);
    updateBounds(state);
    redrawNow();
    callUserFunction(state.events.insert, rebuilt);
  };

  // Applies a position mutation with animation, then lets an in-flight drag
  // decide whether it still has a piece to drop (see drag.reconcile).
  const reposition = (mutation: (s: State) => void): void => {
    animate((s) => {
      mutation(s);
      drag.reconcile(s);
    }, state);
  };

  updateBounds(state);
  redrawNow();
  callUserFunction(state.events.insert, elements);

  return {
    state,

    set(next: Config): void {
      // Compared before `configure` merges them: every one of these decides
      // what `renderWrap` builds (ghost node, resize grip, wrap classes and the
      // touch-action policy they select), none of which render() can patch.
      const rebuildNeeded =
        (next.coordinates !== undefined && Object.entries(next.coordinates).some(
          ([key, value]) => state.coordinates[key as keyof typeof state.coordinates] !== value,
        )) ||
        (next.orientation !== undefined && next.orientation !== state.orientation) ||
        (next.resizable !== undefined && next.resizable !== state.resizable) ||
        (next.viewOnly !== undefined && next.viewOnly !== state.viewOnly) ||
        (next.draggable?.showGhost !== undefined &&
          next.draggable.showGhost !== state.draggable.showGhost);
      if (next.fen !== undefined) {
        draw.cancel(state);
        reposition((s) => configure(s, next));
      }
      else {
        configure(state, next);
        redraw();
      }
      // Coordinates, wrap classes and the resize grip are built once, so
      // changing them rebuilds the wrap.
      if (rebuildNeeded) redrawAll();
      else if (next.snapPixels !== undefined) {
        updateBounds(state);
        redrawNow();
      }
    },

    setPosition(position): void {
      draw.cancel(state);
      unsetPremove(state);
      reposition((s) => configure(s, {
        fen: position.fen,
        turnColor: position.turnColor,
        check: position.check,
        lastMove: position.lastMove,
        movable: { dests: position.dests, getDests: undefined },
      }));
    },

    resolvePromotion(role, requestId): boolean {
      let resolved = false;
      reposition((s) => { resolved = finishPromotion(s, role, requestId); });
      return resolved;
    },

    cancelPromotion(): void {
      state.promotion.current = undefined;
      unselect(state);
      redraw();
    },

    getFen(): string {
      return writeFen(state.pieces);
    },

    toggleOrientation(): void {
      cancelAnimation(state);
      drag.cancel(state);
      draw.cancel(state);
      unselect(state);
      state.orientation = opposite(state.orientation);
      redrawAll();
    },

    move(orig: Key, dest: Key): void {
      reposition((s) => {
        baseMove(s, orig, dest);
      });
    },

    setPieces(pieces: PiecesDiff): void {
      reposition((s) => {
        s.positionVersion++;
        s.promotion.current = undefined;
        s.movable.dests = undefined;
        invalidateDests(s);
        for (const [key, piece] of pieces) {
          if (piece) s.pieces.set(key, piece);
          else s.pieces.delete(key);
        }
        callUserFunction(s.events.change);
      });
    },

    selectSquare(key: Key | null, force?: boolean): void {
      if (key) drag.selectSquare(state, key, force);
      else unselect(state);
      redraw();
    },

    playPremove(): boolean {
      let played = false;
      reposition((s) => {
        played = boardPlayPremove(s);
      });
      return played;
    },

    cancelPremove(): void {
      unsetPremove(state);
      redraw();
    },

    cancelMove(): void {
      state.promotion.current = undefined;
      unsetPremove(state);
      drag.cancel(state);
      unselect(state);
      redraw();
    },

    stop(): void {
      // board.stop() cannot reach a live DOM drag; cancel it first.
      drag.cancel(state);
      draw.cancel(state);
      boardStop(state);
      redraw();
    },

    setShapes(shapes: Shape[]): void {
      state.drawable.shapes = shapes;
      redraw();
    },

    setAutoShapes(shapes: Shape[]): void {
      state.drawable.autoShapes = shapes;
      redraw();
    },

    getKeyAtDomPos(pos: PxPos): Key | undefined {
      return keyAtPos(pos, whitePov(state), state.dom.bounds());
    },

    getMaterialDiff(): MaterialDiff {
      return materialDiff(state.pieces);
    },

    redrawAll,

    destroy(): void {
      if (state.dom.destroyed) return;
      state.dom.destroyed = true;
      if (redrawFrame !== undefined) cancelAnimationFrame(redrawFrame);
      cancelAnimation(state);
      draw.cancel(state);
      unbindResize?.();
      drag.cancel(state);
      state.dom.unbind();
      observer?.disconnect();
      element.innerHTML = "";
      element.classList.remove(
        "cb-wrap",
        "orientation-white",
        "orientation-black",
        "manipulable",
        "cb-outside-coords",
        "cb-ranks-left",
        "cb-ranks-right",
      );
      element.removeAttribute("dir");
      // The resize grip writes an inline width on the host; leaving it behind
      // would pin whatever the caller puts here next to the board's last size.
      element.style.removeProperty("width");
      delete element.dataset.cbInstance;
    },
  };
}
