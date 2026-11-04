import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fullSet, handSize, newDominoTable, startMatch, legalMoves, playTile, drawTile, pass, openEnds, endsTotal,
  publicTable, botMove, canDraw, mustPass, pips,
} from '../src/dominoes/engine.js';

// a seeded random, so tests deal the same every time
const seeded = (seed) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const seated = (t) => ({ ...t, seats: t.seats.map((_, i) => ({ id: `p${i}`, name: `P${i}` })) });
// a table with chosen hands and an empty layout, for exact situations
const fixed = (hands, opts = {}) => {
  const t = seated(newDominoTable({ players: hands.length, ...opts }));
  const m = startMatch(t, seeded(1));
  return { ...m, round: { ...m.round, hands, boneyard: opts.boneyard ?? [], layout: null, turn: opts.turn ?? 0, mustPlay: null, passes: 0, scored: undefined } };
};

test('sets: 28, 55 and 91 tiles', () => {
  assert.equal(fullSet(6).length, 28);
  assert.equal(fullSet(9).length, 55);
  assert.equal(fullSet(12).length, 91);
  assert.equal(new Set(fullSet(12)).size, 91);
});

test('dealing: right hand sizes, everyone different tiles, highest double opens', () => {
  for (const [max, players, variant] of [[6, 2, 'draw'], [6, 4, 'block'], [9, 3, 'allfives'], [12, 4, 'draw']]) {
    const t = startMatch(seated(newDominoTable({ players, setMax: max, variant })), seeded(max * 10 + players));
    const r = t.round;
    assert.ok(r.hands.every((h) => h.length === handSize(max, players, variant)));
    const all = [...r.hands.flat(), ...r.boneyard];
    assert.equal(all.length, fullSet(max).length);
    assert.equal(new Set(all).size, all.length);
    assert.ok(r.hands[r.turn].includes(r.mustPlay));
    assert.deepEqual(legalMoves(t, r.turn).map((m) => m.tile), [r.mustPlay]);
  }
});

test('playing a line: tiles must match an open end', () => {
  let t = fixed([['6-6', '6-3', '1-2'], ['3-5', '0-0', '4-4']]);
  t = playTile(t, 0, '6-6');
  assert.deepEqual(openEnds(t).map((e) => e.value), [6, 6]);
  assert.throws(() => playTile(t, 1, '0-0'), /match/);
  assert.equal(t.round.turn, 1);
  t = { ...t, round: { ...t.round, turn: 0 } };
  t = playTile(t, 0, '6-3', 'R');
  assert.deepEqual(openEnds(t).map((e) => e.value), [6, 3]);
  t = { ...t, round: { ...t.round, turn: 1 } };
  t = playTile(t, 1, '3-5');
  assert.deepEqual(openEnds(t).map((e) => e.value), [6, 5]);
});

test('Draw: draw only when stuck; Block: pass instead; everyone stuck = blocked hand', () => {
  let t = fixed([['6-6'], ['1-2']], { variant: 'draw', boneyard: ['0-1', '6-2'] });
  t = playTile(t, 0, '6-6');
  // player 0 went out with their only tile: they score player 1's pips
  assert.equal(t.round.result.reason, 'domino');
  assert.equal(t.match.scores[0], 3);

  let b = fixed([['6-6', '5-5'], ['1-2', '0-0']], { variant: 'block' });
  b = playTile(b, 0, '6-6');
  assert.ok(mustPass(b, 1));
  assert.ok(!canDraw(b, 1));
  b = pass(b, 1);
  assert.ok(mustPass(b, 0));
  b = pass(b, 0);
  assert.equal(b.round.result.reason, 'blocked');
  // lowest pips (player 1: 3) wins the difference: 10 - 3
  assert.equal(b.round.result.winner, 1);
  assert.equal(b.match.scores[1], 7);

  let d = fixed([['6-6', '1-1'], ['2-3']], { variant: 'draw', boneyard: ['0-1', '2-6'] });
  d = playTile(d, 0, '6-6');
  assert.ok(canDraw(d, 1));
  assert.throws(() => pass(d, 1), /still play or draw/);
  d = drawTile(d, 1);
  assert.equal(d.round.hands[1].length, 2);
  d = drawTile(d, 1); // 0-1 doesn't fit, so draw again
  assert.deepEqual(legalMoves(d, 1).map((m) => m.tile), ['2-6', '2-6']); // fits either end of the 6-6
});

test('All Fives: the spinner opens up and down; multiples of 5 score', () => {
  let t = fixed([['5-5', '5-0', '3-5', '1-2'], ['0-4', '6-6', '2-2', '1-1']], { variant: 'allfives' });
  t = playTile(t, 0, '5-5'); // ends 5+5 = 10 → 10
  assert.equal(endsTotal(t), 10);
  assert.equal(t.round.scored[0], 10);
  t = { ...t, round: { ...t.round, turn: 0 } };
  t = playTile(t, 0, '5-0', 'L'); // 0 + spinner 10 = 10 → 10
  assert.equal(t.round.scored[0], 20);
  t = { ...t, round: { ...t.round, turn: 0 } };
  t = playTile(t, 0, '3-5', 'R'); // 0 + 3 = 3 → nothing; now U and D open
  assert.equal(t.round.scored[0], 20);
  assert.deepEqual(openEnds(t).map((e) => e.arm), ['L', 'R', 'U', 'D']);
});

test('teams: partners score together; the public table hides hands', () => {
  let t = fixed([['6-6'], ['1-2'], ['0-0'], ['3-4']], { teams: true });
  t = playTile(t, 0, '6-6');
  assert.equal(t.round.result.winner, 0);
  assert.equal(t.match.scores[0], 3 + 7); // opponents (seats 1 and 3), not the partner's 0-0
  const pub = publicTable(t);
  assert.equal(pub.round.hands, null);
  assert.deepEqual(pub.round.counts, [0, 1, 1, 1]);
});

test('computer players finish whole matches without breaking the rules', () => {
  for (const variant of ['draw', 'block', 'allfives']) {
    for (const max of [6, 9, 12]) {
      const random = seeded(max * 7 + variant.length);
      let t = startMatch(seated(newDominoTable({ players: max === 6 ? 4 : 3, setMax: max, variant, teams: max === 6, target: 100 })), random);
      let steps = 0;
      while (t.phase !== 'over' && steps < 20000) {
        if (t.phase === 'scored') { t = startMatchHand(t, random); continue; }
        const seat = t.round.turn;
        const m = botMove(t, seat);
        t = m.type === 'play' ? playTile(t, seat, m.tile, m.arm) : m.type === 'draw' ? drawTile(t, seat) : pass(t, seat);
        steps++;
      }
      assert.equal(t.phase, 'over', `${variant} double-${max} finished`);
      assert.ok(Math.max(...t.match.scores) >= 100);
    }
  }
});

import { deal } from '../src/dominoes/engine.js';
const startMatchHand = (t, random) => deal(t, random);

import { boardLayout } from '../src/dominoes/board.js';
test('the board never draws two dominoes on top of each other', () => {
  const box = (t) => (t.vertical ? [t.cx - 0.5, t.cy - 1, t.cx + 0.5, t.cy + 1] : [t.cx - 1, t.cy - 0.5, t.cx + 1, t.cy + 0.5]);
  const overlap = (p, q) => Math.min(p[2], q[2]) - Math.max(p[0], q[0]) > 0.05 && Math.min(p[3], q[3]) - Math.max(p[1], q[1]) > 0.05;
  let checked = 0;
  for (const variant of ['draw', 'block', 'allfives']) {
    for (const max of [6, 9, 12]) {
      for (const reach of [5, 8]) {
        const random = seeded(max * 31 + reach + variant.length);
        let t = startMatch(seated(newDominoTable({ players: 2, setMax: max, variant, target: 1 })), random);
        while (t.phase === 'playing') {
          const s = t.round.turn;
          const m = botMove(t, s);
          t = m.type === 'play' ? playTile(t, s, m.tile, m.arm) : m.type === 'draw' ? drawTile(t, s) : pass(t, s);
          const { tiles } = boardLayout(t.round.layout, { reach });
          const boxes = tiles.map(box);
          for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
            assert.ok(!overlap(boxes[i], boxes[j]), `${variant} d${max} reach ${reach}: ${tiles[i].t} and ${tiles[j].t} overlap`);
          }
          checked++;
        }
      }
    }
  }
  assert.ok(checked > 100);
});
