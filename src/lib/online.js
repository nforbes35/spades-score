// Online mode's game engine: the host's device deals, checks every move against the rules, works out
// who won each book and keeps score. Plain data in, plain data out, so it can be saved, sent and tested.
//
// Seats go clockwise 0-3 (see table.js): seats 0 and 2 are one team, 1 and 3 the other.
// The scoring side is the same `game` object manual mode uses (teams, rules, target, hands), so the
// scoreboard, hand history and TV view work for both.
import { FULL_DECK, parseCard, RANKS } from './cards.js';
import { STANDARD_RULES, newHand, winner } from './scoring.js';
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
  return deal({ ...table, game, phase: 'bidding', gamesPlayed: table.gamesPlayed + 1, round: { dealer: (firstDealer + 3) % 4 } }, random);
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
    round: { dealer, hands, turn: first, trick: [], lead: first, tricks: [], spadesBroken: false, lastTrick: null, bidsIn: 0 },
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

/** Seat `seat` plays `card`. Finishing the 13th book scores the hand (and maybe ends the game). */
export function playCard(table, seat, card) {
  const r = table.round;
  if (table.phase !== 'playing') throw new Error('Not playing now.');
  if (r.turn !== seat) throw new Error('Not your turn.');
  if (!legalCards(table, seat).includes(card)) {
    throw new Error(r.hands[seat].includes(card) ? 'You must follow suit (or spades aren’t broken yet).' : 'That card isn’t in your hand.');
  }
  const hands = { ...r.hands, [seat]: r.hands[seat].filter((c) => c !== card) };
  const trick = [...r.trick, { seat, card }];
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

/** Back to the lobby after a game, keeping everyone seated. */
export const backToLobby = (table) => ({ ...table, phase: 'lobby', round: null });

/** What one device may see: everything except other people's cards (just how many they hold). */
export function publicTable(table) {
  if (!table.round?.hands) return table;
  const counts = Object.fromEntries(Object.entries(table.round.hands).map(([s, h]) => [s, h.length]));
  return { ...table, round: { ...table.round, hands: undefined, counts } };
}
