// Playing cards are short codes: rank + suit letter, e.g. "QH", "10S", "AD".

export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
// Hands sort diamonds, clubs, hearts, spades (colors alternate, spades last), like the family's
// favorite spades app. \uFE0E asks for the plain text symbol (not an emoji) so it takes our red or black.
export const SUITS = [
  { id: 'D', sym: '♦\uFE0E', name: 'Diamonds', red: true },
  { id: 'C', sym: '♣\uFE0E', name: 'Clubs', red: false },
  { id: 'H', sym: '♥\uFE0E', name: 'Hearts', red: true },
  { id: 'S', sym: '♠\uFE0E', name: 'Spades', red: false },
];
const RANK_NAMES = { J: 'Jack', Q: 'Queen', K: 'King', A: 'Ace' };

export const FULL_DECK = SUITS.flatMap((s) => RANKS.map((r) => r + s.id));

export function parseCard(code) {
  const suit = SUITS.find((s) => s.id === code.slice(-1));
  return { rank: code.slice(0, -1), suit };
}
export const isCard = (code) => typeof code === 'string' && FULL_DECK.includes(code);
export const cardLabel = (code) => { const { rank, suit } = parseCard(code); return `${rank}${suit.sym}`; };
export const cardName = (code) => { const { rank, suit } = parseCard(code); return `${RANK_NAMES[rank] ?? rank} of ${suit.name}`; };

/** Group by suit (diamonds, clubs, hearts, spades), low to high within a suit (ace high). */
export function sortHand(cards) {
  const key = (c) => {
    const { rank, suit } = parseCard(c);
    return SUITS.findIndex((s) => s.id === suit.id) * 100 + RANKS.indexOf(rank);
  };
  return [...cards].sort((a, b) => key(a) - key(b));
}
