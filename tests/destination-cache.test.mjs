import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, configure, destinations } from '../src/state.ts';
import { baseMove, userMove, finishPromotion, setSelected } from '../src/board.ts';

test('lazy destinations are cached and invalidated by config, selection and moves', () => {
  const state = defaults();
  let calls = 0;
  configure(state, {movable: {color:'both', getDests: () => { calls++; return ['e4']; }}});
  for (let i = 0; i < 100; i++) destinations(state, 'e2');
  assert.equal(calls, 1);
  configure(state, {});
  destinations(state, 'e2');
  assert.equal(calls, 2);
  setSelected(state, 'e2');
  destinations(state, 'e2');
  assert.equal(calls, 3);
  baseMove(state, 'e2', 'e4');
  destinations(state, 'e4');
  assert.equal(calls, 4);
});

test('missing destinations are cached and explicit lists take precedence', () => {
  const state = defaults();
  let calls = 0;
  configure(state, {movable: {getDests: () => {calls++; return undefined;}}});
  destinations(state, 'a1'); destinations(state, 'a1');
  assert.equal(calls, 1);
  configure(state, {movable: {dests: new Map([['a1', []]])}});
  assert.deepEqual(destinations(state, 'a1'), []);
  assert.equal(calls, 1);
});

test('promotion cannot commit after legality or position changes', () => {
  const state = defaults();
  const setup = {fen:'k7/4P3/8/8/8/8/8/4K3', turnColor:'white', movable:{color:'white', dests:new Map([['e7',['e8']]])}};
  configure(state, setup);
  userMove(state,'e7','e8',false);
  configure(state, {movable:{dests:new Map()}});
  assert.equal(finishPromotion(state,'queen'), false);
  assert.equal(state.pieces.get('e7').role,'pawn');
  configure(state, setup);
  userMove(state,'e7','e8',false);
  baseMove(state,'e1','d1');
  assert.equal(finishPromotion(state,'queen'), false);
  assert.equal(state.pieces.get('e7').role,'pawn');
});

test('an old custom dialog cannot resolve a newer promotion request', () => {
  const state = defaults();
  configure(state, {fen:'k7/4P3/8/8/8/8/8/4K3', movable:{color:'white',free:true}});
  userMove(state,'e7','e8',false);
  const oldId = state.promotion.current.requestId;
  state.promotion.current = undefined;
  userMove(state,'e7','e8',false);
  assert.equal(finishPromotion(state,'queen',oldId),false);
  assert.ok(state.promotion.current);
  assert.equal(finishPromotion(state,'knight',state.promotion.current.requestId),true);
  assert.equal(state.pieces.get('e8').role,'knight');
});
