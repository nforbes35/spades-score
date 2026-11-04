// Games saved for later (on this device), shown on the home screen to pick back up.
//   online: the host's game; its table stays stored under its code, and the host starts it again from here.
//   table:  a game scored at the table, kept whole in the entry.
import { read, write } from './store.js';
import { standings } from './scoring.js';

const KEY = 'spades-saved-games';
const MAX = 20;

export const savedGames = () => { const list = read(KEY); return Array.isArray(list) ? list : []; };

/** Save (or re-save) a game: `entry` is { id, kind, code?, game?, teams, hands, target }. */
export function saveGame(entry) {
  const list = savedGames().filter((e) => e.id !== entry.id);
  write(KEY, [{ ...entry, at: Date.now() }, ...list].slice(0, MAX));
}

export function forgetSaved(id) {
  write(KEY, savedGames().filter((e) => e.id !== id));
}

/** What the saved games list shows: each team's name, players and score, hands played, target. */
export function savedSummary(game, players = game.teams.map((t) => t.players)) {
  const st = standings(game);
  return {
    teams: game.teams.map((t, i) => ({ name: t.name, players: (players[i] ?? []).filter(Boolean), score: st[i].score })),
    hands: game.hands.filter((h) => !h.inPlay).length,
    target: game.target,
  };
}
