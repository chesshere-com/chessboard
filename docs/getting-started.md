# Getting started

## Install

```bash
npm install @chesshere/chessboard
```

Entry points:

| Import | Contents |
| --- | --- |
| `@chesshere/chessboard` | `ChessBoard()` core, types, FEN and geometry helpers |
| `@chesshere/chessboard/solid` | SolidJS wrapper and chrome components (optional; needs `solid-js` 1.9+) |
| `@chesshere/chessboard/assets` | `setPieceAssets()` / `pieceAssetVariables()` for custom piece art |
| `@chesshere/chessboard/board.css` | Board stylesheet (required) |
| `@chesshere/chessboard/piece-sets.css` | Bundled piece sets, selected via `data-cb-pieces` |
| `@chesshere/chessboard/chrome.css` | Styles for the Solid chrome components |
| `@chesshere/chessboard/pieces/*` | The bundled SVG piece files |

## Create a board

```html
<div id="board" style="width: min(90vw, 560px)"></div>
```

```ts
import { ChessBoard } from "@chesshere/chessboard";
import "@chesshere/chessboard/board.css";
import "@chesshere/chessboard/piece-sets.css";

const board = ChessBoard(document.getElementById("board")!, { fen: "start" });
```

The board fills the width of its host and keeps itself square. It observes the host with a `ResizeObserver`, so responsive layouts work without extra code.

### Sizing notes

- With `snapPixels` (default on) the board snaps to a multiple of 8 device pixels so squares are crisp. It can therefore be a few pixels smaller than its host.
- Give the host a definite height or an `aspect-ratio: 1` box. Do not let the host's height depend on the board's rendered size, or the resize observer will loop.

## Make it playable

The board never decides what is legal. Hand it a `Map` of origin square to destination squares and listen for the user's move:

```ts
const board = ChessBoard(el, {
  turnColor: "white",
  movable: {
    color: "white",
    dests: new Map([["e2", ["e3", "e4"]], ["g1", ["f3", "h3"]]]),
    events: {
      after: (from, to, meta) => {
        // validate with your engine / server, then push the new position:
        board.set({ fen: nextFen, turnColor: "black", movable: { color: "white", dests: new Map() } });
      },
    },
  },
});
```

For large positions pass `movable.getDests(orig)` instead; it is consulted lazily when a piece is picked up. Call `board.set({})` after the position changes to invalidate cached lazy destinations.

When it is not the user's turn but `movable.color` is theirs, they can premove. The board computes pseudo-legal premove geometry itself and reports it through `premovable.events.set`.

## Promotion

By default a built-in dialog appears when a pawn reaches the last rank, and `movable.events.after` receives `meta.promotion` (`"queen" | "rook" | "bishop" | "knight"`). Set `promotion.autoQueen: true` to skip the dialog, or `promotion.dialog: false` with `promotion.onRequired` to render your own and answer with `board.resolvePromotion(role, requestId)`.

## Cleaning up

```ts
board.destroy(); // removes listeners, observers and DOM
```

## Run the demo

```bash
git clone https://github.com/chesshere-com/chessboard
cd chessboard && npm install && npm run demo
```
