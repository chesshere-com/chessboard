# Contributing

Issues and pull requests are welcome.

```bash
npm install
npm run demo        # site, docs and playground on http://localhost:5199
npm run typecheck
npm test            # Node test runner, no browser required
npm run build       # dist/ (ES modules, .d.ts, CSS, piece sets)
npm run test:package  # packs the tarball and imports it from a clean project
```

Ground rules:

- The core (`src/`) has zero runtime dependencies and never imports a chess rules library. Legality is supplied by the caller.
- Keep logic that can be tested without a DOM in plain `.ts` files using erasable syntax only (no enums, namespaces or parameter properties) so it runs under `node --experimental-strip-types`.
- Every visual is a `--cb-*` CSS custom property with a fallback.
- The package carries no user-facing strings; labels come in through props.
- Original code only. Do not copy from GPL-licensed boards such as chessground.
- New piece sets need a permissive license and an entry in `pieces/THIRD_PARTY_NOTICES.txt`.
