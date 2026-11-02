// Card decks: each sets the card backs, the table top and the face-card pictures. The choice is this
// device's own (like picking a deck in a card app), so everyone can play with the deck they like.
// Team decks use colours only: team names and logos are trademarks.
import { useSyncExternalStore } from 'react';
import { read, write } from './store.js';

const DECK_KEY = 'spades-deck';

const football = (lace) => `url("data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 60'><path d='M50 3C25 3 6 18 2 30c4 12 23 27 48 27s44-15 48-27C94 18 75 3 50 3Z' fill='#874a22' stroke='#fff' stroke-width='2.5'/><path d='M16 18q4 12 0 24M84 18q-4 12 0 24' stroke='#fff' stroke-width='3' fill='none'/><path d='M34 30h32' stroke='${lace}' stroke-width='3'/><path d='M38 25v10M44 25v10M50 25v10M56 25v10M62 25v10' stroke='${lace}' stroke-width='2.6'/></svg>`,
)}")`;

const teamDeck = (id, name, [main, accent, trim]) => ({
  id, name, group: 'Team colors', faces: 'classic', emblem: 'football',
  back: `${football('#fff')} center / 62% auto no-repeat, linear-gradient(135deg, ${main} 0 38%, ${trim} 38% 44%, ${accent} 44% 56%, ${trim} 56% 62%, ${main} 62%)`,
  // a field: faint yard lines and a stripe in the team's accent colour across the middle
  table: `linear-gradient(transparent 48.5%, ${accent} 48.5% 51.5%, transparent 51.5%), repeating-linear-gradient(0deg, transparent 0 44px, rgba(255, 255, 255, 0.09) 44px 46px), radial-gradient(70% 60% at 50% 42%, color-mix(in srgb, ${main} 70%, #fff 12%), ${main} 60%, color-mix(in srgb, ${main} 70%, #000) 100%)`,
  emblemImage: football('#fff'),
  swatch: [main, accent],
});

const photoDeck = (id, name, group, back, table, extra = {}) => ({
  id, name, group, faces: 'classic',
  back: `url(/decks/${back}-back.webp) center / cover`,
  table: `linear-gradient(rgba(0, 0, 0, 0.28), rgba(0, 0, 0, 0.42)), url(/decks/${table}-table.webp) center / cover`,
  ...extra,
});

export const DECKS = [
  { id: 'classic', name: 'Classic', group: 'Classic', faces: 'classic' },
  { id: 'cartoon', name: 'Cartoon', group: 'Classic', faces: 'cartoon' },
  teamDeck('big-blue', 'Big Blue', ['#0b2265', '#a71930', '#ffffff']),
  teamDeck('miami-aqua', 'Miami Aqua', ['#008e97', '#fc4c02', '#ffffff']),
  teamDeck('orange-green', 'Orange & Green', ['#005030', '#f47321', '#ffffff']),
  teamDeck('orange-blue', 'Orange & Blue', ['#0021a5', '#fa4616', '#ffffff']),
  photoDeck('mountains', 'Mountains', 'Photos', 'mountains', 'mountains'),
  photoDeck('reef', 'Ocean reef', 'Photos', 'reef', 'reef'),
  photoDeck('space', 'Space', 'Photos', 'space', 'space'),
  photoDeck('faith', 'Faith', 'Photos', 'glass', 'cross', {
    verse: 'This is the day which the LORD hath made; we will rejoice and be glad in it.',
    verseRef: 'Psalm 118:24',
  }),
];

const byId = (id) => DECKS.find((d) => d.id === id) ?? DECKS[0];

let current = byId(read(DECK_KEY));
const listeners = new Set();

/** Put the deck's backs and table on the page (CSS variables on <html>). */
function apply(deck) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.deck = deck.id;
  root.dataset.emblem = deck.emblem ?? 'spade';
  if (deck.back) root.style.setProperty('--deck-back', deck.back); else root.style.removeProperty('--deck-back');
  if (deck.table) root.style.setProperty('--deck-table', deck.table); else root.style.removeProperty('--deck-table');
  if (deck.emblemImage) root.style.setProperty('--deck-emblem', deck.emblemImage); else root.style.removeProperty('--deck-emblem');
}
apply(current);

export function setDeck(id) {
  current = byId(id);
  write(DECK_KEY, current.id);
  apply(current);
  listeners.forEach((fn) => fn());
}

/** The deck this device plays with; re-renders when it changes. */
export function useDeck() {
  return useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn); }, () => current);
}
