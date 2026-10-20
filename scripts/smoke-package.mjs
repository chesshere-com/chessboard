import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const temporary = await mkdtemp(path.join(tmpdir(), 'chess-board-package-'));
try {
  const [packed] = JSON.parse(execFileSync('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', temporary], { cwd: root, encoding: 'utf8' }));
  await writeFile(path.join(temporary, 'package.json'), '{"private":true,"type":"module"}');
  execFileSync('npm', ['install', path.join(temporary, packed.filename), '--ignore-scripts', '--legacy-peer-deps', '--no-audit', '--no-fund', '--offline'], { cwd: temporary, stdio: 'pipe' });
  const smoke = `import assert from 'node:assert/strict';
import { ChessBoard, readFen } from '@chesshere/chessboard';
import { pieceAssetVariables } from '@chesshere/chessboard/assets';
assert.equal(typeof ChessBoard, 'function');
assert.equal(readFen('start').size, 32);
assert.equal(Object.keys(pieceAssetVariables('/pieces')).length, 12);
for (const file of ['board.css', 'chrome.css', 'piece-sets.css']) assert.ok(import.meta.resolve('@chesshere/chessboard/' + file));
`;
  await writeFile(path.join(temporary, 'smoke.mjs'), smoke);
  execFileSync(process.execPath, ['smoke.mjs'], { cwd: temporary, stdio: 'inherit' });
  const installed = JSON.parse(await readFile(path.join(temporary, 'node_modules/@chesshere/chessboard/package.json'), 'utf8'));
  assert.equal(installed.dependencies, undefined, 'core must not acquire runtime dependencies');
  await symlink(path.dirname(fileURLToPath(import.meta.resolve('solid-js/package.json'))), path.join(temporary, 'node_modules/solid-js'), 'dir');
  await writeFile(path.join(temporary, 'consumer.mts'), `import { ChessBoard, type Api } from '@chesshere/chessboard';
import { SolidChessBoard, type SolidChessBoardProps } from '@chesshere/chessboard/solid';
import { pieceAssetVariables } from '@chesshere/chessboard/assets';
const api: Api = ChessBoard(document.createElement('div'));
const props: SolidChessBoardProps = { config: { fen: 'start' } };
void api; void props; void SolidChessBoard; void pieceAssetVariables;
`);
  execFileSync(process.execPath, [fileURLToPath(import.meta.resolve('typescript/bin/tsc')), '--noEmit', '--strict', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', 'consumer.mts'], { cwd: temporary, stdio: 'inherit' });
  console.log('Package tarball imports, CSS exports, and consumer declarations passed');
} finally {
  await rm(temporary, { recursive: true, force: true });
}
