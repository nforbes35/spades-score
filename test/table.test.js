import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newHand, scoreTeam } from '../src/lib/scoring.js';
import { awardBook, leaderOf, remainingCards, seatEntry, updateSeat, liveOf } from '../src/lib/table.js';
import { sortHand, isCard } from '../src/lib/cards.js';

test('first lead is left of the dealer, then whoever took the last book', () => {
  let h = newHand(3);
  assert.equal(leaderOf(h), 0);
  h = awardBook(h, 2);
  assert.equal(leaderOf(h), 2);
});

test('awarding books counts them for the player and the team score', () => {
  let h = newHand(0);
  h = updateSeat(h, 0, { bid: 4 }); // team 1, player 1
  h = updateSeat(h, 2, { bid: 2 }); // team 1, player 2 (partner across)
  for (const s of [0, 0, 0, 2, 2, 2, 1, 1, 1, 3, 3, 3, 1]) h = awardBook(h, s);
  assert.equal(seatEntry(h, 0).books, 3);
  assert.equal(seatEntry(h, 2).books, 3);
  assert.equal(liveOf(h).tricks.length, 13);
  // A 14th tap is ignored.
  assert.equal(awardBook(h, 0), h);
  // Partner's extra book covers the short one: 6 of 6.
  assert.equal(scoreTeam(h.teams[0]).total, 60);
});

test('remote cards leave the hand once played', () => {
  let h = newHand(0);
  h = { ...h, live: { ...liveOf(h), cards: ['AS', 'KH', '2C'] } };
  h = { ...h, live: { ...liveOf(h), pending: 'KH' } };
  assert.deepEqual(remainingCards(h), ['AS', '2C']);
  h = awardBook(h, 1);
  assert.equal(liveOf(h).tricks[0].card, 'KH');
  assert.equal(liveOf(h).pending, null);
  assert.deepEqual(remainingCards(h), ['AS', '2C']);
});

test('cards sort by suit, high first', () => {
  assert.deepEqual(sortHand(['2S', 'AH', 'AS', '10S', 'KD', '3C']), ['AS', '10S', '2S', 'AH', '3C', 'KD']);
  assert.equal(isCard('10H'), true);
  assert.equal(isCard('1H'), false);
});
