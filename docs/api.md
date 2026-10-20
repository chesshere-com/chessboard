# API

`ChessBoard()` returns an `Api`. All user callbacks are deferred to a microtask, so calling any method from inside an event handler is safe.

| Method | Description |
| --- | --- |
| `set(config)` | Patch configuration. Position changes are diffed and animated. |
| `setPosition({ fen, turnColor, check?, lastMove?, dests? })` | Authoritative replacement in one call: clears the premove, an in-progress drawing and stale legality. A selection or drag whose piece is still on its square survives, so an opponent's move never cancels the user's input. |
| `getFen()` | Piece placement of the current position. |
| `move(orig, dest)` | Play a move programmatically (animated). |
| `setPieces(diff)` | `Map<Key, Piece \| undefined>`; `undefined` removes a piece. |
| `selectSquare(key \| null, force?)` | Select a square as if clicked. |
| `playPremove()` / `cancelPremove()` | Execute or drop the stored premove. `playPremove` returns whether it moved. |
| `cancelMove()` | Cancel an in-progress drag or selection. |
| `resolvePromotion(role, requestId?)` / `cancelPromotion()` | Answer a custom promotion dialog. |
| `setShapes(shapes)` / `setAutoShapes(shapes)` | See [Shapes](shapes.md). |
| `toggleOrientation()` | Flip the board. |
| `getKeyAtDomPos([x, y])` | Square under a board-relative pixel position. |
| `getMaterialDiff()` | Captured pieces per side and point score, derived from the position. |
| `stop()` | Stop accepting input and clear selection/premove. |
| `redrawAll()` | Rebuild the DOM (rarely needed). |
| `destroy()` | Tear everything down. |

## Helpers

Also exported from the package root: `INITIAL_FEN`, `readFen`, `writeFen`, `allKeys`, `key2pos`, `pos2key`, `opposite`, `materialDiff`, `premove`, `expandRegion`.

## Racing updates

`set({ fen })` always diffs against what is currently displayed using nearest-piece matching. If two server updates arrive while an animation is running, the board converges on the latest one with no desync or flicker.

## Position updates and input

A piece being dragged or selected is kept when the position changes underneath it, as long as the same piece still sits on the square and can still move or premove. This is what makes it possible to hold a piece during the opponent's turn.
