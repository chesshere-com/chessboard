import test from 'node:test';
import assert from 'node:assert/strict';
import {
  allKeys,
  allPos,
  computeSquareCenter,
  containsPos,
  distanceSq,
  getKeyAtDomPos,
  key2pos,
  opposite,
  pos2key,
  posToTranslate,
  samePiece,
} from '../src/geometry.ts';

const bounds = { left: 100, top: 50, width: 800, height: 800 };

test('allKeys covers the 64 squares and lines up with allPos', () => {
  assert.equal(allKeys.length, 64);
  assert.equal(new Set(allKeys).size, 64);
  assert.equal(allKeys[0], 'a1');
  assert.equal(allKeys[63], 'h8');
  allKeys.forEach((key, i) => assert.deepEqual(allPos[i], key2pos(key)));
});

test('key2pos and pos2key are inverse over the whole board', () => {
  for (const key of allKeys) {
    assert.equal(pos2key(key2pos(key)), key);
  }
  assert.deepEqual(key2pos('a1'), [0, 0]);
  assert.deepEqual(key2pos('h8'), [7, 7]);
  assert.deepEqual(key2pos('e4'), [4, 3]);
});

test('opposite flips the color', () => {
  assert.equal(opposite('white'), 'black');
  assert.equal(opposite('black'), 'white');
});

test('distanceSq is the squared euclidean distance in square units', () => {
  assert.equal(distanceSq([0, 0], [3, 4]), 25);
  assert.equal(distanceSq([2, 2], [2, 2]), 0);
});

test('samePiece compares color and role only', () => {
  assert.ok(samePiece({ color: 'white', role: 'rook' }, { color: 'white', role: 'rook' }));
  assert.ok(!samePiece({ color: 'white', role: 'rook' }, { color: 'black', role: 'rook' }));
  assert.ok(!samePiece({ color: 'white', role: 'rook' }, { color: 'white', role: 'queen' }));
});

test('containsPos bounds-checks both axes', () => {
  assert.ok(containsPos([0, 0]));
  assert.ok(containsPos([7, 7]));
  assert.ok(!containsPos([-1, 0]));
  assert.ok(!containsPos([0, 8]));
});

test('posToTranslate places a1 bottom-left for white and top-right for black', () => {
  assert.deepEqual(posToTranslate(bounds, [0, 0], true), [0, 700]);
  assert.deepEqual(posToTranslate(bounds, [7, 7], true), [700, 0]);
  assert.deepEqual(posToTranslate(bounds, [0, 0], false), [700, 0]);
  assert.deepEqual(posToTranslate(bounds, [7, 7], false), [0, 700]);
});

test('getKeyAtDomPos resolves page coordinates for white orientation', () => {
  assert.equal(getKeyAtDomPos([150, 800], true, bounds), 'a1');
  assert.equal(getKeyAtDomPos([850, 100], true, bounds), 'h8');
  assert.equal(getKeyAtDomPos([550, 450], true, bounds), 'e4');
});

test('getKeyAtDomPos mirrors when the board is flipped', () => {
  assert.equal(getKeyAtDomPos([150, 800], false, bounds), 'h8');
  assert.equal(getKeyAtDomPos([850, 100], false, bounds), 'a1');
});

test('getKeyAtDomPos returns undefined outside the board', () => {
  assert.equal(getKeyAtDomPos([50, 400], true, bounds), undefined);
  assert.equal(getKeyAtDomPos([950, 400], true, bounds), undefined);
  assert.equal(getKeyAtDomPos([400, 20], true, bounds), undefined);
  assert.equal(getKeyAtDomPos([400, 900], true, bounds), undefined);
});

test('computeSquareCenter round-trips back through getKeyAtDomPos', () => {
  for (const key of allKeys) {
    for (const asWhite of [true, false]) {
      assert.equal(getKeyAtDomPos(computeSquareCenter(key, asWhite, bounds), asWhite, bounds), key);
    }
  }
  assert.deepEqual(computeSquareCenter('a1', true, bounds), [150, 800]);
});
