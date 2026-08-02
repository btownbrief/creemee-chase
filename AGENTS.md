# Creemee Chase — agent instructions

Shared brain for any AI agent working in this repo. Read `README.md` first.
Stephen is non-technical, so explain consequential changes in plain language.

## What this is

Btown's 2–4 player Ludo-style race: four creemee flavors hurry around
Burlington to the center stand. It is a plain static site with **no build
step**: `index.html`, `style.css`, and ES modules in `js/`. GitHub Pages
deploys it. No accounts, analytics, ads, or package manager.

## The one non-negotiable

Every game rule lives in `js/engine.js` as pure functions over one plain,
JSON-serializable state object. `engine.js` imports nothing and never touches
the DOM, timers, `Date`, or `Math.random`. `applyMove` returns a new state. The
seeded die state stays inside that object so every phone replays identically.
`js/bot.js` uses only the engine's public API; `js/main.js` is UI only.

## Online play (the rooms layer)

`js/rooms.js` is the fleet's vendored room client; its canonical copy lives in
`four-in-a-rowboat` and must remain verbatim. It syncs the entire opaque engine
state through the shared Supabase room service. Host is engine player 0 and
joining phones take seats 1–3 in order. `scripts/rooms-shim.mjs` is the
unmodified local referee used by the rooms test. If the shared backend is not
ready, the UI must keep showing a friendly `not_ready` message.

## Before you finish

Run `node scripts/test-engine.mjs`, `node scripts/test-rooms.mjs`, and
`node --check` on every JavaScript file you changed. If UI changed, play at
phone size in pass-and-play and bot modes, and exercise the online setup flow.
Report exactly what was verified and anything unfinished.
