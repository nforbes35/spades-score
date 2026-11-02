// Computer players for empty seats. Sensible, not brilliant: bid what the hand is likely to take,
// win cheaply, don't trump your partner, duck when you've bid nil.
import { parseCard, RANKS } from './cards.js';
import { legalCards, trickWinner, currentHand } from './online.js';
import { seatEntry, SEATS } from './table.js';
import { isNil } from './scoring.js';

const rank = (c) => RANKS.indexOf(parseCard(c).rank); // 0 = 2 ... 12 = ace
const suit = (c) => c.slice(-1);
const bySuit = (cards) => cards.reduce((m, c) => ((m[suit(c)] ??= []).push(c), m), {});
const partnerOf = (seat) => (seat + 2) % 4;

/** Roughly how many books this hand takes. */
export function botBid(cards) {
  const suits = bySuit(cards);
  let tricks = 0;
  for (const [s, list] of Object.entries(suits)) {
    const ranks = list.map(rank);
    if (s === 'S') {
      tricks += ranks.filter((r) => r >= 11).length; // A, K of spades
      tricks += ranks.includes(10) && list.length >= 3 ? 0.7 : 0; // guarded queen
      tricks += Math.max(0, list.length - 3) * 0.8; // long spades
    } else {
      if (ranks.includes(12)) tricks += list.length <= 5 ? 1 : 0.6;
      if (ranks.includes(11) && list.length >= 2) tricks += list.length <= 4 ? 0.8 : 0.4;
    }
  }
  // Short side suits let spades trump.
  const spades = (suits.S ?? []).length;
  for (const s of ['D', 'C', 'H']) {
    const n = (suits[s] ?? []).length;
    if (spades >= 3 && n === 0) tricks += 1;
    else if (spades >= 3 && n === 1) tricks += 0.5;
  }
  const n = Math.round(tricks);
  // A truly weak hand goes nil.
  const high = cards.filter((c) => rank(c) >= 10).length;
  if (n === 0 && high === 0 && (suits.S ?? []).every((c) => rank(c) < 7)) return { call: 'nil' };
  return { bid: Math.max(1, Math.min(13, n)) };
}

/** Which card to play now. */
export function botPlay(table, seat) {
  const options = legalCards(table, seat);
  const r = table.round;
  const lowest = (cs) => [...cs].sort((a, b) => rank(a) - rank(b) || (suit(a) === 'S') - (suit(b) === 'S'))[0];
  const highest = (cs) => [...cs].sort((a, b) => rank(b) - rank(a))[0];
  const me = seatEntry(currentHand(table), seat);
  const partner = seatEntry(currentHand(table), partnerOf(seat));
  const goingNil = isNil(me.call);

  if (!r.trick.length) {
    if (goingNil) return lowest(options);
    // Lead a winner from a side suit if we have one, otherwise something low from a long side suit.
    const aces = options.filter((c) => suit(c) !== 'S' && rank(c) === 12);
    if (aces.length) return aces[0];
    const side = Object.values(bySuit(options.filter((c) => suit(c) !== 'S'))).sort((a, b) => b.length - a.length)[0];
    return side ? lowest(side) : lowest(options);
  }

  const winningNow = trickWinner(r.trick);
  const wouldWin = (c) => trickWinner([...r.trick, { seat, card: c }]) === seat;
  const winners = options.filter(wouldWin);
  const losers = options.filter((c) => !wouldWin(c));

  if (goingNil) return losers.length ? highest(losers) : lowest(options);
  // Partner is already taking it (and isn't trying for nil): don't waste a card.
  if (winningNow === partnerOf(seat) && !isNil(partner.call) && r.trick.length >= 2) return lowest(losers.length ? losers : options);
  // Partner went nil and is about to take it: cover them if we can.
  if (winningNow === partnerOf(seat) && isNil(partner.call) && winners.length) return lowest(winners);
  if (winners.length) {
    // Last to play: win as cheaply as possible. Otherwise win with something that will likely hold.
    return r.trick.length === 3 ? lowest(winners) : highest(winners.filter((c) => suit(c) === suit(r.trick[0].card))) ?? lowest(winners);
  }
  return lowest(losers.length ? losers : options);
}

export const botNames = ['Ace', 'Lucky', 'Jack', 'Queenie'];
export const isBotSeat = (table, seat) => Boolean(table.seats[seat]?.bot);
export const seatTeam = (seat) => SEATS[seat][0];
