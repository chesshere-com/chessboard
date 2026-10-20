# SolidJS bindings and chrome

```ts
import { SolidChessBoard, PlayerBar, Clock, CapturedMaterial, NavControls } from "@chesshere/chessboard/solid";
import "@chesshere/chessboard/board.css";
import "@chesshere/chessboard/piece-sets.css";
import "@chesshere/chessboard/chrome.css";
```

`solid-js` 1.9+ is an optional peer dependency; the core never needs it.

## `SolidChessBoard`

```tsx
<SolidChessBoard
  class="my-board"
  pieceSet="cburnett"
  config={config()}
  onReady={(api) => (board = api)}
/>
```

The wrapper creates the board on mount, destroys it on cleanup, and calls `api.set(config)` whenever the **identity** of `config` changes. It is deliberately not reactive per square: the core owns the DOM inside the host. Hand it a fresh top-level object only when something changed.

## Chrome components

All user-facing strings arrive as props (`labels`), so translation happens in your app.

- `NavControls`: first / previous / next / last buttons with optional keyboard navigation. Props: `onFirst`, `onPrev`, `onNext`, `onLast`, `canPrev`, `canNext`, `labels`, `keyboard?`, `keyboardTarget?`.
- `PlayerBar`: avatar, name, rating, title badge, presence dot, connection meter, an `icons` slot and a `clock` slot. Props: `name`, `rating?`, `avatarUrl?`, `online?`, `connection?`, `active?`, `title?`, `icons?`, `clock?`, `labels`.
- `CapturedMaterial`: stacked captured pieces with a `+N` score on the leading side only. Props: `diff` (from `api.getMaterialDiff()`), `side`, `showScore?`, `pieceSet?`.
- `Clock`: display-only; you own the time state. Props: `ms`, `running?`, `lowTimeMs?` (default 10000), `labels?`.

Helpers `formatClock`, `capturedRow` and `leadingScore` are exported for custom layouts. The demo's [`game-frame.tsx`](../site/playground/game-frame.tsx) shows all of them wired together.
