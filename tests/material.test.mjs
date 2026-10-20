import test from 'node:test';
import assert from 'node:assert/strict';
import { readFen } from '../src/fen.ts';
import { materialDiff } from '../src/material.ts';

test('the start position is level and nothing is captured', () => {
  const diff = materialDiff(readFen('start'));

  assert.equal(diff.score, 0);
  assert.deepEqual(diff.capturedBy.white, { pawn: 0, knight: 0, bishop: 0, rook: 0, queen: 0 });
  assert.deepEqual(diff.capturedBy.black, { pawn: 0, knight: 0, bishop: 0, rook: 0, queen: 0 });
});

test('white winning the black queen scores +9 and credits white', () => {
  const diff = materialDiff(readFen('rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR'));

  assert.equal(diff.score, 9);
  assert.equal(diff.capturedBy.white.queen, 1);
  assert.equal(diff.capturedBy.black.queen, 0);
});

test('black winning a white rook scores -5 and credits black', () => {
  const diff = materialDiff(readFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/1NBQKBNR'));

  assert.equal(diff.score, -5);
  assert.equal(diff.capturedBy.black.rook, 1);
  assert.equal(diff.capturedBy.white.rook, 0);
});

test('kings are ignored and a bare-kings position is level', () => {
  const diff = materialDiff(readFen('4k3/8/8/8/8/8/8/4K3'));

  assert.equal(diff.score, 0);
  assert.deepEqual(diff.capturedBy.white, { pawn: 8, knight: 2, bishop: 2, rook: 2, queen: 1 });
  assert.deepEqual(diff.capturedBy.black, { pawn: 8, knight: 2, bishop: 2, rook: 2, queen: 1 });
});

test('extra promoted material floors the captured count at zero', () => {
  const diff = materialDiff(readFen('4k3/8/8/8/8/8/8/3QQK2'));

  assert.equal(diff.capturedBy.black.queen, 0);
  assert.equal(diff.score, 18);
});
