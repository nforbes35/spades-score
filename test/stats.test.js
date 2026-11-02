import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toRecord, mergeIntoLog, computeStats, nameKey } from '../src/lib/stats.js';
import { STANDARD_RULES } from '../src/lib/scoring.js';

const p = (bid, books, call = 'none') => ({ bid, books, call });
const hand = (t0, t1) => ({ id: Math.random().toString(36), inPlay: false, teams: [{ players: t0 }, { players: t1 }] });

/** A game to 100 that team 0 wins in one hand, with a made nil and a failed blind nil. */
function gameA(id, at, names = [['Nick', 'Amy'], ['Joe', 'Sue']]) {
  return {
    ...toRecord({
      id, target: 100, rules: STANDARD_RULES,
      teams: [{ name: 'Us', players: names[0] }, { name: 'Them', players: names[1] }],
      hands: [hand([p(5, 6), p(0, 0, 'nil')], [p(4, 5), p(0, 2, 'blind')])],
    }, { mode: 'table' }),
    finishedAt: at,
  };
}

test('wins, losses, win % and streaks', () => {
  const log = [gameA('g1', 1), gameA('g2', 2), gameA('g3', 3, [['Joe', 'Sue'], ['Nick', 'Amy']])];
  const stats = computeStats(log);
  const nick = stats.find((x) => x.key === 'nick');
  // g1, g2: Nick's team (team 0) wins; g3: Nick is on team 1, team 0 (Joe & Sue) wins.
  assert.equal(nick.games, 3);
  assert.equal(nick.wins, 2);
  assert.equal(nick.losses, 1);
  assert.equal(nick.winPct, 67);
  assert.equal(nick.longestStreak, 2);
  assert.equal(nick.streak, -1);
  assert.deepEqual(nick.recent, ['W', 'W', 'L']);
});

test('nil and blind nil attempts and successes', () => {
  const stats = computeStats([gameA('g1', 1), gameA('g2', 2)]);
  const amy = stats.find((x) => x.key === 'amy');
  const sue = stats.find((x) => x.key === 'sue');
  assert.equal(amy.nil, 2);
  assert.equal(amy.nilMade, 2);
  assert.equal(amy.nilPct, 100);
  assert.equal(sue.blind, 2);
  assert.equal(sue.blindMade, 0);
  assert.equal(sue.blindPct, 0);
});

test('best partner is who you win with most', () => {
  const log = [
    gameA('g1', 1, [['Nick', 'Amy'], ['Joe', 'Sue']]),
    gameA('g2', 2, [['Nick', 'Sue'], ['Joe', 'Amy']]),
    gameA('g3', 3, [['Nick', 'Sue'], ['Joe', 'Amy']]),
  ];
  const nick = computeStats(log).find((x) => x.key === 'nick');
  assert.equal(nick.bestPartner.name, 'Sue');
  assert.equal(nick.bestPartner.wins, 2);
  assert.equal(nick.beatsMost.name, 'Joe');
});

test('names match regardless of case and spaces; computer players aren\'t ranked', () => {
  const g = { ...toRecord({ id: 'b', target: 50, rules: STANDARD_RULES, teams: [{ name: 'A', players: ['nick ', 'Lucky'] }, { name: 'B', players: ['Ace', 'Jack'] }], hands: [hand([p(5, 7), p(3, 3)], [p(2, 3), p(1, 0)])] }, { mode: 'online', bots: ['Lucky', 'Ace', 'Jack'] }), finishedAt: 5 };
  const stats = computeStats([gameA('g1', 1), g]);
  assert.equal(nameKey('  NICK  '), 'nick');
  assert.equal(stats.find((x) => x.key === 'nick').games, 2);
  assert.ok(!stats.some((x) => x.key === 'lucky'), 'bots left off the leaderboard');
  assert.ok(stats.find((x) => x.key === 'nick').partners.some((x) => x.name === 'Lucky' && x.bot));
});

test('unfinished games count hands but not wins or losses', () => {
  const unfinished = { ...toRecord({ id: 'u', target: 500, rules: STANDARD_RULES, teams: [{ name: 'A', players: ['Nick', 'Amy'] }, { name: 'B', players: ['Joe', 'Sue'] }], hands: [hand([p(3, 3), p(0, 0, 'nil')], [p(4, 4), p(2, 3)])] }, { mode: 'table' }), finishedAt: 1 };
  assert.equal(unfinished.finished, false);
  const nick = computeStats([unfinished]).find((x) => x.key === 'nick');
  assert.equal(nick.games, 0);
  assert.equal(nick.unfinished, 1);
  assert.equal(nick.hands, 1);
});

test('merging logs: no duplicates, finished copy wins', () => {
  const unfinished = { ...gameA('g1', 1), finished: false, winner: null };
  let log = mergeIntoLog([], [unfinished]);
  log = mergeIntoLog(log, [gameA('g1', 9), gameA('g2', 2)]);
  assert.equal(log.length, 2);
  assert.equal(log.find((g) => g.id === 'g1').finished, true);
  assert.equal(mergeIntoLog(log, [gameA('g2', 2)]), log, 'nothing new: same log');
});

test('two phones swap logs and end up with every game', async () => {
  const { handleLogMessage, logSummary } = await import('../src/lib/stats.js');
  let phoneA = [gameA('g1', 1), gameA('g2', 2)];
  let phoneB = [gameA('g2', 2), gameA('g3', 3)];
  const outbox = [];
  const send = (msg, to) => outbox.push({ msg, to });
  // A tells B what it has; B sends back what A lacks, and vice versa.
  handleLogMessage({ type: 'log-have', ids: logSummary(phoneA) }, { id: 'A' }, phoneB, send, () => {});
  handleLogMessage({ type: 'log-have', ids: logSummary(phoneB) }, { id: 'B' }, phoneA, send, () => {});
  for (const { msg, to } of outbox) {
    if (to === 'A') handleLogMessage(msg, { id: 'B' }, phoneA, send, (games) => { phoneA = mergeIntoLog(phoneA, games); });
    if (to === 'B') handleLogMessage(msg, { id: 'A' }, phoneB, send, (games) => { phoneB = mergeIntoLog(phoneB, games); });
  }
  assert.deepEqual(phoneA.map((g) => g.id).sort(), ['g1', 'g2', 'g3']);
  assert.deepEqual(phoneB.map((g) => g.id).sort(), ['g1', 'g2', 'g3']);
  assert.equal(outbox.filter((o) => o.msg.type === 'log-games').every((o) => o.msg.games.length === 1), true, 'only missing games are sent');
});
