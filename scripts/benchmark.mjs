import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(process.argv[2] ?? 'http://localhost:5199');
  const results = await page.evaluate(async root => {
    const { ChessBoard, allKeys } = await import(`/@fs${root}/src/index.ts`);
    const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
    const results = [];
    for (const count of [1, 16, 64]) {
      for (const shapeCount of [0, 64]) {
        const container = document.createElement('div');
        container.style.cssText = 'display:grid;grid-template-columns:repeat(8,160px);gap:8px';
        document.body.replaceChildren(container);
        const shapes = allKeys.slice(0, shapeCount).map((square, index) => ({ type: 'arrow', from: square, to: allKeys[(index + 19) % 64] }));
        const start = performance.now();
        const boards = Array.from({ length: count }, () => {
          const host = document.createElement('div');
          container.append(host);
          return ChessBoard(host, { fen: 'start', animation: { enabled: false }, drawable: { autoShapes: shapes } });
        });
        await frame();
        await frame();
        const mounted = performance.now();
        const samples = [];
        for (let i = 0; i < 10; i++) {
          const before = performance.now();
          for (const board of boards) board.set({ orientation: i % 2 ? 'white' : 'black', drawable: { autoShapes: shapes } });
          await frame();
          await frame();
          samples.push(performance.now() - before);
        }
        samples.sort((a, b) => a - b);
        const nodes = container.querySelectorAll('*').length;
        const destroyStart = performance.now();
        for (const board of boards) board.destroy();
        results.push({ boards: count, annotationsPerBoard: shapeCount, mountAndPaintMs: +(mounted - start).toFixed(2), updateAndPaintMedianMs: +samples[5].toFixed(2), destroyMs: +(performance.now() - destroyStart).toFixed(2), nodes });
      }
    }
    return results;
  }, root);
  console.log(JSON.stringify({ browser: await browser.version(), note: 'Wall-clock samples include two animation frames; local baseline, not a speedup comparison.', results }, null, 2));
} finally {
  await browser.close();
}
