# CREEMEE CHASE

A phone-first, Burlington-flavored race game for 2–4 players. Four creemee
flavors loop a 52-square board, dodge bumps, enter their home columns, and
race to the center stand before they melt.

## Play

Open `index.html` through any static web server. There is no build step and no
package install.

- **Pass & Play:** 2–4 humans share one phone. There is no hidden information.
- **The Creemee Kid:** one human races the local bot.
- **Online:** 2–4 phones share a four-character crew code. The host chooses the
  crew size; the room starts when every seat is filled.

Roll a six to leave base and earn another roll. Tap one legal scoop to move the
exact die count. A lone rival on an unsafe square is bumped to base. Flavor
starts and stars are safe. The first flavor to finish all four scoops wins; in
larger games the race continues through the remaining podium places.

## Architecture

- `js/engine.js` contains every rule as pure functions over JSON-safe state.
- `js/bot.js` chooses only from the engine's public legal moves.
- `js/main.js` renders the game and connects the vendored room client.
- `js/rooms.js` and `scripts/rooms-shim.mjs` are unmodified fleet files.

The die uses a seeded generator stored inside game state, so saves and every
online phone remain deterministic.

## Verify

```sh
node scripts/test-engine.mjs
node scripts/test-rooms.mjs
node --check js/engine.js
node --check js/bot.js
node --check js/audio.js
node --check js/main.js
```

The site deploys through the existing GitHub Pages workflow.
