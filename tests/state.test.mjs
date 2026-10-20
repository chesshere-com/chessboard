import test from 'node:test';
import assert from 'node:assert/strict';
import { configure, defaults, destinations, setCheck, setSelected } from '../src/state.ts';
import { writeFen } from '../src/fen.ts';

test('defaults describe an untouched start position', () => {
  const state = defaults();

  assert.equal(writeFen(state.pieces), 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR');
  assert.equal(state.orientation, 'white');
  assert.equal(state.turnColor, 'white');
  assert.equal(state.movable.color, undefined);
  assert.equal(state.movable.free, false);
  assert.equal(state.movable.rookCastle, true);
  assert.equal(state.animation.duration, 200);
  assert.equal(state.draggable.distance, 3);
  assert.equal(state.draggable.liftScale, 1.1);
  assert.equal(state.draggable.touchIgnoreRadius, 1);
  assert.equal(state.promotion.dialog, true);
  assert.equal(state.promotion.autoQueen, false);
  assert.equal(state.variant.key, 'standard');
  assert.equal(state.stats.dragged, false);
  assert.deepEqual(state.drawable.brushSelectors, ['green', 'red', 'blue', 'yellow']);
  assert.equal(state.drawable.brushes.green.color, '#15781B');
  assert.equal(state.drawable.brushes.paleBlue.opacity, 0.4);
  assert.equal(state.drawable.brushes.paleRed.lineWidth, 15);
});

test('two default states do not share mutable structures', () => {
  const a = defaults();
  const b = defaults();

  a.pieces.delete('e2');
  a.drawable.shapes.push({ type: 'circle', square: 'e4' });

  assert.ok(b.pieces.has('e2'));
  assert.equal(b.drawable.shapes.length, 0);
});

test('configure deep-merges nested plain objects', () => {
  const state = defaults();

  configure(state, { movable: { color: 'white' } });
  configure(state, { movable: { showDests: false } });

  assert.equal(state.movable.color, 'white', 'earlier keys survive');
  assert.equal(state.movable.showDests, false);
  assert.equal(state.movable.rookCastle, true, 'untouched defaults survive');
});

test('configure replaces dests wholesale instead of merging them', () => {
  const state = defaults();

  configure(state, { movable: { dests: new Map([['e2', ['e3', 'e4']]]) } });
  configure(state, { movable: { dests: new Map([['d2', ['d4']]]) } });

  assert.deepEqual([...state.movable.dests.keys()], ['d2']);
});

test('configure replaces shape arrays instead of concatenating them', () => {
  const state = defaults();

  configure(state, { drawable: { autoShapes: [{ type: 'circle', square: 'e4' }] } });
  configure(state, { drawable: { autoShapes: [{ type: 'circle', square: 'd5' }] } });

  assert.equal(state.drawable.autoShapes.length, 1);
  assert.equal(state.drawable.autoShapes[0].square, 'd5');
});

test('a fen re-read replaces the pieces, drops a selection whose piece is gone and keeps the premove', () => {
  const state = defaults();
  state.selected = 'e2';
  state.premovable.current = { from: 'e2', to: 'e4' };
  state.premovable.dests = ['e3', 'e4'];

  configure(state, { fen: '4k3/8/8/8/8/8/8/4K3' });

  assert.equal(state.pieces.size, 2);
  assert.equal(state.selected, undefined, 'nothing is left on e2 to act on');
  assert.deepEqual(
    state.premovable.current,
    { from: 'e2', to: 'e4' },
    'the opponent move arriving as a fen is exactly when a premove must survive',
  );
  assert.equal(state.premovable.dests, undefined, 'cached selection geometry is position-bound');
});

test('a selection survives a position update while its piece stays and can still act', () => {
  const state = defaults();
  configure(state, { turnColor: 'black', movable: { color: 'white' } });
  setSelected(state, 'e2');
  assert.deepEqual(state.premovable.dests, ['d3', 'e3', 'e4', 'f3']);

  // The opponent replies e7e5: white to move, with the caller's fresh legality.
  configure(state, {
    fen: 'rnbqkbnr/pppp1ppp/8/4p3/8/8/PPPPPPPP/RNBQKBNR',
    turnColor: 'white',
    movable: { dests: new Map([['e2', ['e3', 'e4']]]) },
  });
  assert.equal(state.selected, 'e2', 'the piece selected during the opponent turn is still selected');
  assert.equal(state.premovable.dests, undefined, 'no premove geometry on our own turn');
  assert.deepEqual(destinations(state, 'e2'), ['e3', 'e4'], 'hints come from the new position');

  // Back to the opponent's turn without the piece moving (a takeback): premove geometry returns.
  configure(state, { turnColor: 'black' });
  assert.equal(state.selected, 'e2');
  assert.deepEqual(state.premovable.dests, ['d3', 'e3', 'e4', 'f3']);

  // Selecting through config is validated the same way.
  configure(state, { selected: 'd2' });
  assert.equal(state.selected, 'd2');
  assert.deepEqual(state.premovable.dests, ['c3', 'd3', 'd4', 'e3']);
  configure(state, { selected: 'd4' });
  assert.equal(state.selected, undefined, 'an empty square cannot be selected');
});

test('a selection is dropped when its piece is replaced or can no longer act', () => {
  // An enemy piece landed on the selected square: same square, different piece.
  const captured = defaults();
  configure(captured, { turnColor: 'black', movable: { color: 'both' } });
  setSelected(captured, 'e2');
  configure(captured, { fen: 'rnbqkbnr/pppp1ppp/8/8/8/8/PPPPqPPP/RNBQKBNR', turnColor: 'white' });
  assert.equal(captured.selected, undefined, 'movable.color both would accept the enemy queen; piece identity must not');

  // Piece still there, but the side switched and premoves are off.
  const offTurn = defaults();
  configure(offTurn, { turnColor: 'white', movable: { color: 'white' }, premovable: { enabled: false } });
  setSelected(offTurn, 'e2');
  configure(offTurn, { turnColor: 'black' });
  assert.equal(offTurn.selected, undefined);

  // View-only without a fen: the game adapter's follow-up set at game end.
  const frozen = defaults();
  configure(frozen, { turnColor: 'white', movable: { color: 'white' } });
  setSelected(frozen, 'e2');
  configure(frozen, { viewOnly: true, movable: { color: undefined } });
  assert.equal(frozen.selected, undefined);
  assert.equal(frozen.premovable.dests, undefined);
});

test('a fen re-read cancels a pending promotion', () => {
  const state = defaults();
  state.promotion.current = { orig: 'b7', dest: 'b8', color: 'white' };

  configure(state, { fen: '4k3/8/8/8/8/8/8/4K3' });

  assert.equal(state.promotion.current, undefined);
});

test('configure leaves no stray fen or raw check fields on the state', () => {
  const state = defaults();

  configure(state, { fen: 'start', check: true });

  assert.ok(!('fen' in state));
  assert.equal(state.check, 'e1');
});

test('check true resolves the king square of the side to move', () => {
  const state = defaults();

  configure(state, { turnColor: 'black', check: true });
  assert.equal(state.check, 'e8');

  configure(state, { check: 'white' });
  assert.equal(state.check, 'e1');

  configure(state, { check: undefined });
  assert.equal(state.check, undefined, 'an explicit undefined clears the check');

  configure(state, { check: 'black' });
  configure(state, { turnColor: 'white' });
  assert.equal(state.check, 'e8', 'an absent key leaves the check alone');
});

test('setCheck falls back to nothing when the king is missing', () => {
  const state = defaults();

  configure(state, { fen: '8/8/8/8/8/8/8/4K3' });
  setCheck(state, 'black');
  assert.equal(state.check, undefined);

  setCheck(state, 'white');
  assert.equal(state.check, 'e1');

  setCheck(state, false);
  assert.equal(state.check, undefined);
});

test('lastMove uses presence-of-key semantics', () => {
  const state = defaults();

  configure(state, { lastMove: ['e2', 'e4'] });
  assert.deepEqual(state.lastMove, ['e2', 'e4']);

  configure(state, { turnColor: 'black' });
  assert.deepEqual(state.lastMove, ['e2', 'e4'], 'an absent key leaves it alone');

  configure(state, { lastMove: undefined });
  assert.equal(state.lastMove, undefined);
});

test('callback and function config values are replaced, not merged', () => {
  const state = defaults();
  const first = () => 'first';
  const second = () => 'second';

  configure(state, { movable: { getDests: first } });
  configure(state, { movable: { getDests: second } });

  assert.equal(state.movable.getDests, second);
});
