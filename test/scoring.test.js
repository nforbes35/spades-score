// Same cases as the iPhone app's SpadesCore tests. Run with `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreTeam, standings, winner, tableBid, STANDARD_RULES } from '../src/lib/scoring.js';

const p = (bid, books, call = 'none') => ({ bid, books, call });
const team = (a, b) => ({ players: [a, b] });
const scored = (t0, t1) => ({ id: 'x', inPlay: false, teams: [t0, t1] });

test('individual entries add together', () => {
  const r = scoreTeam(team(p(3, 4), p(2, 2)));
  assert.equal(r.contractBid, 5);
  assert.equal(r.contractBooks, 6);
  assert.equal(r.total, 51);
});

test('partner covers short books', () => {
  // Bid 4 took 3, partner bid 2 took 3: the team still makes 6.
  const r = scoreTeam(team(p(4, 3), p(2, 3)));
  assert.equal(r.madeBid, true);
  assert.equal(r.total, 60);
});

test('team set', () => {
  assert.equal(scoreTeam(team(p(4, 2), p(2, 2))).total, -60);
});

test('10+ bid bonus', () => {
  assert.equal(scoreTeam(team(p(6, 5), p(4, 5))).total, 300);
  assert.equal(scoreTeam(team(p(6, 6), p(5, 6))).total, 311);
  assert.equal(scoreTeam(team(p(6, 5), p(4, 4))).total, -100);
});

test('nil made and set', () => {
  assert.equal(scoreTeam(team(p(0, 0, 'nil'), p(4, 4))).total, 140);
  // -100 for the nil, +40 for the bid, +2 bags from the nil player's books
  assert.equal(scoreTeam(team(p(0, 2, 'nil'), p(4, 4))).total, -58);
});

test('blind nil', () => {
  assert.equal(scoreTeam(team(p(0, 0, 'blind'), p(3, 3))).total, 230);
  assert.equal(scoreTeam(team(p(0, 1, 'blind'), p(3, 3))).total, -200 + 30 + 1);
});

test('nil books can count toward bid', () => {
  const rules = { ...STANDARD_RULES, nilBooksCountTowardBid: true };
  assert.equal(scoreTeam(team(p(0, 1, 'nil'), p(4, 3)), rules).total, -100 + 40);
});

test('hand in play does not score', () => {
  const game = { target: 500, rules: STANDARD_RULES, hands: [
    scored(team(p(4, 4), p(0, 0)), team(p(5, 9), p(0, 0))),
    { id: 'y', inPlay: true, teams: [team(p(3, 0), p(0, 0)), team(p(6, 0), p(0, 0, 'nil'))] },
  ] };
  assert.equal(tableBid(game.hands[1]), 9);
  assert.deepEqual(standings(game).map((s) => s.score), [40, 54]);
});

test('bag penalty and winner', () => {
  const game = { target: 200, rules: STANDARD_RULES, hands: [
    scored(team(p(4, 10), p(0, 0)), team(p(3, 3), p(0, 0))),
    scored(team(p(3, 8), p(0, 0)), team(p(5, 5), p(0, 0))),
  ] };
  const s = standings(game);
  assert.equal(s[0].score, 46 + 35 - 100);
  assert.equal(s[0].bags, 1);
  assert.equal(s[0].penalty, 100);
  assert.equal(s[1].score, 80);
  assert.equal(winner(game), null);
  game.hands.push(scored(team(p(2, 2), p(0, 0)), team(p(12, 12), p(0, 0))));
  assert.equal(winner(game), 1);
});
