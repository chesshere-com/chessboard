import test from 'node:test';
import assert from 'node:assert/strict';
import { expandRegion } from '../src/region.ts';

test('a rank expands to its eight squares in file order', () => {
  assert.deepEqual(expandRegion({ kind: 'rank', rank: '4' }), [
    'a4', 'b4', 'c4', 'd4', 'e4', 'f4', 'g4', 'h4',
  ]);
});

test('a file expands to its eight squares in rank order', () => {
  assert.deepEqual(expandRegion({ kind: 'file', file: 'd' }), [
    'd1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8',
  ]);
});

test('the long a1-h8 diagonal expands to eight squares', () => {
  assert.deepEqual(expandRegion({ kind: 'diagonal', from: 'a1', to: 'h8' }), [
    'a1', 'b2', 'c3', 'd4', 'e5', 'f6', 'g7', 'h8',
  ]);
});

test('a partial diagonal names the whole line through it', () => {
  assert.deepEqual(
    expandRegion({ kind: 'diagonal', from: 'b2', to: 'c3' }),
    ['a1', 'b2', 'c3', 'd4', 'e5', 'f6', 'g7', 'h8'],
  );
});

test('a diagonal is direction-independent', () => {
  assert.deepEqual(
    expandRegion({ kind: 'diagonal', from: 'h8', to: 'a1' }),
    expandRegion({ kind: 'diagonal', from: 'a1', to: 'h8' }).reverse(),
  );
});

test('the anti-diagonal walks to both edges', () => {
  assert.deepEqual(expandRegion({ kind: 'diagonal', from: 'f3', to: 'e4' }), [
    'h1', 'g2', 'f3', 'e4', 'd5', 'c6', 'b7', 'a8',
  ]);
});

test('a short diagonal ends at the board edge', () => {
  assert.deepEqual(expandRegion({ kind: 'diagonal', from: 'a3', to: 'b4' }), [
    'a3', 'b4', 'c5', 'd6', 'e7', 'f8',
  ]);
});

test('a non-diagonal spec expands to nothing', () => {
  assert.deepEqual(expandRegion({ kind: 'diagonal', from: 'a1', to: 'a8' }), []);
  assert.deepEqual(expandRegion({ kind: 'diagonal', from: 'a1', to: 'h1' }), []);
  assert.deepEqual(expandRegion({ kind: 'diagonal', from: 'c4', to: 'f5' }), []);
  assert.deepEqual(expandRegion({ kind: 'diagonal', from: 'd4', to: 'd4' }), []);
});

test('an explicit square set is deduped and order-preserving', () => {
  assert.deepEqual(
    expandRegion({ kind: 'squares', squares: ['e4', 'd5', 'e4', 'a1'] }),
    ['e4', 'd5', 'a1'],
  );
});
