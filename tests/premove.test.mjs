import test from 'node:test';
import assert from 'node:assert/strict';
import { readFen } from '../src/fen.ts';
import { premove } from '../src/premove.ts';

const sorted = (keys) => [...keys].sort();

function board(entries) {
  return new Map(Object.entries(entries));
}

const W = (role) => ({ color: 'white', role });
const B = (role) => ({ color: 'black', role });

test('an empty square has no premoves', () => {
  assert.deepEqual(premove(readFen('start'), 'e4', 'standard'), []);
});

test('the knight on b1 reaches its three on-board squares, blockers included', () => {
  assert.deepEqual(sorted(premove(readFen('start'), 'b1', 'standard')), ['a3', 'c3', 'd2']);
});

test('a rook premoves through occupied squares by design', () => {
  const dests = premove(readFen('start'), 'a1', 'standard');

  assert.ok(dests.includes('a2'), 'own pawn does not block the premove');
  assert.ok(dests.includes('a8'), 'the whole file stays available');
  assert.ok(dests.includes('h1'), 'the whole rank stays available');
  assert.ok(!dests.includes('a1'), 'the origin is never a destination');
  assert.equal(dests.length, 14);
});

test('a bishop premoves both diagonals in full', () => {
  const dests = premove(board({ d4: W('bishop') }), 'd4', 'standard');

  assert.deepEqual(sorted(dests), ['a1', 'a7', 'b2', 'b6', 'c3', 'c5', 'e3', 'e5', 'f2', 'f6', 'g1', 'g7', 'h8']);
});

test('a queen premoves as rook plus bishop', () => {
  const rook = premove(board({ d4: W('rook') }), 'd4', 'standard');
  const bishop = premove(board({ d4: W('bishop') }), 'd4', 'standard');
  const queen = premove(board({ d4: W('queen') }), 'd4', 'standard');

  assert.deepEqual(sorted(queen), sorted([...rook, ...bishop]));
});

test('a white pawn on its start rank premoves one or two squares plus both captures', () => {
  assert.deepEqual(sorted(premove(readFen('start'), 'e2', 'standard')), ['d3', 'e3', 'e4', 'f3']);
});

test('a white pawn on e4 targets only d5, e5 and f5', () => {
  assert.deepEqual(sorted(premove(board({ e4: W('pawn') }), 'e4', 'standard')), ['d5', 'e5', 'f5']);
});

test('a white pawn on the first rank still gets its double step', () => {
  assert.deepEqual(sorted(premove(board({ e1: W('pawn') }), 'e1', 'standard')), ['d2', 'e2', 'e3', 'f2']);
});

test('an edge pawn only has one diagonal', () => {
  assert.deepEqual(sorted(premove(board({ a4: W('pawn') }), 'a4', 'standard')), ['a5', 'b5']);
});

test('a black pawn mirrors the white geometry', () => {
  assert.deepEqual(sorted(premove(readFen('start'), 'e7', 'standard')), ['d6', 'e5', 'e6', 'f6']);
  assert.deepEqual(sorted(premove(board({ e5: B('pawn') }), 'e5', 'standard')), ['d4', 'e4', 'f4']);
});

test('a king in the middle premoves its whole ring', () => {
  assert.deepEqual(
    sorted(premove(board({ d4: W('king') }), 'd4', 'standard')),
    ['c3', 'c4', 'c5', 'd3', 'd5', 'e3', 'e4', 'e5'],
  );
});

test('the classical king premoves to c1 and g1 when both rooks are home', () => {
  const dests = premove(readFen('start'), 'e1', 'standard');

  assert.deepEqual(sorted(dests), ['a1', 'c1', 'd1', 'd2', 'e2', 'f1', 'f2', 'g1', 'h1']);
});

test('a missing rook removes its castling premove target', () => {
  const dests = premove(board({ e1: W('king'), h1: W('rook') }), 'e1', 'standard');

  assert.ok(dests.includes('g1'));
  assert.ok(!dests.includes('c1'));
});

test('an enemy rook on the back rank grants no castling premove', () => {
  const dests = premove(board({ e1: W('king'), a1: B('rook'), h1: B('rook') }), 'e1', 'standard');

  assert.deepEqual(sorted(dests), ['d1', 'd2', 'e2', 'f1', 'f2']);
});

test('the black king castles on its own back rank only', () => {
  const dests = premove(board({ e8: B('king'), a8: B('rook'), h8: B('rook') }), 'e8', 'standard');

  assert.ok(dests.includes('c8'));
  assert.ok(dests.includes('g8'));

  const offRank = premove(board({ e4: B('king'), a8: B('rook') }), 'e4', 'standard');
  assert.ok(!offRank.includes('a4'));
});

test('king-onto-rook is a premove target in a 960 layout', () => {
  const dests = premove(board({ b1: W('king'), c1: W('rook'), g1: W('rook') }), 'b1', 'chess960');

  assert.ok(dests.includes('c1'), 'adjacent own rook');
  assert.ok(dests.includes('g1'), 'distant own rook on the back rank');
  assert.ok(!dests.includes('e1'), 'no classical c/g targets for a non-e-file king');
});

test('king-onto-rook also works in the standard variant for rookCastle input', () => {
  const dests = premove(board({ e1: W('king'), a1: W('rook'), h1: W('rook') }), 'e1', 'standard');

  assert.ok(dests.includes('a1'));
  assert.ok(dests.includes('h1'));
});

test('threeCheck uses the standard geometry', () => {
  const pieces = readFen('start');

  assert.deepEqual(
    sorted(premove(pieces, 'e1', 'threeCheck')),
    sorted(premove(pieces, 'e1', 'standard')),
  );
  assert.deepEqual(
    sorted(premove(pieces, 'b1', 'threeCheck')),
    sorted(premove(pieces, 'b1', 'standard')),
  );
});

test('the filter vetoes destinations last', () => {
  const dests = premove(readFen('start'), 'b1', 'standard', (orig, dest) => {
    assert.equal(orig, 'b1');
    return dest !== 'c3';
  });

  assert.deepEqual(sorted(dests), ['a3', 'd2']);
});
