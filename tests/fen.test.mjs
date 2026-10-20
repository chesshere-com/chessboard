import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_FEN, readFen, writeFen } from '../src/fen.ts';

test('the start position round-trips', () => {
  assert.equal(writeFen(readFen(INITIAL_FEN)), INITIAL_FEN);
  assert.equal(writeFen(readFen('start')), INITIAL_FEN);
});

test('the start position parses 32 pieces on the right squares', () => {
  const pieces = readFen('start');

  assert.equal(pieces.size, 32);
  assert.deepEqual(pieces.get('e1'), { color: 'white', role: 'king' });
  assert.deepEqual(pieces.get('d8'), { color: 'black', role: 'queen' });
  assert.deepEqual(pieces.get('a2'), { color: 'white', role: 'pawn' });
  assert.equal(pieces.get('e4'), undefined);
});

test('digit runs skip the right number of files', () => {
  const pieces = readFen('8/8/8/3q4/8/8/8/4K3');

  assert.equal(pieces.size, 2);
  assert.deepEqual(pieces.get('d5'), { color: 'black', role: 'queen' });
  assert.deepEqual(pieces.get('e1'), { color: 'white', role: 'king' });
});

test('a chess960 back rank is read verbatim', () => {
  const fen = 'bqnbnrkr/pppppppp/8/8/8/8/PPPPPPPP/BQNBNRKR';
  const pieces = readFen(fen);

  assert.deepEqual(pieces.get('g1'), { color: 'white', role: 'king' });
  assert.deepEqual(pieces.get('h1'), { color: 'white', role: 'rook' });
  assert.deepEqual(pieces.get('a8'), { color: 'black', role: 'bishop' });
  assert.equal(writeFen(pieces), fen);
});

test('a full FEN string is accepted and only its placement field used', () => {
  const pieces = readFen('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');

  assert.deepEqual(pieces.get('e4'), { color: 'white', role: 'pawn' });
  assert.equal(pieces.get('e2'), undefined);
  assert.equal(pieces.size, 32);
});

test('unknown glyphs are skipped instead of aborting the parse', () => {
  const pieces = readFen('8/8/8/8/8/8/8/K2x3Q');

  assert.deepEqual(pieces.get('a1'), { color: 'white', role: 'king' });
  assert.deepEqual(pieces.get('h1'), { color: 'white', role: 'queen' });
  assert.equal(pieces.size, 2);
});

test('an empty fen yields an empty board', () => {
  assert.equal(readFen('').size, 0);
  assert.equal(writeFen(new Map()), '8/8/8/8/8/8/8/8');
});

test('sparse boards serialise with merged empty runs', () => {
  const pieces = new Map([
    ['a1', { color: 'white', role: 'rook' }],
    ['h8', { color: 'black', role: 'king' }],
    ['d4', { color: 'white', role: 'pawn' }],
  ]);

  assert.equal(writeFen(pieces), '7k/8/8/8/3P4/8/8/R7');
});
