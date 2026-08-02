/* CREEMEE CHASE — pure Ludo-style race engine.
 *
 * All rules operate on one plain JSON-serializable object. There is no DOM,
 * clock, or Math.random here. The d6 advances the seeded RNG stored in state,
 * which lets every phone replay the exact same game.
 *
 * Token progress:
 *   -1       in base
 *    0..51   on that flavor's lap of the shared 52-square track
 *   52..56   in that flavor's five-square home column
 *   57       in the center stand (finished)
 */

export const PLAYER_COUNT_MIN = 2;
export const PLAYER_COUNT_MAX = 4;
export const TOKENS_PER_PLAYER = 4;
export const TRACK_LENGTH = 52;
export const HOME_LENGTH = 5;
export const FINISH_PROGRESS = TRACK_LENGTH + HOME_LENGTH;
export const STARTS = [0, 13, 26, 39];
export const SAFE_SQUARES = [0, 8, 13, 21, 26, 34, 39, 47];

function rngNext(seed) {
  const next = (seed + 0x6d2b79f5) | 0;
  let value = Math.imul(next ^ (next >>> 15), 1 | next);
  value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
  return { rng: next, value: (value ^ (value >>> 14)) >>> 0 };
}

export function trackIndex(player, progress) {
  if (progress < 0 || progress >= TRACK_LENGTH) return null;
  return (STARTS[player] + progress) % TRACK_LENGTH;
}

export function isSafeSquare(index) {
  return SAFE_SQUARES.includes(index);
}

export function createInitialState(options = {}) {
  const numPlayers = options.numPlayers ?? 2;
  if (!Number.isInteger(numPlayers) || numPlayers < PLAYER_COUNT_MIN || numPlayers > PLAYER_COUNT_MAX) {
    throw new Error('numPlayers must be 2, 3, or 4');
  }
  const seed = (options.seed ?? 1) | 0;
  return {
    version: 1,
    seed,
    rng: seed,
    numPlayers,
    currentPlayer: 0,
    die: null,
    tokens: Array.from({ length: numPlayers }, () => Array(TOKENS_PER_PLAYER).fill(-1)),
    placements: [],
    turnNumber: 1,
    lastAction: null,
  };
}

export function getStatus(state) {
  const over = state.placements.length >= state.numPlayers - 1;
  const remaining = [];
  if (over) {
    for (let player = 0; player < state.numPlayers; player++) {
      if (!state.placements.includes(player)) remaining.push(player);
    }
  }
  const ranking = over ? state.placements.concat(remaining) : state.placements.slice();
  return {
    status: over ? 'over' : 'active',
    over,
    winner: state.placements[0] ?? null,
    placements: ranking,
  };
}

function tokenCanMove(progress, die) {
  if (progress === -1) return die === 6;
  return progress >= 0 && progress < FINISH_PROGRESS && progress + die <= FINISH_PROGRESS;
}

export function legalMoves(state) {
  if (getStatus(state).over) return [];
  if (state.die === null) return [{ type: 'roll' }];

  const moves = [];
  state.tokens[state.currentPlayer].forEach((progress, token) => {
    if (tokenCanMove(progress, state.die)) moves.push({ type: 'move', token });
  });
  return moves.length ? moves : [{ type: 'pass' }];
}

function sameMove(a, b) {
  return a.type === b.type && a.token === b.token;
}

function nextActivePlayer(state, from, placements) {
  for (let step = 1; step <= state.numPlayers; step++) {
    const candidate = (from + step) % state.numPlayers;
    if (!placements.includes(candidate)) return candidate;
  }
  return from;
}

function applyRoll(state) {
  const random = rngNext(state.rng);
  const die = (random.value % 6) + 1;
  return {
    ...state,
    rng: random.rng,
    die,
    lastAction: { type: 'roll', player: state.currentPlayer, roll: die },
  };
}

function applyTokenMove(state, move) {
  const player = state.currentPlayer;
  const roll = state.die;
  const from = state.tokens[player][move.token];
  const to = from === -1 ? 0 : from + roll;
  const tokens = state.tokens.map((row) => row.slice());
  tokens[player][move.token] = to;

  const captured = [];
  if (to < TRACK_LENGTH) {
    const destination = trackIndex(player, to);
    if (!isSafeSquare(destination)) {
      const opponents = [];
      for (let rival = 0; rival < state.numPlayers; rival++) {
        if (rival === player) continue;
        tokens[rival].forEach((progress, token) => {
          if (trackIndex(rival, progress) === destination) opponents.push({ player: rival, token });
        });
      }
      if (opponents.length === 1) {
        const bumped = opponents[0];
        tokens[bumped.player][bumped.token] = -1;
        captured.push(bumped);
      }
    }
  }

  const finished = to === FINISH_PROGRESS;
  let placements = state.placements.slice();
  let placed = null;
  if (tokens[player].every((progress) => progress === FINISH_PROGRESS) && !placements.includes(player)) {
    placements = placements.concat(player);
    placed = placements.length;
  }

  const over = placements.length >= state.numPlayers - 1;
  const extraRoll = roll === 6 && placed === null && !over;
  const currentPlayer = extraRoll ? player : nextActivePlayer(state, player, placements);

  return {
    ...state,
    tokens,
    placements,
    currentPlayer,
    die: null,
    turnNumber: state.turnNumber + (extraRoll ? 0 : 1),
    lastAction: {
      type: 'move', player, token: move.token, roll, from, to,
      captured, finished, placed, extraRoll,
    },
  };
}

function applyPass(state) {
  const player = state.currentPlayer;
  const roll = state.die;
  const extraRoll = roll === 6;
  return {
    ...state,
    currentPlayer: extraRoll ? player : nextActivePlayer(state, player, state.placements),
    die: null,
    turnNumber: state.turnNumber + (extraRoll ? 0 : 1),
    lastAction: { type: 'pass', player, roll, extraRoll },
  };
}

export function applyMove(state, move) {
  const legal = legalMoves(state);
  if (!legal.some((candidate) => sameMove(candidate, move))) {
    throw new Error('Illegal move: ' + JSON.stringify(move));
  }
  if (move.type === 'roll') return applyRoll(state);
  if (move.type === 'move') return applyTokenMove(state, move);
  return applyPass(state);
}

/* Public, read-only move facts for bots and UI hints. Keeping this analysis
 * here prevents either caller from re-implementing rules. */
export function describeMove(state, move) {
  if (move.type !== 'move') return { type: move.type };
  const before = state.tokens[state.currentPlayer][move.token];
  const next = applyMove(state, move);
  const action = next.lastAction;
  const destination = action.to < TRACK_LENGTH
    ? trackIndex(state.currentPlayer, action.to)
    : null;
  return {
    type: 'move',
    token: move.token,
    from: before,
    to: action.to,
    leavesBase: before === -1,
    finishes: action.finished,
    captures: action.captured.length,
    safe: destination !== null && isSafeSquare(destination),
    wasThreatened: isTokenThreatened(state, state.currentPlayer, move.token),
    progress: action.to,
  };
}

export function isTokenThreatened(state, player, token) {
  const progress = state.tokens[player]?.[token];
  const index = trackIndex(player, progress);
  if (index === null || isSafeSquare(index)) return false;

  for (let rival = 0; rival < state.numPlayers; rival++) {
    if (rival === player || state.placements.includes(rival)) continue;
    for (const rivalProgress of state.tokens[rival]) {
      if (rivalProgress < 0 || rivalProgress >= TRACK_LENGTH) continue;
      const distance = (index - trackIndex(rival, rivalProgress) + TRACK_LENGTH) % TRACK_LENGTH;
      if (distance >= 1 && distance <= 6 && rivalProgress + distance < TRACK_LENGTH) return true;
    }
  }
  return false;
}
