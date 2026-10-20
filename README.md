# chessboard

**[Live demos and docs](https://chesshere-com.github.io/chessboard/)** | [Playground](https://chesshere-com.github.io/chessboard/playground/)

A fast, dependency-free chessboard for the web, extracted from [ChessHere](https://chesshere.com). Framework-agnostic TypeScript core, optional SolidJS bindings and game chrome (player bars, clocks, captured material, navigation controls), and twelve bundled piece sets.

- Drag and drop, click-to-move, touch with scroll arbitration, and pointer-based promotion dialog
- Animated, diff-based position updates that converge when moves race each other
- Premoves with pseudo-legal geometry, including Chess960 king-onto-rook castling
- Arrows, circles, region highlights, glyphs, labels, ghost pieces and square effects, with a serializable shape format
- Standard, Chess960 and three-check variants
- Everything themeable through `--cb-*` CSS custom properties
- No runtime dependencies. About 15 kB gzipped for the core

The board knows no chess rules. You supply the legal destinations (from chess.js, a server, an engine) and it renders, animates and collects input.

## Install

```bash
npm install @chesshere/chessboard
```

Until the package is on npm, install from GitHub: `npm install github:chesshere-com/chessboard`.

## Quick start

```ts
import { ChessBoard } from "@chesshere/chessboard";
import "@chesshere/chessboard/board.css";
import "@chesshere/chessboard/piece-sets.css";

const board = ChessBoard(document.getElementById("board")!, {
  fen: "start",
  orientation: "white",
  movable: {
    color: "white",
    dests: new Map([["e2", ["e3", "e4"]]]),
    events: { after: (from, to, meta) => console.log(from + to, meta) },
  },
});

board.set({ fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1" });
```

The host element needs a size (the board fills it and stays square). Pick a piece set with `data-cb-pieces="cburnett"` on the host or any ancestor, and point the stylesheet at the SVGs (see [Piece sets](docs/piece-sets.md)).

### With chess.js

```ts
import { Chess } from "chess.js";

const game = new Chess();
const PROMO = { queen: "q", rook: "r", bishop: "b", knight: "n" } as const;
const destsOf = (): Map<string, string[]> => {
  const dests = new Map<string, string[]>();
  for (const m of game.moves({ verbose: true })) {
    dests.set(m.from, [...(dests.get(m.from) ?? []), m.to]);
  }
  return dests;
};

const board = ChessBoard(el, {
  movable: {
    color: "white",
    dests: destsOf(),
    events: {
      after: (from, to, meta) => {
        game.move({ from, to, promotion: meta.promotion ? PROMO[meta.promotion] : undefined });
        board.set({
          fen: game.fen(),
          turnColor: game.turn() === "w" ? "white" : "black",
          check: game.inCheck(),
          movable: { color: game.turn() === "w" ? "white" : "black", dests: destsOf() },
        });
      },
    },
  },
});
```

## Documentation

- [Getting started](docs/getting-started.md): installation, styles, sizing, first board
- [Configuration](docs/configuration.md): every config group
- [API](docs/api.md): methods on the returned board
- [Shapes and drawing](docs/shapes.md): arrows, circles, regions, glyphs, effects
- [Theming](docs/theming.md): CSS custom properties
- [Piece sets](docs/piece-sets.md): bundled sets, custom sets, licenses
- [SolidJS bindings and chrome](docs/solid.md)

The [playground](https://chesshere-com.github.io/chessboard/playground/) exercises every feature; run it locally with `npm run demo`.

## Browser support

Current evergreen browsers (Chrome, Edge, Firefox, Safari), desktop and mobile.

## License

MIT, see [LICENSE](LICENSE). The bundled piece sets carry their own licenses (MIT, BSD-3-Clause, Apache-2.0, CC0, CC BY 4.0, public domain); see [pieces/THIRD_PARTY_NOTICES.txt](pieces/THIRD_PARTY_NOTICES.txt). CC BY 4.0 sets (Firi, Kiwen Suwi, Font Awesome) require attribution if you use them.
