// Offline rooms integration: the real vendored client, local room referee,
// and complete 2-, 3-, and 4-phone Creemee Chase games.
import { createRooms } from './rooms-shim.mjs';
import { createInitialState, legalMoves, applyMove, getStatus } from '../js/engine.js';

const GAME = 'creemee-chase';
const stores = new Map();
let current = 'A';
globalThis.localStorage = {
  getItem: (key) => stores.get(current)?.get(key) ?? null,
  setItem: (key, value) => stores.get(current).set(key, String(value)),
  removeItem: (key) => stores.get(current).delete(key),
};
function device(id) {
  if (!stores.has(id)) stores.set(id, new Map());
  current = id;
}
for (const id of ['A', 'B', 'C', 'D']) device(id);
device('A');

let passed = 0;
function t(condition, label) {
  if (!condition) throw new Error(`FAIL: ${label}`);
  passed++;
  console.log(`  ok — ${label}`);
}
async function expectCode(promise, code, label) {
  try {
    await promise;
    t(false, `${label} (no error)`);
  } catch (error) {
    t(error?.code === code, `${label} (got ${error?.code})`);
  }
}

let randomState = 0x8badf00d;
function randomChoice(items) {
  randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
  return items[randomState % items.length];
}

async function syncPhones(phones) {
  for (const phone of phones) {
    device(phone.device);
    await phone.match._fetch();
  }
  const truth = JSON.stringify(phones[0].match.state);
  return phones.every((phone) => JSON.stringify(phone.match.state) === truth);
}

async function playSyncedGame(phones, cap = 50000) {
  let actions = 0;
  let synced = await syncPhones(phones);
  while (!getStatus(phones[0].match.state).over && actions < cap) {
    const truth = phones[0].match.state;
    const mover = phones.find((phone) => phone.match.seat === truth.currentPlayer);
    if (!mover) throw new Error(`No phone for engine player ${truth.currentPlayer}`);
    device(mover.device);
    await mover.match._fetch();
    const move = randomChoice(legalMoves(mover.match.state));
    const next = applyMove(mover.match.state, move);
    await mover.match.push(next, { over: getStatus(next).over });
    actions++;
    synced = await syncPhones(phones);
    if (!synced) break;
  }
  return { actions, synced, finished: getStatus(phones[0].match.state).over };
}

const shim = createRooms();
let backendReady = true;
globalThis.BTOWN_ROOMS_URL = 'http://rooms.test';
globalThis.fetch = async (url, options = {}) => {
  if (!backendReady) return new Response('{}', { status: 404 });
  const match = String(url).match(/\/rest\/v1\/rpc\/(\w+)$/);
  if ((options.method || 'GET') !== 'POST' || !match || !shim.rpcs[match[1]]) {
    return new Response(JSON.stringify({ message: 'not a room rpc' }), { status: 404 });
  }
  try {
    const result = shim.rpcs[match[1]](JSON.parse(options.body || '{}')) ?? {};
    return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ message: error.message }), {
      status: error.rpc ? 400 : 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};
const { OnlineMatch, savedSession, RoomsError } = await import('../js/rooms.js');

device('A');
const host = await OnlineMatch.create({
  game: GAME, name: 'Maple A', seats: 2,
  state: createInitialState({ numPlayers: 2, seed: 101 }),
});
t(/^[A-Z2-9]{4}$/.test(host.code) && host.seat === 0 && host.status === 'waiting',
  'host creates a room in engine seat 0');
t(savedSession(GAME)?.roomId === host.roomId, 'host session is saved');

device('B');
await expectCode(OnlineMatch.join({ game: GAME, code: 'ZZZZ', name: 'X' }), 'not_found', 'bad code is rejected');
await expectCode(OnlineMatch.join({ game: 'four-in-a-rowboat', code: host.code, name: 'X' }), 'wrong_game', 'wrong game is rejected');
const guest = await OnlineMatch.join({ game: GAME, code: ` ${host.code.toLowerCase()} `, name: 'Chocolate B' });
t(guest.seat === 1 && guest.status === 'playing', 'second phone fills the room and starts it');
t(guest.opponents()[0].name === 'Maple A', 'guest sees the host name');

device('A');
await host._fetch();
t(host.status === 'playing' && host.opponents()[0].name === 'Chocolate B', 'host sees the joined name');
const stateA = applyMove(host.state, legalMoves(host.state)[0]);
await host.push(stateA);
t(host.version === 1, 'host pushes seeded engine state at version 1');

device('B');
await guest._fetch();
t(JSON.stringify(guest.state) === JSON.stringify(stateA), 'guest receives the complete state');
const stateB = applyMove(guest.state, legalMoves(guest.state)[0]);
await guest.push(stateB);
t(guest.version === 2, 'guest pushes the next engine action');

device('A');
await expectCode(host.push(applyMove(stateA, legalMoves(stateA)[0])), 'version_conflict', 'stale push is rejected');
t(host.version === 2 && JSON.stringify(host.state) === JSON.stringify(guest.state), 'conflict refetches room truth');
t(new RoomsError('offline').code === 'offline', 'rooms errors keep stable codes');

const twoPhone = await playSyncedGame([{ device: 'A', match: host }, { device: 'B', match: guest }]);
t(twoPhone.synced && twoPhone.finished, `two phones finish identically in ${twoPhone.actions} more actions`);
t(host.status === 'over', 'room status follows engine game over');

device('B');
const rematchVersion = guest.version;
await guest.push(createInitialState({ numPlayers: 2, seed: 202 }));
t(guest.status === 'playing' && guest.version === rematchVersion + 1, 'finished room accepts a fresh rematch');
device('A');
const resumed = await OnlineMatch.resume({ game: GAME });
t(resumed.roomId === host.roomId && resumed.seat === 0, 'resume restores the same engine seat');
await resumed.leave();
t(savedSession(GAME) === null, 'leave clears the room session');

device('A');
const full = await OnlineMatch.create({ game: GAME, name: 'A', seats: 2, state: createInitialState() });
device('B');
await OnlineMatch.join({ game: GAME, code: full.code, name: 'B' });
device('C');
await expectCode(OnlineMatch.join({ game: GAME, code: full.code, name: 'C' }), 'room_started', 'extra phone cannot join a started room');

async function createCrew(size, gameSeed) {
  const phones = [];
  device('A');
  const crewHost = await OnlineMatch.create({
    game: GAME, name: 'Maple', seats: size,
    state: createInitialState({ numPlayers: size, seed: gameSeed }),
  });
  phones.push({ device: 'A', match: crewHost });
  for (let seat = 1; seat < size; seat++) {
    const id = String.fromCharCode(65 + seat);
    device(id);
    const match = await OnlineMatch.join({ game: GAME, code: crewHost.code, name: `Scoop ${seat + 1}` });
    phones.push({ device: id, match });
    t(match.seat === seat && match.status === (seat === size - 1 ? 'playing' : 'waiting'),
      `phone ${seat + 1} takes engine seat ${seat}`);
  }
  return phones;
}

const threePhones = await createCrew(3, 303);
const threeGame = await playSyncedGame(threePhones);
t(threeGame.synced && threeGame.finished, `three phones finish identically in ${threeGame.actions} actions`);
t(getStatus(threePhones[0].match.state).placements.length === 3, 'three-player ranking includes every flavor');

const fourPhones = await createCrew(4, 404);
const fourGame = await playSyncedGame(fourPhones);
t(fourGame.synced && fourGame.finished, `four phones finish identically in ${fourGame.actions} actions`);
t(getStatus(fourPhones[0].match.state).placements.length === 4, 'four-player ranking includes every flavor');

backendReady = false;
const unavailable = await import('../js/rooms.js?not-ready');
device('D');
await expectCode(unavailable.OnlineMatch.create({ game: GAME, name: 'A', state: {} }), 'not_ready', 'missing backend reports not_ready');

console.log(`\nALL ROOMS TESTS PASSED (${passed} checks)`);
