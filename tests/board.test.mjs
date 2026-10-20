import test from 'node:test';
import assert from 'node:assert/strict';
import {
  baseMove,
  canMove,
  canPremove,
  finishPromotion,
  isMovable,
  isPremovable,
  playPremove,
  setSelected,
  stop,
  unselect,
  unsetPremove,
  userMove,
  whitePov,
} from '../src/board.ts';
import { configure, defaults } from '../src/state.ts';

// User callbacks are deferred a microtask; a macrotask tick flushes them.
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function stateWith(config) {
  const state = defaults();
  configure(state, config);
  return state;
}

test('whitePov follows the orientation', () => {
  assert.equal(whitePov(defaults()), true);
  assert.equal(whitePov(stateWith({ orientation: 'black' })), false);
});

test('a piece is movable only for its own color on its own turn', () => {
  const state = stateWith({ movable: { color: 'white' } });

  assert.ok(isMovable(state, 'e2'));
  assert.ok(!isMovable(state, 'e7'), 'black piece with movable.color white');
  assert.ok(!isMovable(state, 'e4'), 'empty square');

  state.turnColor = 'black';
  assert.ok(!isMovable(state, 'e2'), 'not on turn');

  const both = stateWith({ movable: { color: 'both' }, turnColor: 'black' });
  assert.ok(isMovable(both, 'e2'));

  const viewOnly = stateWith({ movable: { color: 'white' }, viewOnly: true });
  assert.ok(!isMovable(viewOnly, 'e2'));
});

test('canMove consults dests, getDests and free mode', () => {
  const withDests = stateWith({
    movable: { color: 'white', dests: new Map([['e2', ['e3', 'e4']]]) },
  });

  assert.ok(canMove(withDests, 'e2', 'e4'));
  assert.ok(!canMove(withDests, 'e2', 'e5'));
  assert.ok(!canMove(withDests, 'e2', 'e2'), 'origin is never a destination');
  assert.ok(!canMove(withDests, 'd2', 'd4'), 'no dests entry');

  const lazy = stateWith({
    movable: { color: 'white', getDests: (orig) => (orig === 'd2' ? ['d3'] : undefined) },
  });
  assert.ok(canMove(lazy, 'd2', 'd3'));
  assert.ok(!canMove(lazy, 'd2', 'd4'));

  const free = stateWith({ movable: { color: 'white', free: true } });
  assert.ok(canMove(free, 'e2', 'h7'));
});

test('a user move commits, flips the turn, records lastMove and clears dests', async () => {
  const after = [];
  const moved = [];
  let changes = 0;
  const state = stateWith({
    turnColor: 'white',
    movable: {
      color: 'white',
      dests: new Map([['e2', ['e4']]]),
      events: { after: (orig, dest, meta) => after.push([orig, dest, meta]) },
    },
    events: {
      move: (orig, dest, captured) => moved.push([orig, dest, captured]),
      change: () => changes++,
    },
  });

  assert.equal(userMove(state, 'e2', 'e4', true), true);
  assert.equal(state.pieces.get('e2'), undefined);
  assert.deepEqual(state.pieces.get('e4'), { color: 'white', role: 'pawn' });
  assert.equal(state.turnColor, 'black');
  assert.deepEqual(state.lastMove, ['e2', 'e4']);
  assert.equal(state.movable.dests, undefined);

  await flush();
  assert.equal(changes, 1);
  assert.deepEqual(moved, [['e2', 'e4', undefined]]);
  assert.deepEqual(after, [['e2', 'e4', { premove: false, byDrag: true }]]);
});

test('a capture reports the captured piece in the metadata', async () => {
  const after = [];
  const state = stateWith({
    fen: '4k3/8/8/3p4/4P3/8/8/4K3',
    turnColor: 'white',
    movable: {
      color: 'white',
      dests: new Map([['e4', ['d5']]]),
      events: { after: (orig, dest, meta) => after.push(meta) },
    },
  });

  assert.equal(userMove(state, 'e4', 'd5', false), true);
  assert.deepEqual(state.pieces.get('d5'), { color: 'white', role: 'pawn' });

  await flush();
  assert.deepEqual(after, [
    { premove: false, byDrag: false, captured: { color: 'black', role: 'pawn' } },
  ]);
});

test('a move outside dests sets a premove instead', async () => {
  const set = [];
  const state = stateWith({
    turnColor: 'black',
    movable: { color: 'white', dests: new Map() },
    premovable: { events: { set: (orig, dest) => set.push([orig, dest]) } },
  });

  assert.ok(isPremovable(state, 'e2'));
  assert.ok(canPremove(state, 'e2', 'e4'));
  assert.equal(userMove(state, 'e2', 'e4', false), true);
  assert.deepEqual(state.premovable.current, { from: 'e2', to: 'e4' });
  assert.deepEqual(state.pieces.get('e2'), { color: 'white', role: 'pawn' }, 'not committed');

  await flush();
  assert.deepEqual(set, [['e2', 'e4']]);
});

test('an impossible move is rejected and clears the selection', () => {
  const state = stateWith({ turnColor: 'white', movable: { color: 'white', dests: new Map() } });
  setSelected(state, 'e2');

  assert.equal(userMove(state, 'e2', 'e5', false), false);
  assert.equal(state.selected, undefined);
  assert.equal(state.premovable.current, undefined);
});

test('selecting an off-turn own piece caches its premove destinations', () => {
  const state = stateWith({ turnColor: 'black', movable: { color: 'white' } });

  setSelected(state, 'b1');
  assert.deepEqual([...state.premovable.dests].sort(), ['a3', 'c3', 'd2']);

  setSelected(state, undefined);
  assert.equal(state.selected, undefined);
  assert.equal(state.premovable.dests, undefined);

  const onTurn = stateWith({ turnColor: 'white', movable: { color: 'white' } });
  setSelected(onTurn, 'b1');
  assert.equal(onTurn.premovable.dests, undefined, 'no premove dests on your own turn');
});

test('classical castling input is rewritten to the canonical squares', () => {
  const state = stateWith({ fen: '4k3/8/8/8/8/8/8/R3K2R', turnColor: 'white' });

  assert.notEqual(baseMove(state, 'e1', 'g1'), false);
  assert.deepEqual(state.pieces.get('g1'), { color: 'white', role: 'king' });
  assert.deepEqual(state.pieces.get('f1'), { color: 'white', role: 'rook' });
  assert.equal(state.pieces.get('e1'), undefined);
  assert.equal(state.pieces.get('h1'), undefined);
  assert.deepEqual(state.lastMove, ['e1', 'g1'], 'lastMove keeps the user input pair');
});

test('king-onto-rook castling works for 960 layouts on both wings', () => {
  const kingSide = stateWith({ fen: '4k3/8/8/8/8/8/8/1K2R3', turnColor: 'white' });
  assert.equal(baseMove(kingSide, 'b1', 'e1'), true);
  assert.deepEqual(kingSide.pieces.get('g1'), { color: 'white', role: 'king' });
  assert.deepEqual(kingSide.pieces.get('f1'), { color: 'white', role: 'rook' });
  assert.equal(kingSide.pieces.get('b1'), undefined);
  assert.equal(kingSide.pieces.get('e1'), undefined);

  const queenSide = stateWith({ fen: '4k3/8/8/8/8/8/8/R2K4', turnColor: 'white' });
  assert.equal(baseMove(queenSide, 'd1', 'a1'), true);
  assert.deepEqual(queenSide.pieces.get('c1'), { color: 'white', role: 'king' });
  assert.deepEqual(queenSide.pieces.get('d1'), { color: 'white', role: 'rook' });
  assert.equal(queenSide.pieces.get('a1'), undefined);
});

test('a king landing on an enemy rook is a capture, not a castle', () => {
  const state = stateWith({ fen: '4k3/8/8/8/8/8/8/1Kr5', turnColor: 'white' });

  assert.deepEqual(baseMove(state, 'b1', 'c1'), { color: 'black', role: 'rook' });
  assert.deepEqual(state.pieces.get('c1'), { color: 'white', role: 'king' });
});

test('rookCastle false leaves king-onto-rook as a plain move', () => {
  const state = stateWith({
    fen: '4k3/8/8/8/8/8/8/1K2R3',
    turnColor: 'white',
    movable: { rookCastle: false },
  });

  baseMove(state, 'b1', 'e1');
  assert.deepEqual(state.pieces.get('e1'), { color: 'white', role: 'king' });
  assert.equal(state.pieces.get('g1'), undefined);
});

test('a promotion stashes the pending choice and commits on finishPromotion', async () => {
  const after = [];
  const state = stateWith({
    fen: 'k7/4P3/8/8/8/8/8/4K3',
    turnColor: 'white',
    movable: {
      color: 'white',
      dests: new Map([['e7', ['e8']]]),
      events: { after: (orig, dest, meta) => after.push(meta) },
    },
  });

  assert.equal(userMove(state, 'e7', 'e8', false), true);
  assert.deepEqual(state.promotion.current, {
    requestId: state.promotionSequence,
    version: state.positionVersion,
    orig: 'e7',
    dest: 'e8',
    color: 'white',
    premove: false,
    byDrag: false,
  });
  assert.deepEqual(state.pieces.get('e7'), { color: 'white', role: 'pawn' }, 'not yet committed');
  assert.equal(state.turnColor, 'white');

  assert.equal(finishPromotion(state, 'knight'), true);
  assert.deepEqual(state.pieces.get('e8'), { color: 'white', role: 'knight' });
  assert.equal(state.pieces.get('e7'), undefined);
  assert.equal(state.turnColor, 'black');
  assert.equal(state.promotion.current, undefined);
  assert.equal(finishPromotion(state, 'queen'), false, 'nothing left to finish');

  await flush();
  assert.deepEqual(after, [{ premove: false, byDrag: false, promotion: 'knight' }]);
});

test('autoQueen commits the promotion without a dialog round-trip', async () => {
  const after = [];
  const state = stateWith({
    fen: 'k7/4P3/8/8/8/8/8/4K3',
    turnColor: 'white',
    promotion: { autoQueen: true },
    movable: {
      color: 'white',
      dests: new Map([['e7', ['e8']]]),
      events: { after: (orig, dest, meta) => after.push(meta) },
    },
  });

  assert.equal(userMove(state, 'e7', 'e8', false), true);
  assert.deepEqual(state.pieces.get('e8'), { color: 'white', role: 'queen' });
  assert.equal(state.promotion.current, undefined);

  await flush();
  assert.deepEqual(after, [{ premove: false, byDrag: false, promotion: 'queen' }]);
});

test('a dialog-less promotion notifies the caller', async () => {
  const required = [];
  const state = stateWith({
    fen: 'k7/4P3/8/8/8/8/8/4K3',
    turnColor: 'white',
    promotion: { dialog: false, onRequired: (orig, dest, color) => required.push([orig, dest, color]) },
    movable: { color: 'white', dests: new Map([['e7', ['e8']]]) },
  });

  userMove(state, 'e7', 'e8', false);

  await flush();
  assert.deepEqual(required, [['e7', 'e8', 'white']]);
});

test('a premove plays when the new dests allow it', async () => {
  const after = [];
  const unset = [];
  const state = stateWith({
    turnColor: 'black',
    movable: { color: 'white', events: { after: (orig, dest, meta) => after.push(meta) } },
    premovable: { events: { unset: () => unset.push(true) } },
  });

  userMove(state, 'e2', 'e4', false);
  assert.deepEqual(state.premovable.current, { from: 'e2', to: 'e4' });

  configure(state, { turnColor: 'white', movable: { dests: new Map([['e2', ['e3', 'e4']]]) } });
  assert.equal(playPremove(state), true);
  assert.deepEqual(state.pieces.get('e4'), { color: 'white', role: 'pawn' });
  assert.equal(state.premovable.current, undefined);

  await flush();
  assert.deepEqual(after, [{ premove: true, byDrag: false }]);
  assert.deepEqual(unset, [true]);
});

test('a premove is discarded when the new dests forbid it', async () => {
  const after = [];
  const state = stateWith({
    turnColor: 'black',
    movable: { color: 'white', events: { after: (orig, dest, meta) => after.push(meta) } },
  });

  userMove(state, 'e2', 'e4', false);
  configure(state, { turnColor: 'white', movable: { dests: new Map([['d2', ['d4']]]) } });

  assert.equal(playPremove(state), false);
  assert.equal(state.premovable.current, undefined);
  assert.deepEqual(state.pieces.get('e2'), { color: 'white', role: 'pawn' });

  await flush();
  assert.deepEqual(after, []);
});

test('playPremove with nothing stored is a no-op', () => {
  assert.equal(playPremove(defaults()), false);
});

// The documented consumer flow: the opponent's move arrives as a whole fen,
// then playPremove decides. A fen that clears the premove breaks it silently.
test('a premove survives the opponent move arriving as a fen and then plays', async () => {
  const after = [];
  const unset = [];
  const state = stateWith({
    turnColor: 'black',
    movable: { color: 'white', events: { after: (orig, dest, meta) => after.push(meta) } },
    premovable: { events: { unset: () => unset.push(true) } },
  });

  userMove(state, 'g1', 'f3', false);
  assert.deepEqual(state.premovable.current, { from: 'g1', to: 'f3' });

  configure(state, {
    fen: 'rnbqkb1r/pppppppp/5n2/8/8/8/PPPPPPPP/RNBQKBNR',
    turnColor: 'white',
    movable: { dests: new Map([['g1', ['f3', 'h3']]]) },
  });
  assert.deepEqual(state.premovable.current, { from: 'g1', to: 'f3' });

  assert.equal(playPremove(state), true);
  assert.deepEqual(state.pieces.get('f3'), { color: 'white', role: 'knight' });
  assert.equal(state.premovable.current, undefined);

  await flush();
  assert.deepEqual(after, [{ premove: true, byDrag: false }]);
  assert.deepEqual(unset, [true]);
});

test('a premove preserved across a fen is still validated against the new dests', async () => {
  const after = [];
  const unset = [];
  const state = stateWith({
    turnColor: 'black',
    movable: { color: 'white', events: { after: (orig, dest, meta) => after.push(meta) } },
    premovable: { events: { unset: () => unset.push(true) } },
  });

  userMove(state, 'g1', 'f3', false);

  // The opponent's move took f3 away; the stored premove is now illegal.
  configure(state, {
    fen: 'rnbqkbnr/pppp1ppp/8/4p3/8/5b2/PPPPPPPP/RNBQKBNR',
    turnColor: 'white',
    movable: { dests: new Map([['g1', ['h3']]]) },
  });

  assert.equal(playPremove(state), false);
  assert.deepEqual(state.pieces.get('g1'), { color: 'white', role: 'knight' });
  assert.equal(state.premovable.current, undefined);

  await flush();
  assert.deepEqual(after, []);
  assert.deepEqual(unset, [true], 'the discarded premove still reports unset, once');
});

test('every premove clear path fires unset exactly once', async () => {
  const arm = () => {
    const unset = [];
    const state = stateWith({
      turnColor: 'black',
      movable: { color: 'white' },
      premovable: { events: { unset: () => unset.push(true) } },
    });
    userMove(state, 'e2', 'e4', false);
    assert.deepEqual(state.premovable.current, { from: 'e2', to: 'e4' });
    return { state, unset };
  };

  const direct = arm();
  unsetPremove(direct.state);
  unsetPremove(direct.state);
  await flush();
  assert.deepEqual(direct.unset, [true], 'a second clear of an empty premove is silent');

  const stopped = arm();
  stop(stopped.state);
  await flush();
  assert.deepEqual(stopped.unset, [true]);

  const played = arm();
  configure(played.state, {
    turnColor: 'white',
    movable: { dests: new Map([['e2', ['e4']]]) },
  });
  assert.equal(playPremove(played.state), true);
  await flush();
  assert.deepEqual(played.unset, [true]);

  const quiet = stateWith({ premovable: { events: { unset: () => assert.fail('no premove') } } });
  unsetPremove(quiet);
  await flush();
});

test('a premove into promotion opens the dialog with the premove flag set', async () => {
  const after = [];
  const state = stateWith({
    fen: 'k7/4P3/8/8/8/8/8/4K3',
    turnColor: 'black',
    movable: { color: 'white', events: { after: (orig, dest, meta) => after.push(meta) } },
  });

  assert.equal(userMove(state, 'e7', 'e8', false), true);
  configure(state, { turnColor: 'white', movable: { dests: new Map([['e7', ['e8']]]) } });

  assert.equal(playPremove(state), true);
  assert.equal(state.promotion.current.premove, true);
  assert.equal(finishPromotion(state, 'rook'), true);

  await flush();
  assert.deepEqual(after, [{ premove: true, byDrag: false, promotion: 'rook' }]);
});

test('unselect clears selection and cached premove dests', () => {
  const state = stateWith({ turnColor: 'black', movable: { color: 'white' } });
  setSelected(state, 'b1');

  unselect(state);
  assert.equal(state.selected, undefined);
  assert.equal(state.premovable.dests, undefined);
});

test('stop drops movability, the premove and the selection', () => {
  const state = stateWith({
    turnColor: 'black',
    movable: { color: 'white', dests: new Map([['e2', ['e4']]]) },
  });
  userMove(state, 'e2', 'e4', false);
  setSelected(state, 'd2');

  stop(state);
  assert.equal(state.movable.color, undefined);
  assert.equal(state.movable.dests, undefined);
  assert.equal(state.premovable.current, undefined);
  assert.equal(state.selected, undefined);
});

test('baseMove refuses no-ops and empty origins', () => {
  const state = defaults();

  assert.equal(baseMove(state, 'e2', 'e2'), false);
  assert.equal(baseMove(state, 'e4', 'e5'), false);
});
