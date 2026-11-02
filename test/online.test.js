import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newTable, startGame, placeBid, legalCards, playCard, trickWinner, currentHand, deal, publicTable, shuffle } from '../src/lib/online.js';
import { botBid, botPlay } from '../src/lib/bots.js';
import { standings, winner, totalBooks } from '../src/lib/scoring.js';
import { FULL_DECK } from '../src/lib/cards.js';

/** Repeatable "random" numbers for tests. */
function seeded(seed) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

const seat = (name) => ({ id: name, name });
function table4(random) {
  const t = newTable({ target: 300 });
  return startGame({ ...t, seats: [seat('Nick'), seat('Joe'), seat('Amy'), seat('Sue')] }, random);
}

test('dealing gives everyone 13 different cards and the deal moves left', () => {
  const t = table4(seeded(1));
  const all = Object.values(t.round.hands).flat();
  assert.equal(all.length, 52);
  assert.equal(new Set(all).size, 52);
  const next = deal(t, seeded(2));
  assert.equal(next.round.dealer, (t.round.dealer + 1) % 4);
  assert.equal(next.round.turn, (next.round.dealer + 1) % 4, 'left of the dealer starts');
});

test('teams are seats 0 & 2 and 1 & 3', () => {
  const t = table4(seeded(1));
  assert.deepEqual(t.game.teams.map((x) => x.players), [['Nick', 'Amy'], ['Joe', 'Sue']]);
});

test('bids go round in order, then play starts left of the dealer', () => {
  let t = table4(seeded(3));
  const first = t.round.turn;
  assert.throws(() => placeBid(t, (first + 1) % 4, { bid: 3 }), /Not your turn/);
  assert.throws(() => placeBid(t, first, { bid: 0 }), /1 to 13/);
  for (let i = 0; i < 4; i++) t = placeBid(t, (first + i) % 4, i === 2 ? { call: 'nil' } : { bid: 3 });
  assert.equal(t.phase, 'playing');
  assert.equal(t.round.turn, first);
  assert.equal(currentHand(t).teams.flatMap((x) => x.players).filter((p) => p.call === 'nil').length, 1);
});

test('the highest spade wins, otherwise the highest of the suit led', () => {
  assert.equal(trickWinner([{ seat: 0, card: '10H' }, { seat: 1, card: 'AH' }, { seat: 2, card: '2S' }, { seat: 3, card: 'KH' }]), 2);
  assert.equal(trickWinner([{ seat: 0, card: '10H' }, { seat: 1, card: 'AD' }, { seat: 2, card: 'QH' }, { seat: 3, card: '3H' }]), 2);
});

test('must follow suit; spades can\'t be led until broken', () => {
  let t = table4(seeded(4));
  const first = t.round.turn;
  for (let i = 0; i < 4; i++) t = placeBid(t, (first + i) % 4, { bid: 3 });
  // Rig the hands to check the rules.
  t = { ...t, round: { ...t.round, hands: { ...t.round.hands, [first]: ['AS', '2H', 'KS'], [(first + 1) % 4]: ['3H', '4D', '5S'] } } };
  assert.deepEqual(legalCards(t, first), ['2H'], 'no leading spades yet');
  t = playCard(t, first, '2H');
  assert.deepEqual(legalCards(t, (first + 1) % 4), ['3H'], 'must follow hearts');
  assert.throws(() => playCard(t, (first + 1) % 4, '5S'), /follow suit/);
});

test('four computer players finish a whole game; every hand has 13 books and the score adds up', () => {
  let t = table4(seeded(7));
  let hands = 0;
  let guard = 0;
  while (t.phase !== 'over' && guard++ < 5000) {
    if (t.phase === 'scored') { t = deal(t, seeded(100 + hands)); continue; }
    const s = t.round.turn;
    if (t.phase === 'bidding') t = placeBid(t, s, botBid(t.round.hands[s]));
    else {
      t = playCard(t, s, botPlay(t, s));
      if (t.phase !== 'playing') hands++;
    }
  }
  assert.equal(t.phase, 'over');
  assert.ok(hands >= 2, `played ${hands} hands`);
  for (const h of t.game.hands) {
    assert.equal(h.inPlay, false);
    assert.equal(totalBooks(h.teams[0]) + totalBooks(h.teams[1]), 13);
  }
  const w = winner(t.game);
  assert.ok(w === 0 || w === 1);
  assert.ok(standings(t.game)[w].score >= 300);
});

test('other players\' cards are left out of what devices see', () => {
  const t = table4(seeded(9));
  const pub = publicTable(t);
  assert.equal(pub.round.hands, undefined);
  assert.deepEqual(pub.round.counts, { 0: 13, 1: 13, 2: 13, 3: 13 });
});

test('shuffling keeps every card', () => {
  assert.deepEqual(shuffle(FULL_DECK, seeded(5)).sort(), [...FULL_DECK].sort());
});

test('a hand locked for one player can only be opened by that player', async () => {
  const { makeKeys, seal, unseal } = await import('../src/lib/secret.js');
  const host = await makeKeys();
  const sue = await makeKeys();
  const joe = await makeKeys();
  const box = await seal(host, sue.pub, ['AS', 'KH']);
  assert.deepEqual(await unseal(sue, host.pub, box), ['AS', 'KH']);
  await assert.rejects(() => unseal(joe, host.pub, box), 'Joe can’t read Sue’s cards');
});
