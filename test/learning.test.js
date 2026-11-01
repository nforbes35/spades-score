import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FULL_DECK } from '../src/lib/cards.js';
import { fit, pickCards, mergeScores } from '../src/lib/learning.js';

const HAND = ['AS', 'KS', '7S', '3S', 'QH', '9H', '4H', 'AC', 'JC', '5C', 'KD', '8D', '2D'];

/** What the reader "sees": hand cards high, except a few quirks of this deck. */
function reading(quirks = {}) {
  const scores = {};
  for (const c of FULL_DECK) scores[c] = HAND.includes(c) ? 0.8 : 0.05;
  return { ...scores, ...quirks };
}
// This deck: the reader barely sees the King of Spades, and reads the 2 of Diamonds as the 2 of Hearts.
const QUIRKS = { KS: 0.3, '2D': 0.1, '2H': 0.75 };

test('before any corrections it uses the plain cutoff, then fills to 13 with a marked guess', () => {
  const { cards, guessed } = pickCards(reading(QUIRKS), fit([]));
  assert.ok(cards.includes('2H'));
  assert.deepEqual(guessed, ['KS'], 'the faint King of Spades is the best leftover');
  assert.equal(cards.length, 13);
});

test('does not guess when too many are missing or nothing is close', () => {
  const blank = reading({ AS: 0.05, KS: 0.05, '7S': 0.05 });
  assert.deepEqual(pickCards(blank, fit([])).guessed, [], 'three missing: no guessing');
  const one = reading({ KS: 0.05 });
  assert.deepEqual(pickCards(one, fit([])).guessed, [], 'nothing close enough to guess');
});

test('photos add up: a card hidden in one shows in the other', () => {
  const first = reading({ KS: 0.05 });
  const second = reading({ QH: 0.05 });
  const { cards, guessed } = pickCards(mergeScores([first, second]), fit([]));
  assert.deepEqual([...cards].sort(), [...HAND].sort());
  assert.deepEqual(guessed, []);
});

test('after a few corrected hands it fixes this deck\'s mistakes', () => {
  const history = Array.from({ length: 5 }, () => ({ scores: reading(QUIRKS), hand: HAND }));
  const { cards, unsure, guessed } = pickCards(reading(QUIRKS), fit(history));
  assert.ok(cards.includes('KS') && !guessed.includes('KS'), 'learned to pick the faint King of Spades for sure');
  assert.ok(!cards.includes('2H'), 'learned the 2 of Hearts is a false alarm');
  assert.ok(cards.includes('2D') || unsure[0] === '2D', 'suggests the 2 of Diamonds for the mix-up');
  for (const c of HAND.filter((c) => c !== '2D')) assert.ok(cards.includes(c), `still picks ${c}`);
});

test('one odd hand does not throw everything off', () => {
  const history = [{ scores: reading(QUIRKS), hand: HAND }];
  const { cards } = pickCards(reading(), fit(history));
  assert.deepEqual([...cards].sort(), [...HAND].sort());
});
