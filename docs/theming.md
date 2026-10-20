# Theming

Every visual is a CSS custom property with a fallback, so you restyle the board by setting variables on the host or any ancestor. No build step and no framework needed.

```css
.my-board {
  --cb-light: #ebecd0;
  --cb-dark: #739552;
  --cb-last-move: rgba(255, 204, 0, 0.38);
}
```

## Board

| Variable | Default | Controls |
| --- | --- | --- |
| `--cb-light`, `--cb-dark` | `#f0d9b5`, `#b58863` | Square colors |
| `--cb-coord-light`, `--cb-coord-dark` | | Coordinate label color on light/dark squares |
| `--cb-coord-size` | `3.4cqw` | Coordinate font size |
| `--cb-last-move` | `rgba(155,199,0,.41)` | Last-move highlight |
| `--cb-selected` | `rgba(246,246,105,.5)` | Selected square |
| `--cb-check` | radial red | Checked king |
| `--cb-move-dest`, `--cb-move-dest-size` | `rgba(20,85,30,.5)`, `22%` | Destination dots |
| `--cb-oc` | | Capture corner marks |
| `--cb-premove-dest`, `--cb-current-premove` | `rgba(20,30,85,.5)` | Premove destinations and stored premove |
| `--cb-drag-over` | | Square under a dragged piece |
| `--cb-ghost-opacity` | `0.3` | Ghost piece left on the origin |
| `--cb-resize-grip` | | Resize grip |
| `--cb-effect-color` | | Square effects |

Dark mode is just another value set: put the variables under a `[data-theme="dark"]` or `prefers-color-scheme` rule.

## Pieces

`--cb-piece-{white,black}-{pawn,knight,bishop,rook,queen,king}` hold `url(...)` values. `piece-sets.css` defines them per set; see [Piece sets](piece-sets.md).

## Chrome components

`--cb-chrome-fg`, `--cb-chrome-muted`, `--cb-chrome-surface`, `--cb-chrome-surface-hover`, `--cb-chrome-surface-active`, `--cb-chrome-border`, `--cb-chrome-radius`, `--cb-chrome-gap`, `--cb-chrome-focus`, `--cb-chrome-disabled-opacity`, `--cb-chrome-dot-ring`, `--cb-captured-size`, `--cb-title-accent`, `--cb-online`, `--cb-offline`, `--cb-conn-good`, `--cb-conn-fair`, `--cb-conn-poor`, `--cb-clock-low`.

## Right-to-left

Chrome uses logical properties, so it mirrors under `dir="rtl"`. The board itself is always laid out from the player's perspective.
