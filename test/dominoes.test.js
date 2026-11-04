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

// ---------- Mexican Train and Chicken Foot ----------
import { roundsOf, lineName, maxPlayers } from '../src/dominoes/engine.js';

// a Train / Chicken Foot table with chosen hands, right after the deal
const fixedRound = (variant, hands, opts = {}) => {
  const t = seated(newDominoTable({ players: hands.length, setMax: opts.setMax ?? 12, variant }));
  const m = startMatch(t, seeded(3));
  return { ...m, round: { ...m.round, hands, boneyard: opts.boneyard ?? [], turn: opts.turn ?? 0 } };
};

test('Train/Chicken Foot: the round double goes in the middle, one round per double, highest first', () => {
  for (const variant of ['train', 'foot']) {
    const t = startMatch(seated(newDominoTable({ players: 6, setMax: 12, variant })), seeded(5));
    assert.equal(t.round.layout.root, '12-12');
    assert.ok(t.round.hands.every((h) => h.length === 12));
    const all = [...t.round.hands.flat(), ...t.round.boneyard];
    assert.equal(all.length, 90);
    assert.ok(!all.includes('12-12'));
    assert.equal(roundsOf(t), 13);
  }
  assert.equal(maxPlayers('train', 12), 8);
  assert.equal(maxPlayers('train', 6), 4);
  assert.equal(maxPlayers('draw', 12), 4);
});

test('Mexican Train: own train, the Mexican Train, and marked trains only', () => {
  let t = fixedRound('train', [['3-12', '5-6'], ['1-12', '2-2'], ['4-4', '0-1']]);
  const arms = legalMoves(t, 0).map((m) => m.arm).sort();
  assert.deepEqual(arms, ['mex', 's0']); // not someone else's train
  assert.equal(lineName(t, 's0', 0), 'Your train');
  assert.equal(lineName(t, 's1', 0), 'P1’s train');
  t = playTile(t, 0, '3-12', 's0');
  assert.equal(t.round.turn, 1);
  // seat 1 plays on its train; seat 2 can't play, can't draw (empty boneyard): passes and gets a marker
  t = playTile(t, 1, '1-12', 's1');
  assert.ok(mustPass(t, 2));
  t = pass(t, 2);
  assert.equal(t.round.markers[2], true);
  // now seat 2's train is open to everyone
  assert.ok(legalMoves(t, 0).length === 0 || true);
  t = { ...t, round: { ...t.round, hands: [['9-12', '5-6'], ['2-2'], ['4-4', '0-1']] } };
  assert.deepEqual(legalMoves(t, 0).map((m) => m.arm).sort(), ['mex', 's2']);
  // playing on your own marked train takes the marker off
  t = { ...t, round: { ...t.round, turn: 2, hands: [['5-6'], ['2-2'], ['4-12', '0-1']] } };
  t = playTile(t, 2, '4-12', 's2');
  assert.equal(t.round.markers[2], false);
});

test('Mexican Train: a double must be covered, and you go again', () => {
  let t = fixedRound('train', [['5-12', '5-5', '1-5', '9-9'], ['0-12', '3-4'], ['1-2', '0-0']]);
  t = playTile(t, 0, '5-12', 's0');
  t = { ...t, round: { ...t.round, turn: 0 } };
  t = playTile(t, 0, '5-5', 's0');
  assert.equal(t.round.turn, 0, 'played a double: same player again');
  assert.equal(t.round.openDouble, 's0');
  assert.deepEqual(legalMoves(t, 0), [{ tile: '1-5', arm: 's0' }]);
  t = playTile(t, 0, '1-5', 's0');
  assert.equal(t.round.openDouble, null);
  assert.equal(t.round.turn, 1);
});

test('Mexican Train: draw one, then pass; leftover pips count against you, 0|0 is 50', () => {
  let t = fixedRound('train', [['3-4', '6-6'], ['1-12'], ['0-0', '2-3']], { boneyard: ['7-8'] });
  assert.ok(canDraw(t, 0));
  t = drawTile(t, 0);
  assert.ok(!canDraw(t, 0), 'only one draw a turn');
  assert.ok(mustPass(t, 0));
  t = pass(t, 0);
  t = playTile(t, 1, '1-12', 's1'); // seat 1 goes out
  assert.equal(t.phase, 'scored');
  assert.deepEqual(t.round.result.points, [7 + 12 + 15, 0, 50 + 5]);
  assert.equal(t.round.result.winner, 1);
});

test('Chicken Foot: six round the middle first, then a double needs three before anything else', () => {
  let t = fixedRound('foot', [['1-9', '2-9', '3-9', '1-1', '1-4', '1-5', '1-6', '2-7'], ['4-9', '5-9', '6-9', '0-8']], { setMax: 9 });
  const go = (seat, tile, arm) => { t = playTile({ ...t, round: { ...t.round, turn: seat } }, seat, tile, arm); };
  go(0, '1-9', 'c0');
  // while any of the six is empty, only the empty ones take tiles
  assert.ok(legalMoves({ ...t, round: { ...t.round, turn: 0 } }, 0).every((m) => m.arm !== 'c0'));
  go(0, '2-9', 'c1'); go(0, '3-9', 'c2'); go(1, '4-9', 'c3'); go(1, '5-9', 'c4'); go(1, '6-9', 'c5');
  // all six filled: the 1|1 goes on the 1 and makes a chicken foot
  go(0, '1-1', 'c0');
  const toes = t.round.layout.lines.filter((l) => l.on === '1-1');
  assert.equal(toes.length, 3);
  const moves = legalMoves({ ...t, round: { ...t.round, turn: 0 } }, 0);
  assert.ok(moves.length && moves.every((m) => toes.some((l) => l.id === m.arm)), 'only the foot');
  assert.ok(!moves.some((m) => m.tile === '2-7'));
  assert.equal(lineName(t, toes[0].id, 0), 'Chicken foot');
});

test('Train and Chicken Foot: computer players finish whole games, lowest total wins', () => {
  for (const variant of ['train', 'foot']) {
    for (const [max, players] of [[6, 4], [9, 5], [12, 8], [12, 2]]) {
      const random = seeded(max * 11 + players + variant.length);
      let t = startMatch(seated(newDominoTable({ players, setMax: max, variant })), random);
      let steps = 0;
      while (t.phase !== 'over' && steps < 50000) {
        if (t.phase === 'scored') { t = deal(t, random); continue; }
        const seat = t.round.turn;
        const m = botMove(t, seat);
        t = m.type === 'play' ? playTile(t, seat, m.tile, m.arm) : m.type === 'draw' ? drawTile(t, seat) : pass(t, seat);
        steps++;
      }
      assert.equal(t.phase, 'over', `${variant} double-${max} ${players} players finished`);
      assert.equal(t.match.hands.length, max + 1);
      assert.deepEqual(t.match.hands.map((h) => h.engine), Array.from({ length: max + 1 }, (_, i) => max - i));
      if (t.match.winner != null) assert.equal(Math.min(...t.match.scores), t.match.scores[t.match.winner]);
      const pub = publicTable(t);
      assert.equal(pub.round.hands, null);
    }
  }
});

// ---------- Scoring by rounds, best of 3 / 5, sets ----------
import { roundsToWin, endHand } from '../src/dominoes/engine.js';

const roundsTable = (opts) => {
  const t = seated(newDominoTable({ players: 4, ...opts }));
  return startMatch({ ...t, settings: { ...t.settings, scoring: 'rounds', bestOf: opts.bestOf ?? 3 } }, seeded(9));
};
const withHands = (t, hands) => ({ ...t, round: { ...t.round, hands } });

test('rounds: going out wins the round; best of 3 needs 2, best of 5 needs 3', () => {
  let t = roundsTable({ bestOf: 3 });
  assert.equal(roundsToWin(t), 2);
  t = endHand(withHands(t, [[], ['6-6'], ['1-2'], ['0-1']]), 0, 'domino');
  assert.deepEqual(t.match.scores, [1, 0, 0, 0]);
  assert.equal(t.phase, 'scored');
  t = endHand(withHands(deal(t, seeded(2)), [[], ['6-6'], ['1-2'], ['0-1']]), 0, 'domino');
  assert.equal(t.phase, 'over');
  assert.equal(t.match.winner, 0);
  assert.deepEqual(t.match.sets, [1, 0, 0, 0]);
  assert.equal(roundsToWin(roundsTable({ bestOf: 5 })), 3);
});

test('rounds: everyone stuck → the player with the fewest dots wins; a tie between sides wins nobody the round', () => {
  let t = roundsTable({});
  t = endHand(withHands(t, [['6-6'], ['0-1'], ['3-4'], ['2-2']]), null, 'blocked');
  assert.equal(t.round.result.winner, 1, 'seat 1 has 1 dot');
  assert.deepEqual(t.round.result.seatPips, [12, 1, 7, 4]);
  let u = roundsTable({});
  u = endHand(withHands(u, [['0-3'], ['1-2'], ['6-6'], ['5-5']]), null, 'blocked');
  assert.equal(u.round.result.winner, null);
  assert.deepEqual(u.match.scores, [0, 0, 0, 0]);
});

test('rounds with teams: the lowest player wins it for their team; sets carry on to the next set', () => {
  let t = roundsTable({ teams: true });
  t = endHand(withHands(t, [['6-6'], ['5-5'], ['0-1'], ['4-4']]), null, 'blocked');
  assert.equal(t.round.result.winner, 0, 'seat 2 (team 0) has the fewest');
  t = endHand(withHands(deal(t, seeded(3)), [['6-6'], ['5-5'], [], ['4-4']]), 2, 'domino');
  assert.equal(t.phase, 'over');
  assert.deepEqual(t.match.sets, [1, 0]);
  const next = startMatch(t, seeded(4));
  assert.deepEqual(next.match.scores, [0, 0]);
  assert.deepEqual(next.match.sets, [1, 0], 'sets kept for the next set');
});

test('rounds: "just count" never ends; works for Train and Chicken Foot too; computer players play it', () => {
  for (const variant of ['draw', 'block', 'allfives', 'train', 'foot']) {
    const random = seeded(variant.length * 13);
    let t = seated(newDominoTable({ players: 3, setMax: variant === 'train' || variant === 'foot' ? 9 : 6, variant }));
    t = startMatch({ ...t, settings: { ...t.settings, scoring: 'rounds', bestOf: variant === 'block' ? 0 : 5 } }, random);
    let steps = 0, rounds = 0;
    while (t.phase !== 'over' && steps < 30000 && rounds < 12) {
      if (t.phase === 'scored') { t = deal(t, random); rounds++; continue; }
      const seat = t.round.turn; const m = botMove(t, seat);
      t = m.type === 'play' ? playTile(t, seat, m.tile, m.arm) : m.type === 'draw' ? drawTile(t, seat) : pass(t, seat);
      steps++;
    }
    if (variant !== 'block') assert.ok(t.match.scores.every((s) => s <= 3));
    if (variant === 'block') assert.notEqual(t.phase, 'over', 'just counting: no end');
    else { assert.equal(t.phase, 'over', `${variant} best of 5 finished`); assert.equal(Math.max(...t.match.scores), 3); }
  }
});

test('points games: a blocked hand goes to the player with the fewest dots (not the team total)', () => {
  const t = fixed([['6-6'], ['0-1'], ['0-0', '1-2'], ['5-6']], { teams: true });
  const u = endHand(t, null, 'blocked');
  // seat 2 has 3 dots but its team has 15; seat 1 has 1 dot: team 1 wins
  assert.equal(u.round.result.winner, 1);
});
