import test from 'node:test';
import assert from 'node:assert/strict';
import { configure, defaults, destinations } from '../src/state.ts';
import * as draw from '../src/draw.ts';
import * as drag from '../src/drag.ts';
import { animate, cancelAnimation } from '../src/anim.ts';
import { attachResize } from '../src/resize.ts';
import { bindEvents } from '../src/events.ts';

class Surface extends EventTarget {
  listeners = new Map();
  style = {};
  children = [];
  classList = { add() {}, remove() {} };
  getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 800 }; }
  addEventListener(type, listener, options) {
    super.addEventListener(type, listener, options);
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }
  removeEventListener(type, listener, options) {
    super.removeEventListener(type, listener, options);
    this.listeners.get(type)?.delete(listener);
  }
  count(type) { return this.listeners.get(type)?.size ?? 0; }
}
function fixture(t) {
  const frames = new Map();
  let sequence = 0;
  t.mock.method(globalThis, 'requestAnimationFrame', (f) => { frames.set(++sequence, f); return sequence; });
  t.mock.method(globalThis, 'cancelAnimationFrame', (id) => frames.delete(id));
  const state = defaults();
  state.trustAllEvents = true;
  const board = new Surface();
  state.dom = { elements: { board, wrap: new Surface() }, bounds: () => board.getBoundingClientRect(), redraw() {}, redrawNow() {}, destroyed: false };
  return { state, frames };
}
globalThis.requestAnimationFrame ??= () => 0;
globalThis.cancelAnimationFrame ??= () => {};
globalThis.document = new Surface();
globalThis.document.body = new Surface();
globalThis.window = new Surface();
function event(type, x, y, extra = {}) {
  return Object.assign(new Event(type, { cancelable: true }), { clientX: x, clientY: y, button: 2, ...extra });
}

test('a draw released before any frame uses the release endpoint and cancels its frame', (t) => {
  const { state, frames } = fixture(t);
  draw.start(state, event('mousedown', 450, 650));
  draw.end(state, event('mouseup', 450, 450));
  assert.deepEqual(state.drawable.shapes, [{ type: 'arrow', from: 'e2', to: 'e4', brush: 'green' }]);
  assert.equal(frames.size, 0);
});

test('document gesture listeners exist only during interaction and cancellation removes them', (t) => {
  const { state, frames } = fixture(t);
  const dispose = bindEvents(state);
  assert.equal(document.count('mousemove'), 0);
  state.dom.elements.board.dispatchEvent(event('mousedown', 450, 650));
  assert.equal(document.count('mousemove'), 1);
  draw.cancel(state);
  assert.equal(document.count('mousemove'), 0);
  assert.equal(frames.size, 0);
  state.dom.elements.board.dispatchEvent(event('mousedown', 450, 650));
  dispose();
  assert.equal(document.count('mousemove'), 0);
  assert.equal(frames.size, 0);
});

test('animation cancellation removes the pending frame and supports restarting', (t) => {
  const { state, frames } = fixture(t);
  const move = (from, to) => animate((s) => { s.pieces.set(to, s.pieces.get(from)); s.pieces.delete(from); }, state);
  move('e2', 'e4');
  assert.equal(frames.size, 1);
  cancelAnimation(state);
  assert.equal(frames.size, 0);
  move('e4', 'e5');
  assert.equal(frames.size, 1);
  cancelAnimation(state);
});

test('resize disposal and lost capture remove all active resize listeners', (t) => {
  const { state } = fixture(t);
  const grip = new Surface();
  const dispose = attachResize(state, grip);
  grip.dispatchEvent(event('pointerdown', 800, 800, { button: 0, pointerId: 1 }));
  assert.equal(window.count('blur'), 1);
  grip.dispatchEvent(event('lostpointercapture', 800, 800, { pointerId: 1 }));
  assert.equal(window.count('blur'), 0);
  assert.equal(grip.count('pointermove'), 0);
  grip.dispatchEvent(event('pointerdown', 800, 800, { button: 0, pointerId: 2 }));
  dispose();
  assert.equal(window.count('blur'), 0);
  assert.equal(grip.count('pointermove'), 0);
  assert.equal(grip.count('pointerdown'), 0);
});


test('cancelling a piece drag removes its frame and global listeners', (t) => {
  const { state, frames } = fixture(t);
  state.movable.color = 'white';
  state.movable.free = true;
  const dispose = bindEvents(state);
  state.dom.elements.board.dispatchEvent(event('mousedown', 450, 650, { button: 0 }));
  assert.ok(state.draggable.current);
  assert.equal(frames.size, 1);
  assert.equal(document.count('mousemove'), 1);
  drag.cancel(state);
  assert.equal(frames.size, 0);
  assert.equal(document.count('mousemove'), 0);
  dispose();
});


test('off-board deletion invalidates cached legality and pending promotion', (t) => {
  const { state } = fixture(t);
  state.movable.color = 'white';
  state.movable.free = true;
  state.draggable.deleteOnDropOff = true;
  state.movable.getDests = () => state.pieces.has('e2') ? ['e4'] : [];
  drag.start(state, event('mousedown', 450, 650, { button: 0 }));
  assert.deepEqual(destinations(state, 'e2'), ['e4']);
  state.promotion.current = { orig: 'a7', dest: 'a8', color: 'white', version: 0 };
  drag.end(state, event('mouseup', 900, 650, { button: 0 }));
  assert.equal(state.pieces.has('e2'), false);
  assert.deepEqual(destinations(state, 'e2'), []);
  assert.equal(state.positionVersion, 1);
  assert.equal(state.promotion.current, undefined);
});


test('a position update mid-drag keeps the gesture and re-selects its origin', (t) => {
  const { state, frames } = fixture(t);
  state.movable.color = 'white';
  state.turnColor = 'black';
  const dispose = bindEvents(state);
  // e2 is premovable while black is to move.
  state.dom.elements.board.dispatchEvent(event('mousedown', 450, 650, { button: 0 }));
  assert.equal(state.draggable.current?.orig, 'e2');
  assert.equal(state.selected, 'e2');
  assert.deepEqual(state.premovable.dests, ['d3', 'e3', 'e4', 'f3'], 'premove geometry is pseudo-legal');

  // The opponent replies e7e5; white to move, with the caller's fresh dests.
  configure(state, {
    fen: 'rnbqkbnr/pppp1ppp/8/4p3/8/8/PPPPPPPP/RNBQKBNR',
    turnColor: 'white',
    movable: { dests: new Map([['e2', ['e3', 'e4']]]) },
  });
  assert.equal(state.selected, 'e2', 'configure keeps a selection whose piece can still act');
  drag.reconcile(state);
  assert.equal(state.draggable.current?.orig, 'e2', 'the drag survives the new position');
  assert.equal(state.selected, 'e2', 'the origin is re-selected for the new position');
  assert.equal(state.premovable.dests, undefined, 'no premove hints once it is our turn');
  assert.deepEqual(destinations(state, 'e2'), ['e3', 'e4']);
  assert.equal(document.count('mousemove'), 1, 'gesture listeners stay attached');
  assert.equal(frames.size, 1, 'the drag loop keeps its frame');

  // The dragged pawn is captured out from under the gesture: nothing to drop.
  configure(state, { fen: 'rnbqkbnr/pppp1ppp/8/8/8/8/PPPPqPPP/RNBQKBNR', turnColor: 'white' });
  drag.reconcile(state);
  assert.equal(state.draggable.current, undefined);
  assert.equal(state.selected, undefined);
  assert.equal(document.count('mousemove'), 0);
  assert.equal(frames.size, 0);
  dispose();
});

test('a click-selection survives the opponent move and the next click plays the move', (t) => {
  const { state } = fixture(t);
  // The game adapter's shape: both colours movable, premove targets in dests
  // during the opponent's turn, core premoves off, select wired to a cancel.
  let selects = 0;
  const afters = [];
  configure(state, {
    turnColor: 'black',
    movable: { color: 'both', dests: new Map([['e2', ['e3', 'e4']]]), events: { after: (orig, dest) => afters.push([orig, dest]) } },
    premovable: { enabled: false },
    events: { select: () => { selects++; } },
  });
  const dispose = bindEvents(state);
  const board = state.dom.elements.board;
  board.dispatchEvent(event('mousedown', 450, 650, { button: 0 }));
  drag.end(state, event('mouseup', 450, 650, { button: 0 }));
  assert.equal(state.selected, 'e2');
  assert.equal(state.draggable.current, undefined, 'a click, not a drag');

  // The opponent replies e7e5; the adapter pushes the position, then its follow-up config.
  configure(state, {
    fen: 'rnbqkbnr/pppp1ppp/8/4p3/8/8/PPPPPPPP/RNBQKBNR',
    turnColor: 'white',
    movable: { dests: new Map([['e2', ['e3', 'e4']]]) },
  });
  configure(state, { viewOnly: false, movable: { color: 'both' }, premovable: { enabled: false } });
  assert.equal(state.selected, 'e2', 'the selection made during the opponent turn is still there');
  assert.deepEqual(destinations(state, 'e2'), ['e3', 'e4']);

  board.dispatchEvent(event('mousedown', 450, 450, { button: 0 }));
  assert.equal(state.pieces.get('e4')?.role, 'pawn', 'the click on e4 moved the selected pawn');
  assert.equal(state.pieces.has('e2'), false);
  assert.equal(state.selected, undefined);
  return new Promise(resolve => queueMicrotask(() => {
    assert.deepEqual(afters, [['e2', 'e4']]);
    assert.equal(selects, 1, 'restoring the selection never fires events.select');
    dispose();
    resolve();
  }));
});

// Pointer helpers for the gesture tests below: an 800px board, white at the
// bottom, so a square is 100px and its centre is half a square in.
function center(key) {
  return [(key.charCodeAt(0) - 97 + 0.5) * 100, (7 - (Number(key[1]) - 1) + 0.5) * 100];
}
function gestures(t) {
  const { state, frames } = fixture(t);
  const board = state.dom.elements.board;
  const press = (key) => board.dispatchEvent(event('mousedown', ...center(key), { button: 0 }));
  const release = (key) => drag.end(state, event('mouseup', ...center(key), { button: 0 }));
  const moveTo = (key) => drag.move(state, event('mousemove', ...center(key), { button: 0 }));
  // processDrag runs in a frame: it marks the drag started and notes that the
  // pointer left the origin square (keyHasChanged), which end() reads.
  const runFrame = () => {
    const [id, frame] = [...frames.entries()].at(-1);
    frames.delete(id);
    frame(performance.now());
  };
  return { state, press, release, moveTo, runFrame };
}
const flush = () => new Promise((resolve) => queueMicrotask(resolve));

test('a click-move onto an empty target replaces the stored premove instead of dropping it', async (t) => {
  const { state, press, release } = gestures(t);
  const sets = [];
  let cancels = 0;
  configure(state, {
    turnColor: 'black',
    movable: { color: 'white' },
    premovable: { events: { set: (orig, dest) => sets.push(orig + dest) } },
    events: { cancel: () => { cancels++; } },
  });
  const dispose = bindEvents(state);
  press('g1'); release('g1');
  press('f3'); release('f3');
  assert.deepEqual(state.premovable.current, { from: 'g1', to: 'f3' });

  press('e2'); release('e2');
  press('e4'); release('e4');
  assert.deepEqual(
    state.premovable.current,
    { from: 'e2', to: 'e4' },
    'the press that stored the new premove landed on an empty square; it must not unset it',
  );
  await flush();
  assert.deepEqual(sets, ['g1f3', 'e2e4']);
  assert.equal(cancels, 0);
  dispose();
});

test('picking a piece up keeps the stored premove; the drop cancels or replaces it', async (t) => {
  const { state, press, release, moveTo, runFrame } = gestures(t);
  const sets = [];
  const unsets = [];
  let cancels = 0;
  configure(state, {
    turnColor: 'black',
    movable: { color: 'white' },
    premovable: { events: { set: (orig, dest) => sets.push(orig + dest), unset: () => unsets.push(true) } },
    events: { cancel: () => { cancels++; } },
  });
  const dispose = bindEvents(state);
  // A flick: release distance alone marks the drag started.
  press('g1'); release('f3');
  assert.deepEqual(state.premovable.current, { from: 'g1', to: 'f3' });

  press('b1');
  assert.equal(state.draggable.current?.orig, 'b1');
  assert.deepEqual(state.premovable.current, { from: 'g1', to: 'f3' }, 'untouched while the piece is in hand');
  moveTo('c3');
  runFrame();
  assert.equal(state.draggable.current?.keyHasChanged, true);
  assert.deepEqual(state.premovable.current, { from: 'g1', to: 'f3' }, 'still queued mid-drag');
  release('b1');
  assert.equal(state.premovable.current, undefined, 'dropped back where it was: nothing came of the gesture');
  assert.equal(state.selected, undefined);

  press('g1'); release('f3');
  press('b1'); release('c3');
  assert.deepEqual(state.premovable.current, { from: 'b1', to: 'c3' }, 'a drop on a premove target replaces it');

  press('g1'); release('g5');
  assert.equal(state.premovable.current, undefined, 'a drop on a square that is no target cancels it');

  await flush();
  assert.deepEqual(sets, ['g1f3', 'g1f3', 'b1c3']);
  assert.deepEqual(unsets, [true, true], 'the replacement is silent; the two dismissals report unset');
  assert.equal(cancels, 2, 'events.cancel mirrors exactly the dismissals');
  dispose();
});

test('a press that selects nothing ends the input and cancels; an aborted drag does not', async (t) => {
  const { state, press, release } = gestures(t);
  let cancels = 0;
  configure(state, {
    turnColor: 'black',
    movable: { color: 'white' },
    events: { cancel: () => { cancels++; } },
  });
  const dispose = bindEvents(state);
  const store = () => { press('g1'); release('f3'); };

  store();
  press('e4'); release('e4');
  assert.equal(state.premovable.current, undefined, 'a press on an empty square');
  store();
  press('e7'); release('e7');
  assert.equal(state.premovable.current, undefined, 'a press on a piece the user cannot select');

  store();
  press('b1');
  drag.cancel(state);
  assert.deepEqual(state.premovable.current, { from: 'g1', to: 'f3' }, 'blur/touchcancel mid-drag is no decision of the user');

  press('d2'); release('d2');
  assert.equal(state.selected, 'd2');
  assert.deepEqual(state.premovable.current, { from: 'g1', to: 'f3' }, 'selecting another piece keeps it');
  press('d2'); release('d2');
  assert.equal(state.selected, undefined);
  assert.equal(state.premovable.current, undefined, 'tapping the selected piece again deselects, and that settles the input too');

  await flush();
  assert.equal(cancels, 3);
  dispose();
});

test('with premoves owned by the caller, picking a piece up is silent and only a settled drop reports cancel', async (t) => {
  const { state, press, release, moveTo, runFrame } = gestures(t);
  const afters = [];
  let cancels = 0;
  let selects = 0;
  // The game page's shape: both colours movable, the caller's pseudo-legal
  // premove targets in dests during the opponent's turn, core premoves off.
  const premoveDests = new Map([
    ['e2', ['d3', 'e3', 'e4', 'f3']],
    ['g1', ['e2', 'f3', 'h3']],
    ['b1', ['a3', 'c3', 'd2']],
  ]);
  const restore = () => configure(state, { fen: 'start', turnColor: 'black', movable: { color: 'both', dests: premoveDests } });
  configure(state, {
    movable: { events: { after: (orig, dest) => afters.push(orig + dest) } },
    premovable: { enabled: false },
    events: { cancel: () => { cancels++; }, select: () => { selects++; } },
  });
  restore();
  const dispose = bindEvents(state);

  press('e2'); release('e4');
  restore();
  press('g1');
  assert.equal(cancels, 0, 'the caller keeps its premove while the knight is in hand');
  moveTo('f3');
  runFrame();
  release('f3');
  restore();
  press('b1');
  moveTo('c3');
  runFrame();
  release('b1');

  await flush();
  assert.deepEqual(afters, ['e2e4', 'g1f3'], 'each completed drop reaches the caller, which queues or replaces its premove');
  assert.equal(cancels, 1, 'only the drop back reports a cancel');
  assert.equal(selects, 3, 'select still fires on every pick-up, which is why it must not cancel');
  dispose();
});

test('a click-move completed on a movable piece (capture, castle) does not settle on release', async (t) => {
  // Game-page shape: every piece is movable, so the press on the capture
  // target also sets a drag record up; the move happens at press time and the
  // release must not report a cancel that would wipe the premove just queued.
  const capture = gestures(t);
  const afters = [];
  let cancels = 0;
  configure(capture.state, {
    fen: '4k3/3p4/8/4N3/8/8/8/4K3',
    turnColor: 'black',
    movable: { color: 'both', dests: new Map([['e5', ['d7', 'c6']]]), events: { after: (orig, dest) => afters.push(orig + dest) } },
    premovable: { enabled: false },
    events: { cancel: () => { cancels++; } },
  });
  const disposeCapture = bindEvents(capture.state);
  capture.press('e5'); capture.release('e5');
  capture.press('d7');
  assert.equal(capture.state.draggable.current, undefined, 'the press completed the move; no drag is left to judge on release');
  capture.release('d7');
  assert.deepEqual(capture.state.pieces.get('d7'), { color: 'white', role: 'knight' });
  disposeCapture();

  // The same through a plain board: king-onto-rook castling presses the rook.
  const castle = gestures(t);
  configure(castle.state, {
    fen: '4k3/8/8/8/8/8/8/4K2R',
    turnColor: 'white',
    movable: { color: 'white', dests: new Map([['e1', ['h1', 'f1']]]), events: { after: (orig, dest) => afters.push(orig + dest) } },
    events: { cancel: () => { cancels++; } },
  });
  const disposeCastle = bindEvents(castle.state);
  castle.press('e1'); castle.release('e1');
  castle.press('h1'); castle.release('h1');
  assert.deepEqual(castle.state.pieces.get('g1'), { color: 'white', role: 'king' });
  assert.deepEqual(castle.state.pieces.get('f1'), { color: 'white', role: 'rook' });
  disposeCastle();

  await flush();
  assert.deepEqual(afters, ['e5d7', 'e1h1']);
  assert.equal(cancels, 0, 'a press that played a move is not a dismissal, whatever its release looks like');
});

test('reconcile is a no-op without a drag and never fires events.select', (t) => {
  const { state } = fixture(t);
  let selects = 0;
  state.events.select = () => { selects++; };
  state.movable.color = 'white';
  drag.reconcile(state);
  assert.equal(state.selected, undefined);
  drag.start(state, event('mousedown', 450, 650, { button: 0 }));
  configure(state, { fen: 'start', turnColor: 'white' });
  drag.reconcile(state);
  assert.equal(state.selected, 'e2');
  return new Promise(resolve => queueMicrotask(() => {
    assert.equal(selects, 1, 'only the user press selected; the position update did not');
    drag.cancel(state);
    resolve();
  }));
});
