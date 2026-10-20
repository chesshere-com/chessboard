import test from 'node:test';
import assert from 'node:assert/strict';

import { formatClock } from '../solid/clock-format.ts';
import { capturedRow, leadingScore } from '../solid/material-row.ts';

const diff = (white, black, score) => ({
  capturedBy: {
    white: { pawn: 0, knight: 0, bishop: 0, rook: 0, queen: 0, ...white },
    black: { pawn: 0, knight: 0, bishop: 0, rook: 0, queen: 0, ...black },
  },
  score,
});

// --- formatClock -----------------------------------------------------------

test('formatClock switches to h:mm:ss at exactly one hour', () => {
  assert.equal(formatClock(3_600_000), '1:00:00');
  assert.equal(formatClock(3_599_999), '59:59');
});

test('formatClock renders hours, minutes and seconds zero-padded', () => {
  assert.equal(formatClock(3_723_000), '1:02:03');
  assert.equal(formatClock(36_000_000), '10:00:00');
});

test('formatClock switches to tenths below ten seconds', () => {
  assert.equal(formatClock(10_000), '0:10');
  assert.equal(formatClock(9_999), '0:09.9');
  assert.equal(formatClock(8_500), '0:08.5');
  assert.equal(formatClock(0), '0:00.0');
});

test('formatClock truncates rather than rounds', () => {
  assert.equal(formatClock(59_999), '0:59');
  assert.equal(formatClock(60_000), '1:00');
  assert.equal(formatClock(9_099), '0:09.0');
});

test('formatClock clamps non-positive and NaN input to zero', () => {
  assert.equal(formatClock(-1), '0:00.0');
  assert.equal(formatClock(-500_000), '0:00.0');
  assert.equal(formatClock(Number.NaN), '0:00.0');
});

// --- capturedRow -----------------------------------------------------------

test('capturedRow orders pawn to queen and drops zero counts', () => {
  const d = diff({ pawn: 2, bishop: 1, queen: 1 }, {});
  assert.deepEqual(capturedRow(d, 'white'), [
    { role: 'pawn', count: 2 },
    { role: 'bishop', count: 1 },
    { role: 'queen', count: 1 },
  ]);
});

test('capturedRow reads the requested side only', () => {
  const d = diff({ pawn: 3 }, { rook: 1, knight: 2 });
  assert.deepEqual(capturedRow(d, 'white'), [{ role: 'pawn', count: 3 }]);
  assert.deepEqual(capturedRow(d, 'black'), [
    { role: 'knight', count: 2 },
    { role: 'rook', count: 1 },
  ]);
});

test('capturedRow is empty at the start position', () => {
  assert.deepEqual(capturedRow(diff({}, {}, 0), 'white'), []);
  assert.deepEqual(capturedRow(diff({}, {}, 0), 'black'), []);
});

// --- leadingScore ----------------------------------------------------------

test('leadingScore shows the lead on the leading side only', () => {
  const whiteAhead = diff({ pawn: 3 }, {}, 3);
  assert.equal(leadingScore(whiteAhead, 'white'), 3);
  assert.equal(leadingScore(whiteAhead, 'black'), undefined);

  const blackAhead = diff({}, { queen: 1 }, -9);
  assert.equal(leadingScore(blackAhead, 'white'), undefined);
  assert.equal(leadingScore(blackAhead, 'black'), 9);
});

test('leadingScore hides the score when material is level', () => {
  const level = diff({ rook: 1 }, { rook: 1 }, 0);
  assert.equal(leadingScore(level, 'white'), undefined);
  assert.equal(leadingScore(level, 'black'), undefined);
});
