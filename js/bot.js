/* The Creemee Kid chooses only among moves supplied by the public engine API. */
import { legalMoves, describeMove } from './engine.js';

export const BOT = {
  name: 'THE CREEMEE KID',
  blurb: 'knows every shortcut before the sprinkles melt',
};

function tieBreak(state, token) {
  let value = (state.rng ^ Math.imul((token ?? 0) + 1, 0x45d9f3b)) >>> 0;
  value ^= value >>> 16;
  return (value & 1023) / 1024;
}

export function chooseMove(state) {
  const moves = legalMoves(state);
  if (!moves.length) return null;
  if (moves.length === 1) return moves[0];

  let best = moves[0];
  let bestScore = -Infinity;
  for (const move of moves) {
    const facts = describeMove(state, move);
    let score = facts.finishes ? 100000 : 0;
    score += facts.captures * 10000;
    if (facts.wasThreatened && facts.safe) score += 4000;
    else if (facts.safe) score += 500;
    score += facts.progress * 10;
    score += tieBreak(state, facts.token) * 8;
    if (score > bestScore) {
      bestScore = score;
      best = move;
    }
  }
  return best;
}
