import assert from 'node:assert/strict';
import {
  FINISH_PROGRESS, SAFE_SQUARES, STARTS,
  createInitialState, legalMoves, applyMove, getStatus, trackIndex,
} from '../js/engine.js';
import { chooseMove } from '../js/bot.js';

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ok — ${name}`);
}
function rolled(state, die) { return { ...state, die }; }
function moved(state, token) { return applyMove(state, { type: 'move', token }); }

test('fresh tokens leave base only on a 6', () => {
  const state = createInitialState({ seed: 11 });
  assert.deepEqual(legalMoves(rolled(state, 5)), [{ type: 'pass' }]);
  assert.equal(moved(rolled(state, 6), 0).tokens[0][0], 0);
});

test('rolling a 6 grants another roll, including when no token can move', () => {
  let state = moved(rolled(createInitialState(), 6), 0);
  assert.equal(state.currentPlayer, 0);
  assert.deepEqual(legalMoves(state), [{ type: 'roll' }]);
  state = createInitialState();
  state.tokens[0] = Array(4).fill(FINISH_PROGRESS);
  state.placements = [];
  state = applyMove(rolled(state, 6), { type: 'pass' });
  assert.equal(state.currentPlayer, 0);
});

test('landing on one rival bumps it back to base', () => {
  let state = createInitialState();
  state.tokens[0][0] = 10;
  state.tokens[1][0] = (12 - STARTS[1] + 52) % 52;
  state = moved(rolled(state, 2), 0);
  assert.equal(state.tokens[1][0], -1);
  assert.equal(state.lastAction.captured.length, 1);
});

test('all eight safe squares protect rivals from capture', () => {
  for (const safe of SAFE_SQUARES) {
    let state = createInitialState();
    const mover = STARTS[0] === safe ? 1 : 0;
    const rival = mover === 0 ? 1 : 0;
    const targetProgress = (safe - STARTS[mover] + 52) % 52;
    state.currentPlayer = mover;
    state.tokens[mover][0] = targetProgress - 1;
    state.tokens[rival][0] = (safe - STARTS[rival] + 52) % 52;
    state = moved(rolled(state, 1), 0);
    assert.notEqual(state.tokens[rival][0], -1, `safe square ${safe}`);
  }
});

test('a rival stack is not captured and never blocks movement', () => {
  let state = createInitialState();
  state.tokens[0][0] = 9;
  state.tokens[1][0] = 49;
  state.tokens[1][1] = 49;
  state = moved(rolled(state, 1), 0);
  assert.deepEqual(state.tokens[1].slice(0, 2), [49, 49]);
  assert.equal(state.tokens[0][0], 10);
});

test('home and center require an exact count', () => {
  let state = createInitialState();
  state.tokens[0][0] = FINISH_PROGRESS - 2;
  assert.deepEqual(legalMoves(rolled(state, 3)), [{ type: 'pass' }]);
  state = moved(rolled(state, 2), 0);
  assert.equal(state.tokens[0][0], FINISH_PROGRESS);
  assert.equal(state.lastAction.finished, true);
});

test('a no-move roll passes to the next active flavor', () => {
  const state = applyMove(rolled(createInitialState(), 4), { type: 'pass' });
  assert.equal(state.currentPlayer, 1);
  assert.equal(state.die, null);
});

test('turns rotate correctly at every supported player count', () => {
  for (const numPlayers of [2, 3, 4]) {
    let state = createInitialState({ numPlayers });
    for (let expected = 1; expected <= numPlayers; expected++) {
      state = applyMove(rolled(state, 2), { type: 'pass' });
      assert.equal(state.currentPlayer, expected % numPlayers, `${numPlayers} players, turn ${expected}`);
    }
  }
});

test('first place ends a two-player game', () => {
  let state = createInitialState({ numPlayers: 2 });
  state.tokens[0] = [FINISH_PROGRESS, FINISH_PROGRESS, FINISH_PROGRESS, FINISH_PROGRESS - 1];
  state = moved(rolled(state, 1), 3);
  assert.equal(getStatus(state).over, true);
  assert.deepEqual(getStatus(state).placements, [0, 1]);
});

test('three- and four-player games continue through second and third place', () => {
  let three = createInitialState({ numPlayers: 3 });
  three.tokens[0] = [57, 57, 57, 56];
  three = moved(rolled(three, 1), 3);
  assert.equal(getStatus(three).over, false);
  three.tokens[1] = [57, 57, 57, 56];
  three.currentPlayer = 1;
  three = moved(rolled(three, 1), 3);
  assert.equal(getStatus(three).over, true);
  assert.deepEqual(getStatus(three).placements, [0, 1, 2]);

  let four = createInitialState({ numPlayers: 4 });
  for (let p = 0; p < 3; p++) {
    four.tokens[p] = [57, 57, 57, 56];
    four.currentPlayer = p;
    four = moved(rolled(four, 1), 3);
    assert.equal(getStatus(four).over, p === 2);
  }
  assert.deepEqual(getStatus(four).placements, [0, 1, 2, 3]);
});

test('completed flavors are skipped in turn rotation', () => {
  let state = createInitialState({ numPlayers: 4 });
  state.placements = [1];
  state.tokens[1] = Array(4).fill(57);
  state.currentPlayer = 0;
  state.tokens[0][0] = 0;
  state = moved(rolled(state, 2), 0);
  assert.equal(state.currentPlayer, 2);
});

test('seeded rolls and JSON resume are deterministic', () => {
  let a = createInitialState({ numPlayers: 4, seed: 8675309 });
  let b = JSON.parse(JSON.stringify(a));
  for (let i = 0; i < 120; i++) {
    const ma = legalMoves(a)[0];
    const mb = legalMoves(b)[0];
    assert.deepEqual(ma, mb);
    a = applyMove(a, ma);
    b = applyMove(b, mb);
    assert.deepEqual(a, b);
    if (getStatus(a).over) break;
  }
});

test('track mapping gives each flavor a quarter-lap offset', () => {
  assert.deepEqual(STARTS.map((_, player) => trackIndex(player, 0)), STARTS);
  assert.equal(trackIndex(3, 13), 0);
});

let soakRng = 0xc0ffee;
function pick(items) {
  soakRng = (Math.imul(soakRng, 1664525) + 1013904223) >>> 0;
  return items[soakRng % items.length];
}

test('random legal-move soak completes 200 games without an illegal state', () => {
  for (let game = 0; game < 200; game++) {
    const numPlayers = 2 + (game % 3);
    let state = createInitialState({ numPlayers, seed: 1000 + game });
    let actions = 0;
    while (!getStatus(state).over && actions < 50000) {
      const moves = legalMoves(state);
      assert.ok(moves.length > 0);
      const move = pick(moves);
      const previous = state;
      state = applyMove(state, move);
      assert.notEqual(state, previous);
      assert.equal(state.tokens.length, numPlayers);
      for (const row of state.tokens) {
        assert.equal(row.length, 4);
        for (const progress of row) assert.ok(progress >= -1 && progress <= FINISH_PROGRESS);
      }
      assert.ok(state.currentPlayer >= 0 && state.currentPlayer < numPlayers);
      actions++;
    }
    assert.ok(getStatus(state).over, `game ${game} finished within cap`);
  }
});

const speedState = rolled(createInitialState({ numPlayers: 2, seed: 5 }), 6);
const start = performance.now();
for (let i = 0; i < 10000; i++) chooseMove(speedState);
const elapsed = performance.now() - start;
console.log(`  bot — 10,000 choices in ${elapsed.toFixed(1)}ms (${(elapsed / 10000).toFixed(4)}ms each)`);
assert.ok(elapsed / 10000 < 300);

console.log(`\nALL ENGINE TESTS PASSED (${passed} checks + bot speed)`);
