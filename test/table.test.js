import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newHand, scoreTeam } from '../src/lib/scoring.js';
import { awardBook, leaderOf, remainingCards, seatEntry, updateSeat, liveOf, playedBy, normalizeGame, remoteSeats, gameFor } from '../src/lib/table.js';
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

test('each remote player\'s cards leave their hand once played', () => {
  let h = newHand(0);
  h = { ...h, live: { ...liveOf(h), hands: { 1: ['AS', 'KH', '2C'], 3: ['5D', '6D'] } } };
  h = { ...h, live: { ...liveOf(h), played: { 1: 'KH', 3: '6D' } } };
  assert.deepEqual(remainingCards(h, 1), ['AS', '2C']);
  assert.deepEqual(remainingCards(h, 3), ['5D']);
  assert.equal(remainingCards(h, 0), null, 'not scanned');
  h = awardBook(h, 1);
  assert.deepEqual(liveOf(h).tricks[0].cards, { 1: 'KH', 3: '6D' });
  assert.deepEqual(liveOf(h).played, {});
  assert.deepEqual(remainingCards(h, 1), ['AS', '2C']);
  assert.deepEqual(playedBy(h, 3), ['6D']);
});

test('games saved with one remote player still load', () => {
  const old = {
    remote: { code: 'ABCD', seat: 3 },
    hands: [{ id: 'h', inPlay: true, live: { tricks: [{ winner: 0, card: 'QH' }, { winner: 2, card: null }], cards: ['QH', 'AS'], pending: 'AS' } }],
  };
  const g = normalizeGame(old);
  assert.deepEqual(g.remote, { code: 'ABCD', seats: [3] });
  assert.deepEqual(remoteSeats(g), [3]);
  assert.deepEqual(g.hands[0].live, { tricks: [{ winner: 0, cards: { 3: 'QH' } }, { winner: 2, cards: {} }], hands: { 3: ['QH', 'AS'] }, played: { 3: 'AS' } });
  assert.equal(normalizeGame(g), g, 'already new: untouched');
});

test('each device only gets its own cards', () => {
  const game = { remote: { code: 'ABCD', seats: [1, 3] }, hands: [{ id: 'h', inPlay: true, live: { tricks: [], hands: { 1: ['AS'], 3: ['KD'] }, played: {} } }] };
  assert.deepEqual(gameFor(game, 1).hands[0].live.hands, { 1: ['AS'] });
  assert.deepEqual(gameFor(game, null).hands[0].live.hands, {});
  assert.deepEqual(game.hands[0].live.hands, { 1: ['AS'], 3: ['KD'] }, 'the table keeps everything');
});

test('cards sort diamonds, clubs, hearts, spades, low to high', () => {
  assert.deepEqual(sortHand(['2S', 'AH', 'AS', '10S', 'KD', '3C', '4D']), ['4D', 'KD', '3C', 'AH', '2S', '10S', 'AS']);
  assert.equal(isCard('10H'), true);
  assert.equal(isCard('1H'), false);
});
