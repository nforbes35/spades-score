// Seats around the table and book-by-book play. Partners sit across from each other, so going
// clockwise the seats are Team 1 player 1, Team 2 player 1, Team 1 player 2, Team 2 player 2.
import { isNil } from './scoring.js';
import { tr } from './i18n.js';

export const SEATS = [[0, 0], [1, 0], [0, 1], [1, 1]];
export const teamOf = (s) => SEATS[s][0];
export const playerName = (game, s) => game.teams[SEATS[s][0]].players[SEATS[s][1]];
export const seatEntry = (hand, s) => hand.teams[SEATS[s][0]].players[SEATS[s][1]];

/**
 * Book-by-book play. For remote players (who play from their phones), `hands[seat]` is the cards
 * scanned for them and `played[seat]` the card they've played in the current book; each finished book
 * keeps the remote cards played in it: tricks[i] = { winner, cards: { [seat]: card } }.
 */
export const liveOf = (hand) => {
  const l = hand.live ?? {};
  return { tricks: l.tricks ?? [], hands: l.hands ?? {}, played: l.played ?? {} };
};

/** Seats played from phones. Older games had a single `seat`. */
export const remoteSeats = (game) => {
  const r = game?.remote;
  if (!r) return [];
  return r.seats ?? (r.seat != null ? [r.seat] : []);
};

/**
 * The game as one device should see it: a remote player gets only their own scanned cards, anyone
 * else (TV screens, video guests) gets nobody's.
 */
export function gameFor(game, seat) {
  return {
    ...game,
    hands: game.hands.map((h) => {
      if (!h.inPlay || !h.live?.hands) return h;
      const own = seat != null && h.live.hands[seat] ? { [seat]: h.live.hands[seat] } : {};
      return { ...h, live: { ...h.live, hands: own } };
    }),
  };
}

/** Bring a game saved by an earlier version (one remote player) up to date. */
export function normalizeGame(game) {
  if (!game?.remote || game.remote.seats) return game;
  const seat = game.remote.seat;
  return {
    ...game,
    remote: { code: game.remote.code, seats: seat != null ? [seat] : [] },
    hands: game.hands.map((h) => {
      const l = h.live;
      if (!l || l.hands) return h;
      return {
        ...h,
        live: {
          tricks: (l.tricks ?? []).map((t) => ({ winner: t.winner, cards: t.card ? { [seat]: t.card } : {} })),
          hands: l.cards ? { [seat]: l.cards } : {},
          played: l.pending ? { [seat]: l.pending } : {},
        },
      };
    }),
  };
}
export const stageOf = (hand) => (!hand.inPlay ? 'done' : hand.stage ?? 'bids');
export const booksPlayed = (hand) => liveOf(hand).tricks.length;

/** Who leads the current book: whoever took the last one, or the player left of the dealer. */
export function leaderOf(hand) {
  const { tricks } = liveOf(hand);
  return tricks.length ? tricks[tricks.length - 1].winner : ((hand.dealer ?? 0) + 1) % 4;
}

/** A remote seat's cards not yet played this hand, or null if none were scanned. */
export function remainingCards(hand, seat) {
  const { hands, tricks, played } = liveOf(hand);
  const cards = hands[seat];
  if (!cards) return null;
  const used = new Set(tricks.map((t) => t.cards?.[seat]).filter(Boolean));
  if (played[seat]) used.add(played[seat]);
  return cards.filter((c) => !used.has(c));
}

/** Every card a remote seat has played this hand (finished books plus the current one). */
export const playedBy = (hand, seat) => {
  const { tricks, played } = liveOf(hand);
  return [...tricks.map((t) => t.cards?.[seat]), played[seat]].filter(Boolean);
};

export function updateSeat(hand, s, change) {
  const [t, p] = SEATS[s];
  return {
    ...hand,
    teams: hand.teams.map((round, ti) => (ti !== t ? round : {
      ...round, players: round.players.map((pl, pi) => (pi === p ? { ...pl, ...change } : pl)),
    })),
  };
}

/** Seat s took the current book. Cards remote players played in it go with it. */
export function awardBook(hand, s) {
  const live = liveOf(hand);
  if (live.tricks.length >= 13) return hand;
  const next = updateSeat(hand, s, { books: seatEntry(hand, s).books + 1 });
  return { ...next, live: { ...live, tricks: [...live.tricks, { winner: s, cards: live.played }], played: {} } };
}

/** Short status for a seat: "2 of 4", "Nil ✓", "Nil set". */
export function seatProgress(hand, s) {
  const p = seatEntry(hand, s);
  if (isNil(p.call)) return { text: p.books === 0 ? tr('clean') : tr('set!'), bad: p.books > 0 };
  return { text: tr('of {n}', { n: p.bid }), good: p.books >= p.bid && p.bid > 0 };
}

export const nextDealer = (game) => {
  const last = game.hands[game.hands.length - 1];
  return last ? ((last.dealer ?? -1) + 1) % 4 : 0;
};
