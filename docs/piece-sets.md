# Piece sets

Twelve sets ship in `pieces/` (and in the npm tarball at `dist/pieces/`):

`cburnett` (default), `celtic`, `chessnut`, `fantasy`, `firi`, `flat-cc0`, `font-awesome`, `kiwen-suwi`, `livius`, `material-design`, `rhosgfx`, `spatial`.

Each set is a directory of 12 files named `wP.svg`, `wN.svg`, `wB.svg`, `wR.svg`, `wQ.svg`, `wK.svg` and the `b*` equivalents.

## Using a bundled set

Import `@chesshere/chessboard/piece-sets.css` and set the attribute on the host or an ancestor:

```html
<div id="board" data-cb-pieces="celtic"></div>
```

The CSS references the SVGs relatively (`../pieces/<set>/wP.svg`), which bundlers such as Vite, webpack and esbuild resolve and copy for you. If you serve the package files yourself, keep `dist/assets/` and `dist/pieces/` side by side.

Switching sets at runtime is one attribute change:

```ts
document.getElementById("board")!.dataset.cbPieces = "firi";
```

## Custom pieces

Point the twelve variables at your own files, from a base URL or a resolver:

```ts
import { setPieceAssets } from "@chesshere/chessboard/assets";

setPieceAssets(host, "https://example.com/my-set");                 // my-set/wP.svg ...
setPieceAssets(host, ({ color, role }) => `/img/${color}-${role}.png`);
```

Any CSS-compatible image format works (SVG, PNG, WebP).

## Licenses

All bundled sets are under licenses that permit commercial use. Attribution requirements and license texts are in [`pieces/THIRD_PARTY_NOTICES.txt`](../pieces/THIRD_PARTY_NOTICES.txt) and `pieces/LICENSES/`. Three sets are CC BY 4.0 (Firi, Kiwen Suwi, Font Awesome) and require visible attribution if you use them. Many other popular sets (for example several from Lichess) are NC or share-alike and are deliberately not included.
