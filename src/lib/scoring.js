// Spades scoring, ported from the iPhone app (SpadesCore). Plain data so it saves as JSON.
import { tr } from './i18n.js';

// Labels are getters so they're put into words when drawn, in this device's language.
export const NIL_CALLS = [
  { id: 'none', get label() { return tr('None'); } },
  { id: 'nil', get label() { return tr('Nil'); } },
  { id: 'blind', get label() { return tr('Blind Nil'); } },
];
export const nilLabel = (call) => NIL_CALLS.find((c) => c.id === call)?.label ?? tr('None');
export const isNil = (call) => call === 'nil' || call === 'blind';

export const STANDARD_RULES = {
  nilValue: 100,
  blindNilValue: 200,
  bigBidThreshold: 10,
  bigBidBonus: 200,
  bagsEnabled: true,
  bagsLimit: 10,
  bagsPenalty: 100,
  // If on, a team that falls to loseScore or below loses straight away.
  loseEnabled: false,
  loseScore: -200,
  // If true, books a nil player takes still help their partner make the bid.
  nilBooksCountTowardBid: false,
};

export const newPlayer = () => ({ bid: 0, books: 0, call: 'none' });
export const newTeamRound = () => ({ players: [newPlayer(), newPlayer()] });
/** A hand being bid. `dealer` is a seat (see table.js); `live` tracks book-by-book play. */
export const newHand = (dealer = 0) => ({
  id: crypto.randomUUID(), inPlay: true, stage: 'bids', dealer,
  teams: [newTeamRound(), newTeamRound()],
  live: { tricks: [], hands: {}, played: {} },
});

export const signed = (n) => (n > 0 ? `+${n}` : `${n}`);

/** Every book the team took, nil players included. */
export const totalBooks = (round) => round.players.reduce((s, p) => s + p.books, 0);
/** Books taken by players who went nil / blind nil. */
export const nilBooks = (round) => round.players.filter((p) => isNil(p.call)).reduce((s, p) => s + p.books, 0);
/** The team's bid, not counting nil players. */
export const contractBid = (round) => round.players.filter((p) => !isNil(p.call)).reduce((s, p) => s + p.bid, 0);
/** Total bid at the table, nil players counting as zero. */
export const tableBid = (hand) => hand.teams.reduce((s, t) => s + contractBid(t), 0);

/** Score one team's hand. Partners' books are added together, so one can cover the other. */
export function scoreTeam(round, rules = STANDARD_RULES) {
  const lines = [];

  // Nil / blind nil: all or nothing for each player who called it.
  let nilPoints = 0;
  for (const p of round.players) {
    if (!isNil(p.call)) continue;
    const value = p.call === 'blind' ? rules.blindNilValue : rules.nilValue;
    const made = p.books === 0;
    nilPoints += made ? value : -value;
    lines.push(made
      ? tr('{nil} made: {pts}', { nil: nilLabel(p.call), pts: signed(value) })
      : tr('{nil} set ({n} books): {pts}', { nil: nilLabel(p.call), n: p.books, pts: signed(-value) }));
  }

  const bid = contractBid(round);
  const nb = nilBooks(round);
  const books = rules.nilBooksCountTowardBid ? totalBooks(round) : Math.max(0, totalBooks(round) - nb);

  let madeBid = null;
  let bidPoints = 0;
  let bonus = 0;
  let bags = 0;

  if (bid > 0) {
    madeBid = books >= bid;
    if (madeBid) {
      bags = books - bid;
      bidPoints = bid * 10 + bags;
      const bagText = bags === 1 ? tr('{n} bag', { n: bags }) : tr('{n} bags', { n: bags });
      lines.push(tr('Bid {bid}, took {books}: {pts}', { bid, books, pts: `${signed(bid * 10)}${bags > 0 ? ` + ${bagText}` : ''}` }));
      if (bid >= rules.bigBidThreshold) {
        bonus = rules.bigBidBonus;
        lines.push(tr('{n}+ bid bonus: {pts}', { n: rules.bigBidThreshold, pts: signed(bonus) }));
      }
    } else {
      bidPoints = -bid * 10;
      lines.push(tr('Bid {bid}, took {books}: set {pts}', { bid, books, pts: signed(bidPoints) }));
    }
  } else if (books > 0) {
    // No bid of their own, so anything they took is a bag.
    bags = books;
    bidPoints = books;
    lines.push(books === 1 ? tr('No bid, {n} bag: {pts}', { n: books, pts: signed(books) }) : tr('No bid, {n} bags: {pts}', { n: books, pts: signed(books) }));
  }

  // Books a nil player took that didn't go toward the bid are bags.
  if (!rules.nilBooksCountTowardBid && nb > 0) {
    bags += nb;
    bidPoints += nb;
    lines.push(tr("Nil player's books as bags: {pts}", { pts: signed(nb) }));
  }

  return { contractBid: bid, contractBooks: books, madeBid, bags, lines, total: bidPoints + bonus + nilPoints };
}

/** Standings for both teams after each hand, in order. A hand still in play scores 0. */
export function history(game) {
  const score = [0, 0];
  const bags = [0, 0];
  return game.hands.map((hand) =>
    [0, 1].map((t) => {
      // Extra points won or lost during a hand (the Papi Flip mini game) count straight away.
      const extra = hand.bonus?.[t] ?? 0;
      if (hand.inPlay) { score[t] += extra; return { score: score[t], bags: bags[t], points: extra, penalty: 0 }; }
      const r = scoreTeam(hand.teams[t], game.rules);
      let penalty = 0;
      if (game.rules.bagsEnabled && game.rules.bagsLimit > 0) {
        bags[t] += r.bags;
        while (bags[t] >= game.rules.bagsLimit) {
          bags[t] -= game.rules.bagsLimit;
          penalty += game.rules.bagsPenalty;
        }
      }
      const points = r.total - penalty + extra;
      score[t] += points;
      return { score: score[t], bags: bags[t], points, penalty };
    }),
  );
}

export const standings = (game) => {
  const h = history(game);
  return h.length ? h[h.length - 1] : [0, 1].map(() => ({ score: 0, bags: 0, points: 0, penalty: 0 }));
};

/** Index of the winning team, once someone reaches the target with the higher score. */
export function winner(game) {
  const s = standings(game).map((x) => x.score);
  // Losing score (if on): a team at or below it loses, so the other team wins (both: the higher score wins).
  const lose = game.rules?.loseEnabled ? Number(game.rules.loseScore) : null;
  const out = lose != null && Number.isFinite(lose) ? s.map((x) => x <= lose) : [false, false];
  if (out[0] !== out[1]) return out[0] ? 1 : 0;
  if (!(out[0] || s.some((x) => x >= game.target)) || s[0] === s[1]) return null;
  return s[0] > s[1] ? 0 : 1;
}
