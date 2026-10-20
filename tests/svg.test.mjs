import test from 'node:test';
import assert from 'node:assert/strict';
import { shapeHash } from '../src/svg.ts';

const green = { key: 'green', color: '#15781B', opacity: 1, lineWidth: 10 };
const arrow = { type: 'arrow', from: 'e2', to: 'e4', brush: 'green' };

test('the same shape and brush hash the same', () => {
  assert.equal(shapeHash(arrow, green, true, false), shapeHash(arrow, { ...green }, true, false));
});

// Brushes are reconfigurable at runtime; hashing the key alone made a recolour
// invisible to the sync pass and left every arrow painted the old colour.
test('a recoloured brush under the same key changes the hash', () => {
  const recoloured = { ...green, color: '#ff0000' };

  assert.notEqual(shapeHash(arrow, green, true, false), shapeHash(arrow, recoloured, true, false));
});

test('brush opacity and lineWidth are part of the hash', () => {
  const base = shapeHash(arrow, green, true, false);

  assert.notEqual(base, shapeHash(arrow, { ...green, opacity: 0.4 }, true, false));
  assert.notEqual(base, shapeHash(arrow, { ...green, lineWidth: 15 }, true, false));
});

test('brush colour reaches the hash of every brush-painted shape kind', () => {
  const recoloured = { ...green, color: '#ff0000' };
  const shapes = [
    arrow,
    { type: 'circle', square: 'd5' },
    { type: 'region', region: { kind: 'rank', rank: '4' } },
    { type: 'glyph', square: 'd5', glyph: { kind: 'star' } },
    { type: 'label', square: 'd5', text: '1' },
  ];

  for (const shape of shapes) {
    assert.notEqual(
      shapeHash(shape, green, true, false),
      shapeHash(shape, recoloured, true, false),
      `${shape.type} must repaint on a brush recolour`,
    );
  }
});

test('orientation and converge shortening still separate hashes', () => {
  assert.notEqual(shapeHash(arrow, green, true, false), shapeHash(arrow, green, false, false));
  assert.notEqual(shapeHash(arrow, green, true, false), shapeHash(arrow, green, true, true));
});

test('arrow outline is part of the hash', () => {
  assert.notEqual(shapeHash(arrow, green, true, false), shapeHash({ ...arrow, outline: '#fff' }, green, true, false));
});
