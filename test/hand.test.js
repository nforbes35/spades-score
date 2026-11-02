import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardAt } from '../src/lib/hand.js';

// 13 cards, 70 px wide, each 22 px to the right of the last (a phone-sized fan).
const lefts = Array.from({ length: 13 }, (_, i) => 10 + i * 22);
const W = 70;

test('a finger on a card’s visible strip picks that card, not the one on top of it', () => {
  // Card 4's strip runs from 98 to 120; card 5 sits on top from 120.
  assert.equal(cardAt(98, lefts, W), 4);
  assert.equal(cardAt(119, lefts, W), 4);
  assert.equal(cardAt(120, lefts, W), 5);
});

test('the last card is picked anywhere across its whole face', () => {
  assert.equal(cardAt(lefts[12] + 5, lefts, W), 12);
  assert.equal(cardAt(lefts[12] + W - 1, lefts, W), 12);
});

test('off either end picks the end card', () => {
  assert.equal(cardAt(0, lefts, W), 0);
  assert.equal(cardAt(999, lefts, W), 12);
});

test('every position along the hand picks exactly the card whose strip it is in', () => {
  for (let x = lefts[0]; x < lefts[12]; x++) {
    const i = cardAt(x, lefts, W);
    assert.ok(x >= lefts[i] && x < lefts[i + 1], `x=${x} → card ${i}`);
  }
});

test('works with suit gaps between groups', () => {
  const gapped = [0, 20, 40, 65, 85, 110]; // gaps after the 3rd and 5th cards
  assert.equal(cardAt(60, gapped, 60), 2, 'in the gap: still the card on the left');
  assert.equal(cardAt(66, gapped, 60), 3);
});

test('no cards: nothing picked', () => {
  assert.equal(cardAt(50, [], 70), -1);
});
