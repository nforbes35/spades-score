// Card decks: each sets the card backs, the table top and the face-card pictures. The choice is this
// device's own (like picking a deck in a card app), so everyone can play with the deck they like.
// Team decks use colours only: team names and logos are trademarks.
import { useSyncExternalStore } from 'react';
import { read, write } from './store.js';
import { SEASON_DECKS, seasonFor } from './seasons.js';

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
  button: [accent, trim],
});

const photoDeck = (id, name, group, back, table, extra = {}) => ({
  id, name, group, faces: 'classic',
  back: `url(/decks/${back}-back.webp) center / cover`,
  table: `linear-gradient(rgba(0, 0, 0, 0.28), rgba(0, 0, 0, 0.42)), url(/decks/${table}-table.webp) center / cover`,
  home: `url(/decks/${table}-table.webp)`,
  ...extra,
});

// Real tables: photographed wood tabletops (CC0) with a finish laid over them, and the room around in
// the same wood, darker. Classic card backs.
const realTable = (id, name, finish, felt, button) => ({
  id, name, group: 'Real tables', faces: 'classic', felt, button,
  table: `${finish}, url(/decks/real-${id}-table.jpg) center / cover`,
  home: `url(/decks/real-${id}-table.jpg)`,
});

/** Today's season or holiday theme, changing by itself through the year. */
const seasonal = () => ({ ...seasonFor(), id: 'seasonal', name: 'Changes with the date', season: seasonFor().name });

// Buttons in each photo deck's colours: [colour, text colour].
const PHOTO_BUTTONS = { mountains: ['#c8743a', '#fff'], reef: ['#1597ad', '#fff'], space: ['#7b5cff', '#fff'], faith: ['#d9a23a', '#2b1a00'] };

export const DECKS = [
  seasonal(),
  ...SEASON_DECKS,
  { id: 'classic', name: 'Classic', group: 'Classic', faces: 'classic' },
  { id: 'cartoon', name: 'Cartoon', group: 'Classic', faces: 'cartoon' },
  teamDeck('big-blue', 'Big Blue', ['#0b2265', '#a71930', '#ffffff']),
  teamDeck('miami-aqua', 'Miami Aqua', ['#008e97', '#fc4c02', '#ffffff']),
  teamDeck('orange-green', 'Orange & Green', ['#005030', '#f47321', '#ffffff']),
  teamDeck('orange-blue', 'Orange & Blue', ['#0021a5', '#fa4616', '#ffffff']),
  realTable('oak', 'Oak table', 'radial-gradient(80% 60% at 50% 30%, rgba(255, 236, 200, 0.18), rgba(40, 18, 4, 0.18))',
    ['#1d1006', '#3b2210', '#5c3719'], ['#b06a2c', '#fff']),
  realTable('walnut', 'Walnut table', 'radial-gradient(80% 60% at 50% 30%, rgba(255, 225, 190, 0.12), rgba(45, 20, 6, 0.42))',
    ['#140a04', '#2e1a0c', '#4a2c16'], ['#9c5a2a', '#fff']),
  realTable('cherry', 'Cherry table', 'radial-gradient(80% 60% at 50% 30%, rgba(255, 210, 180, 0.1), rgba(110, 32, 12, 0.5))',
    ['#1c0805', '#3d140b', '#622214'], ['#b4452a', '#fff']),
  realTable('farmhouse', 'Farmhouse table', 'radial-gradient(80% 60% at 50% 30%, rgba(255, 245, 225, 0.1), rgba(20, 16, 12, 0.3))',
    ['#121110', '#26231f', '#3d3933'], ['#8a7a64', '#fff']),
  // Papi's table: a warm evening light on the oak table, with drinks on the corners (see .dom-felt in styles.css)
  { id: 'papi', name: 'Papi’s table', group: 'Real tables', faces: 'classic', felt: ['#1a0e05', '#3a2110', '#5e3a1a'], button: ['#c77a2c', '#fff'],
    table: 'radial-gradient(75% 60% at 50% 35%, rgba(255, 200, 120, 0.3), rgba(45, 20, 4, 0.5)), url(/decks/real-oak-table.jpg) center / cover', home: 'url(/decks/real-oak-table.jpg)' },
  photoDeck('mountains', 'Mountains', 'Photos', 'mountains', 'mountains', { button: PHOTO_BUTTONS.mountains }),
  photoDeck('reef', 'Ocean reef', 'Photos', 'reef', 'reef', { button: PHOTO_BUTTONS.reef }),
  photoDeck('space', 'Space', 'Photos', 'space', 'space', { button: PHOTO_BUTTONS.space }),
  photoDeck('faith', 'Faith', 'Photos', 'glass', 'cross', { button: PHOTO_BUTTONS.faith,
    verse: 'This is the day which the LORD hath made; we will rejoice and be glad in it.',
    verseRef: 'Psalm 118:24',
  }),
];

// Anyone who hasn't picked a deck gets the seasonal one.
const byId = (id) => (id === 'seasonal' || !id ? seasonal() : DECKS.find((d) => d.id === id) ?? seasonal());

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
  root.toggleAttribute('data-home-photo', !!deck.home);
  root.toggleAttribute('data-btn', !!deck.button);
  if (deck.button) { root.style.setProperty('--btn', deck.button[0]); root.style.setProperty('--btn-ink', deck.button[1]); }
  else { root.style.removeProperty('--btn'); root.style.removeProperty('--btn-ink'); }
  if (deck.home) root.style.setProperty('--deck-home', deck.home); else root.style.removeProperty('--deck-home');
  ['--felt-a', '--felt-b', '--felt-c'].forEach((v, i) => {
    if (deck.felt) root.style.setProperty(v, deck.felt[i]); else root.style.removeProperty(v);
  });
}
apply(current);

// Left open overnight: move on to the next season's look when the phone comes back to the app.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && current.id === 'seasonal' && current.season !== seasonFor().name) setDeck('seasonal');
  });
}

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
