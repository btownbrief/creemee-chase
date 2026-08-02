// CREEMEE CHASE UI. Rules stay in engine.js; online rooms only ferry state.
import {
  FINISH_PROGRESS, TRACK_LENGTH, SAFE_SQUARES, STARTS, createInitialState, legalMoves,
  applyMove, getStatus, trackIndex,
} from './engine.js';
import { chooseMove } from './bot.js';
import { OnlineMatch, savedSession, clearSession, getName } from './rooms.js';
import { sound } from './audio.js';

const $ = (id) => document.getElementById(id);
const GAME = 'creemee-chase';
const FLAVORS = ['MAPLE', 'CHOCOLATE', 'VANILLA', 'RASPBERRY'];
const ICONS = ['🍁', '🍫', '🥛', '🫐'];
const ORDINALS = ['1ST', '2ND', '3RD', '4TH'];
const DIE = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

// The clockwise 52-square path on the 15 × 15 visual grid.
const TRACK = [
  [6,1],[6,2],[6,3],[6,4],[6,5],[5,6],[4,6],[3,6],[2,6],[1,6],[0,6],[0,7],[0,8],
  [1,8],[2,8],[3,8],[4,8],[5,8],[6,9],[6,10],[6,11],[6,12],[6,13],[6,14],[7,14],[8,14],
  [8,13],[8,12],[8,11],[8,10],[8,9],[9,8],[10,8],[11,8],[12,8],[13,8],[14,8],[14,7],[14,6],
  [13,6],[12,6],[11,6],[10,6],[9,6],[8,5],[8,4],[8,3],[8,2],[8,1],[8,0],[7,0],[6,0],
];
const HOMES = [
  [[7,1],[7,2],[7,3],[7,4],[7,5]],
  [[1,7],[2,7],[3,7],[4,7],[5,7]],
  [[7,13],[7,12],[7,11],[7,10],[7,9]],
  [[13,7],[12,7],[11,7],[10,7],[9,7]],
];
const BASES = [
  [[2,2],[2,4],[4,2],[4,4]], [[2,10],[2,12],[4,10],[4,12]],
  [[10,10],[10,12],[12,10],[12,12]], [[10,2],[10,4],[12,2],[12,4]],
];

let mode = 'pass';
let state = createInitialState();
let passPlayers = 2;
let selectedSeats = 2;
let online = null;
let panelIntent = 'host';
let busy = false;
let botTimer = 0;
let leaveTimer = 0;
let pollErrors = 0;

function seed() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] | 0;
}

function setScreen(showGame) {
  $('menu').classList.toggle('hidden', showGame);
  $('game').classList.toggle('hidden', !showGame);
}

function playerName(player) {
  if (mode === 'bot' && player === 1) return 'THE CREEMEE KID';
  if (mode === 'online' && online) {
    const seat = online.match.seats.find((item) => item.seat === player);
    if (seat?.name) return seat.name;
  }
  return FLAVORS[player];
}

function newLocal(chosen, numPlayers) {
  clearTimeout(botTimer);
  online?.match.stop();
  online = null;
  mode = chosen;
  state = createInitialState({ numPlayers, seed: seed() });
  busy = false;
  setScreen(true);
  $('roomChip').classList.add('hidden');
  $('result').classList.add('hidden');
  $('result').dataset.sung = '';
  render();
}

document.querySelectorAll('.pass-count').forEach((button) => {
  button.addEventListener('click', () => {
    passPlayers = Number(button.dataset.count);
    document.querySelectorAll('.pass-count').forEach((choice) => {
      const selected = choice === button;
      choice.classList.toggle('selected', selected);
      choice.setAttribute('aria-pressed', String(selected));
    });
  });
});
$('passStart').addEventListener('click', () => newLocal('pass', passPlayers));
$('botStart').addEventListener('click', () => newLocal('bot', 2));

function canAct() {
  if (busy || getStatus(state).over) return false;
  if (mode === 'pass') return true;
  if (mode === 'bot') return state.currentPlayer === 0;
  return !!online && online.match.status === 'playing' && state.currentPlayer === online.myPlayer;
}

function tokenPosition(player, token, progress) {
  if (progress === -1) return BASES[player][token];
  if (progress < TRACK_LENGTH) return TRACK[trackIndex(player, progress)];
  if (progress < FINISH_PROGRESS) return HOMES[player][progress - TRACK_LENGTH];
  return [7, 7];
}

function renderBoard(moves) {
  const legalTokens = new Set(moves.filter((move) => move.type === 'move').map((move) => move.token));
  const container = $('tokens');
  container.innerHTML = '';
  state.tokens.forEach((row, player) => row.forEach((progress, token) => {
    const [r, c] = tokenPosition(player, token, progress);
    const button = document.createElement('button');
    button.className = `token flavor-${player}`;
    if (progress === FINISH_PROGRESS) button.classList.add('finished');
    button.style.setProperty('--row', r + 1);
    button.style.setProperty('--col', c + 1);
    button.style.setProperty('--stack', token);
    button.setAttribute('aria-label', `${playerName(player)} scoop ${token + 1}`);
    const selectable = canAct() && player === state.currentPlayer && legalTokens.has(token);
    button.disabled = !selectable;
    if (selectable) {
      button.classList.add('selectable');
      button.addEventListener('click', () => commit({ type: 'move', token }));
    }
    container.appendChild(button);
  }));
}

function renderScoreboard() {
  const board = $('scoreboard');
  board.innerHTML = '';
  for (let player = 0; player < state.numPlayers; player++) {
    const chip = document.createElement('div');
    chip.className = `player-chip flavor-bg-${player}`;
    if (state.currentPlayer === player && !getStatus(state).over) chip.classList.add('active');
    if (mode === 'online' && online?.myPlayer === player) chip.classList.add('mine');
    const label = document.createElement('span');
    label.className = 'player-label';
    label.textContent = `${ICONS[player]} ${playerName(player)}`;
    const count = document.createElement('b');
    count.textContent = `${state.tokens[player].filter((value) => value === FINISH_PROGRESS).length}/4`;
    chip.append(label, count);
    board.appendChild(chip);
  }
}

function actionCopy(moves) {
  const name = playerName(state.currentPlayer);
  if (!canAct()) {
    if (mode === 'online') return `${name} is choosing a scoop…`;
    if (mode === 'bot') return 'The Creemee Kid is sizing up the route…';
  }
  if (state.die === null) return `${name}, give the die a shake.`;
  if (moves[0]?.type === 'pass') return `No legal move on ${state.die}. The sun waits for no scoop.`;
  return `Rolled ${state.die}! Tap a glowing scoop.`;
}

function render() {
  const moves = legalMoves(state);
  const status = getStatus(state);
  renderScoreboard();
  renderBoard(moves);

  const name = playerName(state.currentPlayer);
  $('turnBanner').textContent = status.over ? 'THE LAST SCOOP IS IN!' : `${ICONS[state.currentPlayer]} ${name}'S TURN`;
  $('turnBanner').className = `turn-flavor-${state.currentPlayer}`;
  $('dieFace').textContent = state.die ? DIE[state.die - 1] : '⚄';
  $('rollLabel').textContent = state.die ? `ROLLED ${state.die}` : 'ROLL THE DICE';

  const rollLegal = moves.some((move) => move.type === 'roll');
  const passLegal = moves.some((move) => move.type === 'pass');
  $('rollBtn').disabled = !canAct() || !rollLegal;
  $('rollBtn').classList.toggle('rolled', state.die !== null);
  $('passBtn').classList.toggle('hidden', !passLegal || !canAct());
  $('actionHint').textContent = actionCopy(moves);
  $('actionPanel').classList.toggle('waiting', !canAct());

  if (status.over) showResult(status);
  else $('result').classList.add('hidden');
}

async function commit(move) {
  if (busy || !legalMoves(state).some((candidate) => candidate.type === move.type && candidate.token === move.token)) return;
  busy = true;
  const previous = state;
  const next = applyMove(state, move);
  state = next;

  if (next.lastAction.type === 'roll') sound.roll(next.lastAction.roll);
  else if (next.lastAction.captured?.length) sound.bump();
  else if (next.lastAction.finished) sound.finish();
  else if (next.lastAction.type === 'move') sound.move();
  render();

  if (mode === 'online' && online) {
    try {
      await online.match.push(next, { over: getStatus(next).over });
    } catch (error) {
      if (error?.code === 'version_conflict') state = online.match.state;
      else showToast(friendly(error));
      render();
    }
  }

  const delay = move.type === 'roll' ? 380 : 260;
  setTimeout(() => {
    busy = false;
    render();
    maybeBot();
  }, delay);

  // Keep the previous binding deliberate: it makes animation diffing easy to
  // add without putting game logic in the UI.
  void previous;
}

$('rollBtn').addEventListener('click', () => commit({ type: 'roll' }));
$('passBtn').addEventListener('click', () => commit({ type: 'pass' }));

function maybeBot() {
  clearTimeout(botTimer);
  if (mode !== 'bot' || busy || getStatus(state).over || state.currentPlayer !== 1) return;
  botTimer = setTimeout(() => {
    const move = chooseMove(state);
    if (move) commit(move);
  }, state.die === null ? 550 : 700);
}

function showResult(status) {
  $('rankings').innerHTML = '';
  status.placements.forEach((player, place) => {
    const item = document.createElement('li');
    const rank = document.createElement('b');
    rank.textContent = ORDINALS[place];
    const name = document.createElement('span');
    name.textContent = `${ICONS[player]} ${playerName(player)}`;
    item.className = `rank-flavor-${player}`;
    item.append(rank, name);
    $('rankings').appendChild(item);
  });
  const winner = status.winner;
  $('resultTitle').textContent = mode === 'online' && winner === online?.myPlayer
    ? 'YOU BEAT THE MELT!'
    : `${playerName(winner)} WINS!`;
  $('result').classList.remove('hidden');
  if (!$('result').dataset.sung) {
    sound.win();
    $('result').dataset.sung = '1';
  }
}

$('rematchBtn').addEventListener('click', async () => {
  $('result').dataset.sung = '';
  if (mode !== 'online') return newLocal(mode, state.numPlayers);
  if (!online) return;
  const fresh = createInitialState({ numPlayers: state.numPlayers, seed: (state.rng ^ online.match.version ^ 0x51c00f) | 0 });
  busy = true;
  try {
    await online.match.push(fresh);
    state = fresh;
  } catch {
    state = online.match.state;
  }
  busy = false;
  render();
});

function returnHome() {
  clearTimeout(botTimer);
  if (online) {
    if (!getStatus(state).over && $('homeBtn').dataset.armed !== '1') {
      $('homeBtn').dataset.armed = '1';
      $('homeBtn').textContent = 'LEAVE CREW?';
      leaveTimer = setTimeout(resetLeave, 2500);
      return;
    }
    online.match.leave();
    online = null;
  }
  resetLeave();
  setScreen(false);
  refreshRejoin();
}
function resetLeave() {
  clearTimeout(leaveTimer);
  $('homeBtn').dataset.armed = '';
  $('homeBtn').textContent = '← STAND';
}
$('homeBtn').addEventListener('click', returnHome);
$('resultHomeBtn').addEventListener('click', returnHome);
$('muteBtn').addEventListener('click', () => {
  $('muteBtn').textContent = sound.toggle() ? '🔇' : '🔊';
});
$('muteBtn').textContent = sound.muted ? '🔇' : '🔊';

/* ------------------------------------------------------------- board setup */
TRACK.forEach(([row, col], index) => {
  const cell = document.createElement('div');
  cell.className = 'track-cell';
  if (SAFE_SQUARES.includes(index)) cell.classList.add('safe');
  const start = STARTS.indexOf(index);
  if (start >= 0) cell.classList.add(`start-${start}`);
  cell.style.setProperty('--row', row + 1);
  cell.style.setProperty('--col', col + 1);
  cell.textContent = cell.classList.contains('safe') ? '★' : '';
  $('trackCells').appendChild(cell);
});
HOMES.forEach((column, player) => column.forEach(([row, col]) => {
  const cell = document.createElement('div');
  cell.className = `home-cell home-${player}`;
  cell.style.setProperty('--row', row + 1);
  cell.style.setProperty('--col', col + 1);
  $('homeCells').appendChild(cell);
}));

/* ------------------------------------------------------------- online play */
$('hostBtn').addEventListener('click', () => openPanel('host'));
$('joinBtn').addEventListener('click', () => openPanel('join'));
$('opCancel').addEventListener('click', () => $('onlinePanel').classList.add('hidden'));
$('opGo').addEventListener('click', onlineGo);
$('lobbyCancel').addEventListener('click', cancelLobby);
$('rejoinBtn').addEventListener('click', rejoinCrew);
$('opCode').addEventListener('input', () => {
  $('opCode').value = $('opCode').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
});
[$('opName'), $('opCode')].forEach((input) => input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') onlineGo();
}));
document.querySelectorAll('.seat-btn').forEach((button) => {
  button.addEventListener('click', () => {
    selectedSeats = Number(button.dataset.seats);
    document.querySelectorAll('.seat-btn').forEach((choice) => {
      const selected = choice === button;
      choice.classList.toggle('selected', selected);
      choice.setAttribute('aria-pressed', String(selected));
    });
  });
});

function openPanel(intent) {
  panelIntent = intent;
  $('opTitle').textContent = intent === 'host' ? 'START A CREW' : 'JOIN A CREW';
  $('opGo').textContent = intent === 'host' ? 'GET A CODE' : 'JOIN THE CHASE';
  $('opSeatsWrap').classList.toggle('hidden', intent !== 'host');
  $('opCodeWrap').classList.toggle('hidden', intent === 'host');
  $('opError').classList.add('hidden');
  $('opName').value ||= getName();
  $('onlinePanel').classList.remove('hidden');
  (intent === 'join' && $('opName').value ? $('opCode') : $('opName')).focus();
}

const FRIENDLY = {
  not_found: 'No crew with that code — check the letters.',
  room_full: 'That creemee stand is already full.',
  room_started: 'That crew already started racing.',
  not_ready: "Online play isn't switched on yet — check back soon!",
  offline: "Can't reach the stand — are you online?",
  opponent_left: 'A crew member left the race.',
};
function friendly(error) {
  if (error?.code === 'wrong_game') return `That code belongs to ${String(error.detail || 'another game').replaceAll('-', ' ')}.`;
  return FRIENDLY[error?.code] || 'The sprinkles went sideways — try again.';
}

async function onlineGo() {
  const go = $('opGo');
  if (go.disabled) return;
  const name = $('opName').value.trim();
  if (!name) return panelError('Every scoop needs a name.', $('opName'));
  go.disabled = true;
  $('opError').classList.add('hidden');
  try {
    let match;
    if (panelIntent === 'host') {
      match = await OnlineMatch.create({
        game: GAME, name, seats: selectedSeats,
        state: createInitialState({ numPlayers: selectedSeats, seed: seed() }),
      });
    } else {
      const code = $('opCode').value.trim();
      if (code.length !== 4) return panelError('Crew codes have 4 characters.', $('opCode'));
      match = await OnlineMatch.join({ game: GAME, code, name });
    }
    $('onlinePanel').classList.add('hidden');
    if (match.status === 'waiting') openLobby(match);
    else enterOnline(match);
  } catch (error) {
    panelError(friendly(error));
  } finally {
    go.disabled = false;
  }
}
function panelError(message, focus) {
  $('opError').textContent = message;
  $('opError').classList.remove('hidden');
  focus?.focus();
}

function renderLobby(match) {
  $('lobbyCode').textContent = match.code;
  $('lobbyNames').innerHTML = '';
  const total = match.state?.numPlayers || selectedSeats;
  for (let seat = 0; seat < total; seat++) {
    const joined = match.seats.find((item) => item.seat === seat);
    const row = document.createElement('li');
    row.textContent = joined ? `${ICONS[seat]} ${joined.name}` : `○ Waiting for scoop ${seat + 1}…`;
    $('lobbyNames').appendChild(row);
  }
}
function openLobby(match) {
  if ($('lobby')._match && $('lobby')._match !== match) $('lobby')._match.stop();
  $('lobby')._match = match;
  $('lobby').classList.remove('hidden');
  renderLobby(match);
  match.start({
    onStatus: (status) => {
      if (status === 'playing') {
        $('lobby').classList.add('hidden');
        enterOnline(match);
      } else if (status === 'over') {
        $('lobbyHint').textContent = 'A scoop wandered off. Make a new crew.';
      }
    },
    onPresence: () => renderLobby(match),
    onError: () => {},
  });
}
function cancelLobby() {
  const match = $('lobby')._match;
  if (match) match.leave();
  $('lobby')._match = null;
  $('lobby').classList.add('hidden');
  refreshRejoin();
}

async function rejoinCrew() {
  $('rejoinBtn').disabled = true;
  try {
    const match = await OnlineMatch.resume({ game: GAME });
    if (match.status === 'waiting') openLobby(match);
    else enterOnline(match);
  } catch (error) {
    if (['not_found', 'not_seated', 'room_started'].includes(error?.code)) clearSession(GAME);
    refreshRejoin();
  } finally {
    $('rejoinBtn').disabled = false;
  }
}
function refreshRejoin() {
  const saved = savedSession(GAME);
  $('rejoinBtn').classList.toggle('hidden', !saved);
  if (saved) $('rejoinBtn').textContent = `↩ REJOIN YOUR CREW (${saved.code})`;
}

function enterOnline(match) {
  clearTimeout(botTimer);
  mode = 'online';
  online = { match, myPlayer: match.seat };
  state = match.state;
  busy = false;
  pollErrors = 0;
  $('lobby').classList.add('hidden');
  $('onlinePanel').classList.add('hidden');
  $('roomChip').textContent = `CREW ${match.code} · YOU'RE ${FLAVORS[match.seat]}`;
  $('roomChip').classList.remove('hidden');
  $('result').dataset.sung = '';
  setScreen(true);
  render();
  match.start({
    onState: (newState) => {
      state = newState;
      busy = false;
      render();
    },
    onStatus: (status) => {
      if (status === 'over' && !getStatus(state).over) showToast('A crew member left the race.');
    },
    onPresence: (opponents) => {
      pollErrors = 0;
      const left = opponents.find((player) => player.left);
      if (left && !getStatus(state).over) showToast(`${left.name} left the race.`);
    },
    onError: (error) => {
      pollErrors++;
      if (pollErrors === 2) showToast(friendly(error));
    },
  });
}

function showToast(message) {
  $('actionHint').textContent = message;
  $('actionHint').classList.add('alert');
  setTimeout(() => $('actionHint').classList.remove('alert'), 2400);
}

refreshRejoin();
render();
