import test from 'node:test';
import assert from 'node:assert/strict';
import { computePlan, easeInOutCubic } from '../src/anim-plan.ts';
import { readFen } from '../src/fen.ts';

const W = (role) => ({ color: 'white', role });
const B = (role) => ({ color: 'black', role });

function board(entries) {
  return new Map(Object.entries(entries));
}

test('an unchanged position plans nothing', () => {
  const plan = computePlan(readFen('start'), readFen('start'));

  assert.equal(plan.anims.size, 0);
  assert.equal(plan.fadings.size, 0);
});

test('a quiet move plans one vector keyed by the destination', () => {
  const plan = computePlan(board({ e2: W('pawn') }), board({ e4: W('pawn') }));

  assert.equal(plan.anims.size, 1);
  assert.equal(plan.fadings.size, 0);
  // e2 is two ranks below e4, so the piece starts 2 squares down and converges.
  assert.deepEqual(plan.anims.get('e4'), [0, -2, 0, -2]);
});

test('a capture animates the mover and fades the victim in place', () => {
  const plan = computePlan(
    board({ e4: W('pawn'), d5: B('pawn') }),
    board({ d5: W('pawn') }),
  );

  assert.equal(plan.anims.size, 1);
  assert.deepEqual(plan.anims.get('d5'), [1, -1, 1, -1]);
  assert.equal(plan.fadings.size, 1);
  assert.deepEqual(plan.fadings.get('d5'), B('pawn'));
});

test('castling matches both pieces independently', () => {
  const plan = computePlan(
    board({ e1: W('king'), h1: W('rook') }),
    board({ g1: W('king'), f1: W('rook') }),
  );

  assert.equal(plan.anims.size, 2);
  assert.deepEqual(plan.anims.get('g1'), [-2, 0, -2, 0]);
  assert.deepEqual(plan.anims.get('f1'), [2, 0, 2, 0]);
  assert.equal(plan.fadings.size, 0);
});

test('promotion fades the pawn and does not animate the new queen', () => {
  const plan = computePlan(board({ e7: W('pawn') }), board({ e8: W('queen') }));

  assert.equal(plan.anims.size, 0);
  assert.equal(plan.fadings.size, 1);
  assert.deepEqual(plan.fadings.get('e7'), W('pawn'));
});

test('the nearer of two identical rooks is matched', () => {
  const plan = computePlan(
    board({ a1: W('rook'), f1: W('rook') }),
    board({ d1: W('rook') }),
  );

  assert.equal(plan.anims.size, 1);
  // f1 is 2 files away from d1, a1 is 3: the f1 rook is the mover.
  assert.deepEqual(plan.anims.get('d1'), [2, 0, 2, 0]);
  assert.deepEqual([...plan.fadings.keys()], ['a1']);
});

test('a piece replaced on the same square fades rather than animates', () => {
  const plan = computePlan(board({ d5: W('knight') }), board({ d5: B('bishop') }));

  assert.equal(plan.anims.size, 0);
  assert.deepEqual(plan.fadings.get('d5'), W('knight'));
});

test('a vanished piece with no arrival just fades', () => {
  const plan = computePlan(board({ d5: B('queen'), e1: W('king') }), board({ e1: W('king') }));

  assert.equal(plan.anims.size, 0);
  assert.equal(plan.fadings.size, 1);
  assert.deepEqual(plan.fadings.get('d5'), B('queen'));
});

test('easeInOutCubic is anchored at 0, 0.5 and 1', () => {
  assert.equal(easeInOutCubic(0), 0);
  assert.equal(easeInOutCubic(0.5), 0.5);
  assert.equal(easeInOutCubic(1), 1);
  assert.ok(easeInOutCubic(0.25) < 0.25, 'eases in slowly');
  assert.ok(easeInOutCubic(0.75) > 0.75, 'eases out slowly');
});
