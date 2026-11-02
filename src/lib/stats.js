// Player stats from the games this device has seen. Every finished game (online or at the table) is
// kept in a log; phones in the same game swap logs (see useStatsSync), so everyone's stats fill in.
// People are matched by name, ignoring case and spacing. Computer players are kept as partners and
// opponents but aren't ranked.
import { useEffect, useRef } from 'react';
import { history, winner, scoreTeam } from './scoring.js';
import { read, write } from './store.js';

const LOG_KEY = 'spades-game-log';
const MAX_GAMES = 500;

export const nameKey = (name) => String(name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

/** A game reduced to what stats need: who played, and each hand's bids and books. */
export function toRecord(game, { mode, bots = [] } = {}) {
  const done = game.hands.filter((h) => !h.inPlay);
  const w = winner({ ...game, hands: done });
  return {
    id: game.id,
    mode,
    finished: w != null,
    winner: w,
    finishedAt: Date.now(),
    target: game.target,
    rules: game.rules,
    teams: game.teams.map((t) => ({ name: t.name, players: [...t.players] })),
    bots: bots.map(nameKey),
    hands: done.map((h) => ({
      id: h.id,
      inPlay: false,
      teams: h.teams.map((tr) => ({ players: tr.players.map((p) => ({ bid: p.bid, books: p.books, call: p.call })) })),
    })),
  };
}

export function loadLog() {
  const log = read(LOG_KEY);
  return Array.isArray(log) ? log : [];
}

/** Add or update games (by id). A finished copy of a game beats an unfinished one. */
export function mergeIntoLog(log, games) {
  const byId = new Map(log.map((g) => [g.id, g]));
  let changed = false;
  for (const g of games) {
    if (!g?.id || !Array.isArray(g.hands) || !g.hands.length) continue;
    const old = byId.get(g.id);
    if (!old || (!old.finished && g.finished) || (old.finished === g.finished && g.hands.length > old.hands.length)) {
      byId.set(g.id, old ? { ...g, finishedAt: old.finishedAt } : g);
      changed = true;
    }
  }
  if (!changed) return log;
  return [...byId.values()].sort((a, b) => a.finishedAt - b.finishedAt).slice(-MAX_GAMES);
}

export function saveGames(games) {
  const log = loadLog();
  const next = mergeIntoLog(log, games);
  if (next !== log) write(LOG_KEY, next);
  return next;
}

export const recordGame = (game, meta) => (game?.hands.some((h) => !h.inPlay) ? saveGames([toRecord(game, meta)]) : loadLog());

export function forgetGame(id) {
  write(LOG_KEY, loadLog().filter((g) => g.id !== id));
}

const blank = (name) => ({
  name, key: nameKey(name), bot: false,
  games: 0, wins: 0, losses: 0, unfinished: 0,
  hands: 0, books: 0, bidTotal: 0, bidHands: 0,
  ownBidMade: 0, teamMade: 0, teamSet: 0, bigBids: 0, bigBidsMade: 0,
  nil: 0, nilMade: 0, blind: 0, blindMade: 0,
  bestScore: null, streak: 0, longestStreak: 0, lastResults: [],
  partners: {}, opponents: {},
});

const pct = (a, b) => (b ? Math.round((100 * a) / b) : null);

/** Everyone's stats from a game log. Returns players sorted for the leaderboard. */
export function computeStats(log) {
  const players = new Map();
  const get = (name) => {
    const k = nameKey(name);
    if (!players.has(k)) players.set(k, blank(String(name).trim()));
    const p = players.get(k);
    p.name = String(name).trim(); // the latest spelling wins
    return p;
  };

  for (const rec of [...log].sort((a, b) => a.finishedAt - b.finishedAt)) {
    const bots = new Set(rec.bots ?? []);
    const hist = history(rec);
    const final = hist[hist.length - 1];
    rec.teams.forEach((team, t) => {
      team.players.forEach((name, pi) => {
        const p = get(name);
        if (bots.has(p.key)) p.bot = true;
        const partnerName = team.players[1 - pi];
        const partner = (p.partners[nameKey(partnerName)] ??= { name: partnerName, games: 0, wins: 0, bot: bots.has(nameKey(partnerName)) });
        if (rec.finished) {
          p.games += 1;
          partner.games += 1;
          const won = rec.winner === t;
          if (won) { p.wins += 1; partner.wins += 1; } else p.losses += 1;
          p.lastResults.push(won ? 'W' : 'L');
          p.streak = won ? (p.streak > 0 ? p.streak + 1 : 1) : (p.streak < 0 ? p.streak - 1 : -1);
          p.longestStreak = Math.max(p.longestStreak, p.streak);
          for (const opp of rec.teams[1 - t].players) {
            const o = (p.opponents[nameKey(opp)] ??= { name: opp, games: 0, wins: 0, bot: bots.has(nameKey(opp)) });
            o.games += 1;
            if (won) o.wins += 1;
          }
          if (final) p.bestScore = Math.max(p.bestScore ?? -Infinity, final[t].score);
        } else {
          p.unfinished += 1;
        }
        for (const hand of rec.hands) {
          const e = hand.teams[t].players[pi];
          p.hands += 1;
          p.books += e.books;
          if (e.call === 'nil') { p.nil += 1; if (e.books === 0) p.nilMade += 1; }
          else if (e.call === 'blind') { p.blind += 1; if (e.books === 0) p.blindMade += 1; }
          else {
            p.bidHands += 1;
            p.bidTotal += e.bid;
            if (e.books >= e.bid) p.ownBidMade += 1;
          }
          const result = scoreTeam(hand.teams[t], rec.rules);
          if (result.madeBid === true) p.teamMade += 1;
          if (result.madeBid === false) p.teamSet += 1;
          // A team's 10+ bid counts for both partners.
          if (result.contractBid >= (rec.rules?.bigBidThreshold ?? 10)) {
            p.bigBids += 1;
            if (result.madeBid) p.bigBidsMade += 1;
          }
        }
      });
    });
  }

  const list = [...players.values()].map((p) => {
    const partners = Object.values(p.partners).sort((a, b) => b.wins - a.wins || b.games - a.games);
    const opponents = Object.values(p.opponents).filter((o) => o.games);
    const best = partners.find((x) => x.games && x.wins) ?? null;
    return {
      ...p,
      winPct: pct(p.wins, p.games),
      nilPct: pct(p.nilMade, p.nil),
      blindPct: pct(p.blindMade, p.blind),
      ownBidPct: pct(p.ownBidMade, p.bidHands),
      teamMadePct: pct(p.teamMade, p.teamMade + p.teamSet),
      avgBid: p.bidHands ? Math.round((10 * p.bidTotal) / p.bidHands) / 10 : null,
      avgBooks: p.hands ? Math.round((10 * p.books) / p.hands) / 10 : null,
      partners,
      bestPartner: best,
      beatsMost: [...opponents].sort((a, b) => b.wins - a.wins)[0] ?? null,
      losesToMost: [...opponents].sort((a, b) => (b.games - b.wins) - (a.games - a.wins))[0] ?? null,
      recent: p.lastResults.slice(-10),
    };
  });
  // Leaderboard: people only, most wins, then best win rate, then most games.
  return list
    .filter((p) => !p.bot)
    .sort((a, b) => b.wins - a.wins || (b.winPct ?? -1) - (a.winPct ?? -1) || b.games - a.games || a.name.localeCompare(b.name));
}

/**
 * Swap game logs with the other devices in a game room: each device says which games it has, and
 * the others send back any it's missing. `onUpdate` runs when new games arrive.
 */
export function useStatsSync(room, onUpdate) {
  const told = useRef(new Set());
  const update = useRef(onUpdate);
  update.current = onUpdate;
  const peerKey = room.peers.map((p) => p.id).join(',');
  useEffect(() => {
    for (const p of room.peers) {
      if (told.current.has(p.id) || p.role === 'tv' || p.role === 'card') continue;
      told.current.add(p.id);
      room.send({ type: 'log-have', ids: logSummary(loadLog()) }, p.id);
    }
  }, [peerKey]);
  return (m, from) => {
    const handled = handleLogMessage(m, from, loadLog(), room.send, saveGames);
    if (handled && m.type === 'log-games') update.current?.();
    return handled;
  };
}

const logTag = (g) => `${g.id}:${g.finished ? 1 : 0}:${g.hands.length}`;
export const logSummary = (log) => log.map(logTag);

/**
 * The log swap itself: answer "here's what I have" with the games they're missing, and keep games
 * that arrive. Returns true if `m` was a stats message.
 */
export function handleLogMessage(m, from, log, send, save) {
  if (m.type === 'log-have' && from) {
    const have = new Set(m.ids ?? []);
    const missing = log.filter((g) => !have.has(logTag(g)));
    if (missing.length) send({ type: 'log-games', games: missing.slice(-60) }, from.id);
    return true;
  }
  if (m.type === 'log-games') {
    save(m.games ?? []);
    return true;
  }
  return false;
}
