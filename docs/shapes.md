# Shapes and drawing

Shapes are plain, JSON-serializable records. Two channels exist:

- `drawable.shapes` / `setShapes()`: the user's own scribbles. Right-drag (or press-and-drag with the drawing gesture) draws arrows and circles; clicking erases when `eraseOnClick` is on. `drawable.onChange` reports changes.
- `drawable.autoShapes` / `setAutoShapes()`: app-authored shapes (engine lines, lesson targets). User erasure never touches this channel.

```ts
board.setAutoShapes([
  { type: "arrow", from: "e2", to: "e4", brush: "green" },
  { type: "circle", square: "d5", brush: "red" },
  { type: "region", region: { kind: "file", file: "d" }, brush: "paleBlue" },
  { type: "glyph", square: "f7", glyph: { kind: "target" } },
  { type: "label", square: "a1", text: "1" },
  { type: "piece", square: "e5", piece: { color: "white", role: "knight" } },
  { type: "effect", square: "g8", effect: "pulse" },
]);
```

## Shape types

| `type` | Fields |
| --- | --- |
| `arrow` | `from`, `to`, `brush?`, `hilite?`, `outline?`, `lineWidth?`, `label?` |
| `circle` | `square`, `brush?` |
| `region` | `region`, `brush?`. A region is `{kind:"rank"}`, `{kind:"file"}`, `{kind:"diagonal", from, to}` or `{kind:"squares", squares}` |
| `glyph` | `square`, `glyph`, `brush?`, `scale?`. Built-ins: `star`, `target`, `cross`, `check`, `question`; `{kind:"custom", svg}` embeds your own markup (trusted input only) |
| `label` | `square`, `text`, `fill?` |
| `piece` | `square`, `piece`, `scale?`: a ghost piece overlay |
| `effect` | `square`, `effect` (`pulse`, `glow`, `shake`, `correct`, `wrong`), `sticky?`. Effects expire after their CSS animation unless sticky |

## Brushes

Default brush keys: `green`, `red`, `blue`, `yellow`, `paleGreen`, `paleRed`, `paleBlue`. Add or override through `drawable.brushes`:

```ts
board.set({ drawable: { brushes: { purple: { key: "purple", color: "#7c3aed", opacity: 0.9, lineWidth: 10 } } } });
```

`brushSelectors` maps the modifier combination used while drawing (none, modifier A, modifier B, both) to brush keys.
