import { build } from 'vite';
import solid from 'vite-plugin-solid';
import { cp, mkdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
await rm(path.join(root, 'dist'), { recursive: true, force: true });
await build({
  configFile: false,
  root,
  publicDir: false,
  plugins: [solid()],
  build: {
    emptyOutDir: false,
    lib: {
      entry: { core: path.join(root, 'src/index.ts'), solid: path.join(root, 'solid/index.ts'), assets: path.join(root, 'adapters/piece-assets.ts') },
      formats: ['es'],
      fileName: (_format, name) => `${name}.js`,
    },
    rollupOptions: { external: id => id === 'solid-js' || id.startsWith('solid-js/') },
    sourcemap: true,
  },
});
execFileSync(process.execPath, [fileURLToPath(import.meta.resolve('typescript/bin/tsc')), '-p', path.join(root, 'tsconfig.build.json')], { stdio: 'inherit' });
await mkdir(path.join(root, 'dist/assets'), { recursive: true });
for (const file of ['chess-board.css', 'chrome.css', 'piece-sets.css']) {
  await cp(path.join(root, 'assets', file), path.join(root, 'dist/assets', file));
}
await cp(path.join(root, 'pieces'), path.join(root, 'dist/pieces'), { recursive: true });
