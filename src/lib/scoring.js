// Spades scoring, ported from the iPhone app (SpadesCore). Plain data so it saves as JSON.

export const NIL_CALLS = [
  { id: 'none', label: 'None' },
  { id: 'nil', label: 'Nil' },
  { id: 'blind', label: 'Blind Nil' },
];
export const nilLabel = (call) => NIL_CALLS.find((c) => c.id === call)?.label ?? 'None';
export const isNil = (call) => call === 'nil' || call === 'blind';

export const STANDARD_RULES = {
  nilValue: 100,
  blindNilValue: 200,
  bigBidThreshold: 10,
  bigBidBonus: 200,
  bagsEnabled: true,
  bagsLimit: 10,
  bagsPenalty: 100,
  // If true, books a nil player takes still help their partner make the bid.
  nilBooksCountTowardBid: false,
};

export const newPlayer = () => ({ bid: 0, books: 0, call: 'none' });
export const newTeamRound = () => ({ players: [newPlayer(), newPlayer()] });
export const newHand = () => ({ id: crypto.randomUUID(), inPlay: true, teams: [newTeamRound(), newTeamRound()] });

export const signed = (n) => (n > 0 ? `+${n}` : `${n}`);

/** Every book the team took, nil players included. */
export const totalBooks = (tr) => tr.players.reduce((s, p) => s + p.books, 0);
/** Books taken by players who went nil / blind nil. */
export const nilBooks = (tr) => tr.players.filter((p) => isNil(p.call)).reduce((s, p) => s + p.books, 0);
/** The team's bid, not counting nil players. */
export const contractBid = (tr) => tr.players.filter((p) => !isNil(p.call)).reduce((s, p) => s + p.bid, 0);
/** Total bid at the table, nil players counting as zero. */
export const tableBid = (hand) => hand.teams.reduce((s, t) => s + contractBid(t), 0);

/** Score one team's hand. Partners' books are added together, so one can cover the other. */
export function scoreTeam(tr, rules = STANDARD_RULES) {
  const lines = [];

  // Nil / blind nil: all or nothing for each player who called it.
  let nilPoints = 0;
  for (const p of tr.players) {
    if (!isNil(p.call)) continue;
    const value = p.call === 'blind' ? rules.blindNilValue : rules.nilValue;
    const made = p.books === 0;
    nilPoints += made ? value : -value;
    lines.push(`${nilLabel(p.call)} ${made ? 'made' : `set (${p.books} books)`}: ${signed(made ? value : -value)}`);
  }

  const bid = contractBid(tr);
  const nb = nilBooks(tr);
  const books = rules.nilBooksCountTowardBid ? totalBooks(tr) : Math.max(0, totalBooks(tr) - nb);

  let madeBid = null;
  let bidPoints = 0;
  let bonus = 0;
  let bags = 0;

  if (bid > 0) {
    madeBid = books >= bid;
    if (madeBid) {
      bags = books - bid;
      bidPoints = bid * 10 + bags;
      lines.push(`Bid ${bid}, took ${books}: ${signed(bid * 10)}${bags > 0 ? ` + ${bags} bag${bags === 1 ? '' : 's'}` : ''}`);
      if (bid >= rules.bigBidThreshold) {
        bonus = rules.bigBidBonus;
        lines.push(`${rules.bigBidThreshold}+ bid bonus: ${signed(bonus)}`);
      }
    } else {
      bidPoints = -bid * 10;
      lines.push(`Bid ${bid}, took ${books}: set ${signed(bidPoints)}`);
    }
  } else if (books > 0) {
    // No bid of their own, so anything they took is a bag.
    bags = books;
    bidPoints = books;
    lines.push(`No bid, ${books} bag${books === 1 ? '' : 's'}: ${signed(books)}`);
  }

  // Books a nil player took that didn't go toward the bid are bags.
  if (!rules.nilBooksCountTowardBid && nb > 0) {
    bags += nb;
    bidPoints += nb;
    lines.push(`Nil player's books as bags: ${signed(nb)}`);
  }

  return { contractBid: bid, contractBooks: books, madeBid, bags, lines, total: bidPoints + bonus + nilPoints };
}

/** Standings for both teams after each hand, in order. A hand still in play scores 0. */
export function history(game) {
  const score = [0, 0];
  const bags = [0, 0];
  return game.hands.map((hand) =>
    [0, 1].map((t) => {
      if (hand.inPlay) return { score: score[t], bags: bags[t], points: 0, penalty: 0 };
      const r = scoreTeam(hand.teams[t], game.rules);
      let penalty = 0;
      if (game.rules.bagsEnabled && game.rules.bagsLimit > 0) {
        bags[t] += r.bags;
        while (bags[t] >= game.rules.bagsLimit) {
          bags[t] -= game.rules.bagsLimit;
          penalty += game.rules.bagsPenalty;
        }
      }
      const points = r.total - penalty;
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
  if (!s.some((x) => x >= game.target) || s[0] === s[1]) return null;
  return s[0] > s[1] ? 0 : 1;
}
