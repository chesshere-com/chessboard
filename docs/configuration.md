# Configuration

`ChessBoard(element, config)` takes a `Config`; `board.set(config)` applies a patch later. Nested groups are merged key by key. Maps, arrays and functions are replaced wholesale (setting `dests` never merges with the old ones). Full types are in [`src/types.ts`](../src/types.ts).

## Top-level

| Option | Default | Notes |
| --- | --- | --- |
| `fen` | start position | Piece placement field of a FEN, or `"start"`. Updating it diffs and animates. |
| `orientation` | `"white"` | Which side is at the bottom. |
| `turnColor` | `"white"` | Whose move it is; drives movability and premoves. |
| `check` | none | `true` to mark the side to move's king, a color, or `false`. |
| `lastMove` | none | `[from, to]` squares to highlight. |
| `selected` | none | Selected square. Kept across updates only while that piece can still act. |
| `viewOnly` | `false` | Disables all input. |
| `resizable` | `false` | Shows a corner grip that resizes the board by writing the host width. |
| `snapPixels` | `true` | Snap width to whole device pixels per square. |
| `disableContextMenu` | `false` | Suppress the context menu on the board. |
| `trustAllEvents` | `false` | Accept synthetic (untrusted) events. Useful in tests. |
| `variant.key` | `"standard"` | `"standard"`, `"chess960"` or `"threeCheck"`. Switches geometry and castling UX only. |
| `events` | | `change`, `move(orig, dest, captured?)`, `select(key)`, `cancel()`, `insert(elements)`. |

## `movable`

| Option | Default | Notes |
| --- | --- | --- |
| `color` | none | `"white"`, `"black"`, `"both"` or unset. |
| `dests` | none | `Map<Key, Key[]>` of legal destinations. |
| `getDests` | none | Lazy lookup used when `dests` has no entry for a picked-up piece. |
| `free` | `false` | Move any piece anywhere (board editors). |
| `showDests` | `true` | Draw destination dots. |
| `rookCastle` | `true` | Accept king-onto-rook input; the only form for Chess960. |
| `events.after` | | `(orig, dest, meta)` after a user move is committed. `meta` has `premove`, `captured`, `promotion`, `byDrag`, `holdTime`. |

The board rewrites a king-onto-rook or two-square king move into a proper castled position for you.

## `premovable`

`enabled` (default `true`), `showDests`, `filter(orig, dest, pieces)` to veto pseudo-legal premoves, and `events.set` / `events.unset`. Play a stored premove with `board.playPremove()`.

## `draggable`

| Option | Default | Notes |
| --- | --- | --- |
| `mouse`, `touch` | `true` | Separate switches. |
| `distance` | `3` | Pixels before a drag begins. |
| `autoDistance` | `true` | Drop the threshold to 0 after the first successful drag. |
| `showGhost` | `true` | Dim copy of the piece left on its origin. |
| `liftScale` | `1.1` | Scale of the dragged piece. |
| `deleteOnDropOff` | `false` | Remove the piece when dropped outside the board. |
| `touchIgnoreRadius` | `1` | Touches farther than this (in square-halves) from a movable piece scroll the page. `0` never blocks scrolling. |

## `selectable`

`enabled` (default `true`) turns on click/tap-to-move.

## `animation`

`enabled` (default `true`) and `duration` in ms (default `200`; values below 40 disable animation).

## `highlight`

`lastMove` and `check` (both default `true`), and `custom`: a `Map<Key, string>` adding a `cb-hl-<value>` class to a square.

## `coordinates`

`show`, `placement` (`"inside"`, `"outside"`, `"hidden"`), `ranksPosition` (`"left"`/`"right"`), and optional `fileLabels` / `rankLabels` arrays for non-Latin labels.

## `drawable`

User drawing and the shape channels; see [Shapes and drawing](shapes.md).

## `promotion`

`dialog` (default `true`), `autoQueen` (default `false`), `onRequired(orig, dest, color, requestId)`, and `labels` to localize the built-in dialog. The package ships no user-facing strings of its own, so pass `labels` if you use the dialog in a non-English UI.
