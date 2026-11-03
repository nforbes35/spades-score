// Online mode's game engine: the host's device deals, checks every move against the rules, works out
// who won each book and keeps score. Plain data in, plain data out, so it can be saved, sent and tested.
//
// Seats go clockwise 0-3 (see table.js): seats 0 and 2 are one team, 1 and 3 the other.
// The scoring side is the same `game` object manual mode uses (teams, rules, target, hands), so the
// scoreboard, hand history and TV view work for both.
import { FULL_DECK, parseCard, RANKS } from './cards.js';
import { STANDARD_RULES, newHand, winner, standings } from './scoring.js';
import { SEATS, updateSeat, seatEntry } from './table.js';

export const ONLINE_RULES = { ...STANDARD_RULES, blindNilAllowed: true };

const rankValue = (code) => RANKS.indexOf(parseCard(code).rank);
const suitOf = (code) => code.slice(-1);

/** Unbiased shuffle. `random` returns a number in [0, 1); defaults to the browser's crypto source. */
export function shuffle(cards, random = cryptoRandom) {
  const deck = [...cards];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function cryptoRandom() {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] / 2 ** 32;
}

/** A table with nobody seated yet. */
export function newTable(settings = {}) {
  return {
    phase: 'lobby',
    seats: [null, null, null, null],
    settings: { target: 500, rules: ONLINE_RULES, ...settings },
    game: null,
    round: null,
    gamesPlayed: 0,
  };
}

const teamName = (seats, t) => {
  const names = SEATS.map((_, s) => s).filter((s) => SEATS[s][0] === t).map((s) => seats[s]?.name ?? '?');
  return names.join(' & ');
};

/** Start a new game with whoever is seated (every seat must be filled, by a person or the computer). */
export function startGame(table, random) {
  if (table.seats.some((s) => !s)) throw new Error('Fill every seat first.');
  const teams = [0, 1].map((t) => ({
    name: teamName(table.seats, t),
    players: SEATS.map((st, s) => [st, s]).filter(([st]) => st[0] === t).sort((a, b) => a[0][1] - b[0][1]).map(([, s]) => table.seats[s].name),
  }));
  const game = { id: crypto.randomUUID(), teams, target: table.settings.target, rules: table.settings.rules, hands: [], startedAt: Date.now() };
  const firstDealer = Math.floor((random ?? cryptoRandom)() * 4);
  // The Papi Flip mini game happens once a game, on Papi's `at`-th card.
  const papi = { at: 3 + Math.floor((random ?? cryptoRandom)() * 40), count: 0, done: false };
  return deal({ ...table, game, papi, phase: 'bidding', gamesPlayed: table.gamesPlayed + 1, round: { dealer: (firstDealer + 3) % 4 } }, random);
}

/** Deal the next hand: the deal moves one seat to the left. */
export function deal(table, random) {
  const dealer = ((table.round?.dealer ?? -1) + 1) % 4;
  const deck = shuffle(FULL_DECK, random);
  const hands = {};
  for (let s = 0; s < 4; s++) hands[s] = deck.slice(s * 13, s * 13 + 13);
  const first = (dealer + 1) % 4;
  return {
    ...table,
    phase: 'bidding',
    game: { ...table.game, hands: [...table.game.hands, newHand(dealer)] },
    round: { dealer, hands, turn: first, trick: [], lead: first, tricks: [], spadesBroken: false, lastTrick: null, bidsIn: 0, dealtAt: Date.now() },
  };
}

export const currentHand = (table) => table.game.hands[table.game.hands.length - 1];

/** Seat `seat` bids: { bid: 1-13 } or { call: 'nil' | 'blind' }. Throws if it's not allowed. */
export function placeBid(table, seat, { bid = 0, call = 'none' }) {
  const r = table.round;
  if (table.phase !== 'bidding') throw new Error('Not bidding now.');
  if (r.turn !== seat) throw new Error('Not your turn to bid.');
  if (call === 'blind' && !table.settings.rules.blindNilAllowed) throw new Error('Blind nil is switched off.');
  if (!['none', 'nil', 'blind'].includes(call)) throw new Error('Unknown bid.');
  const n = call === 'none' ? Math.trunc(bid) : 0;
  if (call === 'none' && !(n >= 1 && n <= 13)) throw new Error('Bid 1 to 13, or nil.');
  const hand = updateSeat(currentHand(table), seat, { bid: n, call });
  const bidsIn = r.bidsIn + 1;
  const done = bidsIn === 4;
  return {
    ...table,
    phase: done ? 'playing' : 'bidding',
    game: { ...table.game, hands: [...table.game.hands.slice(0, -1), { ...hand, stage: done ? 'play' : 'bids' }] },
    round: { ...r, bidsIn, turn: done ? r.lead : (seat + 1) % 4 },
  };
}

/** The cards seat `seat` may play right now. */
export function legalCards(table, seat) {
  const r = table.round;
  const hand = r.hands[seat];
  if (table.phase !== 'playing' || r.turn !== seat) return [];
  if (r.trick.length === 0) {
    // Spades can't be led until someone has trumped with one, unless that's all you have.
    const nonSpades = hand.filter((c) => suitOf(c) !== 'S');
    return r.spadesBroken || !nonSpades.length ? hand : nonSpades;
  }
  const led = suitOf(r.trick[0].card);
  const follow = hand.filter((c) => suitOf(c) === led);
  return follow.length ? follow : hand;
}

/** Who wins a finished book: the highest spade, otherwise the highest card of the suit led. */
export function trickWinner(trick) {
  const led = suitOf(trick[0].card);
  const beats = (a, b) => {
    const sa = suitOf(a.card);
    const sb = suitOf(b.card);
    if (sa === sb) return rankValue(a.card) > rankValue(b.card);
    return sa === 'S' || (sa === led && sb !== 'S');
  };
  return trick.reduce((best, t) => (beats(t, best) ? t : best)).seat;
}

/** How a card can be played onto the table (only the look differs). 'papi': face down, flips after 3 s. */
export const PLAY_STYLES = ['toss', 'slam', 'papi', 'spin'];

/**
 * Seat `seat` plays `card` (with a play `style`, just for show). Finishing the 13th book scores the hand (and
 * maybe ends the game).
 */
export function playCard(table, seat, card, style = 'toss') {
  const r = table.round;
  if (table.phase !== 'playing') throw new Error('Not playing now.');
  if (r.papiGame) throw new Error('Hold on: it’s the Papi Flip!');
  if (r.turn !== seat) throw new Error('Not your turn.');
  if (!legalCards(table, seat).includes(card)) {
    throw new Error(r.hands[seat].includes(card) ? 'You must follow suit (or spades aren’t broken yet).' : 'That card isn’t in your hand.');
  }
  const hands = { ...r.hands, [seat]: r.hands[seat].filter((c) => c !== card) };
  const trick = [...r.trick, { seat, card, ...(PLAY_STYLES.includes(style) && style !== 'toss' ? { style } : {}) }];
  const spadesBroken = r.spadesBroken || suitOf(card) === 'S';
  if (trick.length < 4) {
    return { ...table, round: { ...r, hands, trick, spadesBroken, turn: (seat + 1) % 4 } };
  }
  const win = trickWinner(trick);
  let hand = updateSeat(currentHand(table), win, { books: seatEntry(currentHand(table), win).books + 1 });
  const tricks = [...r.tricks, { winner: win, cards: trick }];
  const handDone = tricks.length === 13;
  hand = {
    ...hand,
    live: { tricks: tricks.map((t) => ({ winner: t.winner, cards: {} })), hands: {}, played: {} },
    ...(handDone ? { inPlay: false, stage: 'done' } : {}),
  };
  const game = { ...table.game, hands: [...table.game.hands.slice(0, -1), hand] };
  const over = handDone && winner(game) != null;
  return {
    ...table,
    phase: handDone ? (over ? 'over' : 'scored') : 'playing',
    game,
    round: {
      ...r, hands, trick: [], tricks, spadesBroken, turn: win, lead: win,
      lastTrick: { winner: win, cards: trick, at: Date.now() },
    },
  };
}

// ---------------------------------------------------------------------------------------------
// The Papi Flip mini game. Once a game, if someone named Papi is playing, one of his cards lands face down and
// stays down: Papi secretly picks one of two numbers, then his partner and one player from the other team each
// guess it. Right: +25 for the guesser's team, wrong: -25. Then the card flips and play goes on. Only while
// both teams are more than 25 from winning, so it can never decide the game.

export const PAPI_POINTS = 25;
const PAPI = 'papi';

/** Papi's seat (a person, not a computer player), or -1. */
export const papiSeat = (table) => table.seats.findIndex((s) => s && !s.bot && String(s.name).trim().toLowerCase() === PAPI);

/** Both teams more than 25 from winning? */
export const papiAllowed = (table) => standings(table.game).every((x) => table.game.target - x.score > PAPI_POINTS);

/** The host plays a card, starting the Papi Flip mini game when it's Papi's moment. */
export function playCardAsHost(table, seat, card, style, random = cryptoRandom) {
  let next = playCard(table, seat, card, style);
  const p = table.papi;
  if (!p || p.done || seat !== papiSeat(table)) return next;
  const count = p.count + 1;
  next = { ...next, papi: { ...p, count } };
  // Not on the last card of a book (it would be swept away), and only while it can't decide the game.
  if (count < p.at || table.round.trick.length === 3 || !papiAllowed(next)) return next;
  const a = 1 + Math.floor(random() * 49);
  const b = 50 + Math.floor(random() * 50);
  const numbers = random() < 0.5 ? [a, b] : [b, a];
  const partner = (seat + 2) % 4;
  const opponent = random() < 0.5 ? (seat + 1) % 4 : (seat + 3) % 4;
  const trick = next.round.trick.map((t) => (t.seat === seat ? { ...t, style: 'papi-wait' } : t));
  return {
    ...next,
    round: { ...next.round, trick, papiGame: { seat, numbers, pick: null, guessers: [partner, opponent], guesses: {}, phase: 'pick', at: Date.now() } },
  };
}

/** Papi picks his secret number. */
export function papiPick(table, seat, n) {
  const g = table.round.papiGame;
  if (!g || g.phase !== 'pick' || seat !== g.seat || !g.numbers.includes(n)) throw new Error('Not now.');
  return { ...table, round: { ...table.round, papiGame: { ...g, pick: n, phase: 'guess', at: Date.now() } } };
}

/** A guesser guesses; when both have, the answers are revealed and the points added to this hand. */
export function papiGuess(table, seat, n) {
  const g = table.round.papiGame;
  if (!g || g.phase !== 'guess' || !g.guessers.includes(seat) || g.guesses[seat] != null || !g.numbers.includes(n)) throw new Error('Not now.');
  const guesses = { ...g.guesses, [seat]: n };
  if (g.guessers.some((s) => guesses[s] == null)) return { ...table, round: { ...table.round, papiGame: { ...g, guesses } } };
  const results = Object.fromEntries(g.guessers.map((s) => [s, guesses[s] === g.pick ? PAPI_POINTS : -PAPI_POINTS]));
  const hand = currentHand(table);
  const bonus = [...(hand.bonus ?? [0, 0])];
  for (const s of g.guessers) bonus[SEATS[s][0]] += results[s];
  return {
    ...table,
    game: { ...table.game, hands: [...table.game.hands.slice(0, -1), { ...hand, bonus }] },
    round: { ...table.round, papiGame: { ...g, guesses, results, phase: 'reveal', at: Date.now() } },
  };
}

/** After the reveal: the card flips over and play goes on. */
export function papiFinish(table) {
  const g = table.round.papiGame;
  if (!g || g.phase !== 'reveal') return table;
  const trick = table.round.trick.map((t) => (t.seat === g.seat && t.style === 'papi-wait' ? { ...t, style: 'papi-now' } : t));
  const { papiGame, ...round } = table.round;
  return { ...table, papi: { ...table.papi, done: true }, round: { ...round, trick } };
}

/** Back to the lobby after a game, keeping everyone seated. */
export const backToLobby = (table) => ({ ...table, phase: 'lobby', round: null });

/** What one device may see: everything except other people's cards (just how many they hold). */
export function publicTable(table) {
  if (!table.round?.hands) return table;
  const counts = Object.fromEntries(Object.entries(table.round.hands).map(([s, h]) => [s, h.length]));
  let { papiGame } = table.round;
  // Papi's number and the guesses stay secret until the reveal.
  if (papiGame && papiGame.phase !== 'reveal') {
    papiGame = { ...papiGame, pick: papiGame.pick != null ? 'secret' : null, guesses: Object.fromEntries(Object.keys(papiGame.guesses).map((s) => [s, 'secret'])) };
  }
  return { ...table, round: { ...table.round, hands: undefined, counts, papiGame } };
}
