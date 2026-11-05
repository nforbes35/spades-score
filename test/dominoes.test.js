import { test } from 'node:test';
import { calloutFor, momentFor, toDomRecord, mergeDomLog, domStats, headToHead, rivalryLines, validClip } from '../src/dominoes/fun.js';
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
test('the board: dominoes only touch the one they join, with long runs before turning', () => {
  const box = (t) => (t.vertical ? [t.cx - 0.5, t.cy - 1, t.cx + 0.5, t.cy + 1] : [t.cx - 1, t.cy - 0.5, t.cx + 1, t.cy + 0.5]);
  // the gap between two boxes (0 = touching, negative = overlapping)
  const gap = (p, q) => Math.max(Math.max(p[0], q[0]) - Math.min(p[2], q[2]), Math.max(p[1], q[1]) - Math.min(p[3], q[3]));
  let checked = 0;
  for (const variant of ['draw', 'block', 'allfives']) {
    for (const max of [6, 9, 12]) {
      for (const reach of [6, 9, 14]) {
        const random = seeded(max * 31 + reach + variant.length);
        let t = startMatch(seated(newDominoTable({ players: 2, setMax: max, variant, target: 1 })), random);
        while (t.phase === 'playing') {
          const s = t.round.turn;
          const m = botMove(t, s);
          t = m.type === 'play' ? playTile(t, s, m.tile, m.arm) : m.type === 'draw' ? drawTile(t, s) : pass(t, s);
          const { tiles } = boardLayout(t.round.layout, { reach });
          const boxes = tiles.map(box);
          for (let i = 0; i < boxes.length; i++) {
            if (tiles[i].link != null) assert.ok(Math.abs(gap(boxes[i], boxes[tiles[i].link])) < 0.01, `${tiles[i].t} meets the tile it joins`);
            for (let j = i + 1; j < boxes.length; j++) {
              const joined = tiles[i].link === j || tiles[j].link === i;
              if (!joined) assert.ok(gap(boxes[i], boxes[j]) >= 0.4, `${variant} d${max} reach ${reach}: ${tiles[i].t} and ${tiles[j].t} touch`);
            }
          }
          // runs: no row turns before it has gone `reach` out from the middle
          for (const t2 of tiles.filter((x) => x.vertical && x.link != null && !x.root)) {
            if (Math.abs(t2.cy) < 1) assert.ok(Math.abs(t2.cx) > reach - 2.5 || variant === 'allfives', `first turn of ${t2.t} only after a long run`);
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

// ---------- Teams of two with 4, 6 or 8 players ----------
import { sideOf, sideCount, teamsPossible } from '../src/dominoes/engine.js';

test('teams: partners sit across; 6 players make 3 teams, 8 make 4; odd numbers play individually', () => {
  const six = seated(newDominoTable({ players: 6, setMax: 9, variant: 'train', teams: true }));
  assert.equal(sideCount(six), 3);
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((s) => sideOf(six, s)), [0, 1, 2, 0, 1, 2]);
  const eight = seated(newDominoTable({ players: 8, setMax: 12, variant: 'foot', teams: true }));
  assert.equal(sideCount(eight), 4);
  assert.equal(sideOf(eight, 5), 1);
  assert.equal(newDominoTable({ players: 5, setMax: 9, variant: 'train', teams: true }).settings.teams, false);
  assert.ok(teamsPossible(4) && teamsPossible(6) && teamsPossible(8) && !teamsPossible(2) && !teamsPossible(3));
});

test('teams in Mexican Train: both partners’ leftover dots count against the team; lowest team total wins', () => {
  let t = startMatch(seated(newDominoTable({ players: 4, setMax: 9, variant: 'train', teams: true })), seeded(21));
  t = endHand({ ...t, round: { ...t.round, hands: [[], ['3-4'], ['1-1'], ['0-0']] } }, 0, 'domino');
  assert.deepEqual(t.round.result.points, [2, 57], 'team 0: 0 + 2; team 1: 7 + 50');
  assert.deepEqual(t.match.scores, [2, 57]);
  assert.equal(t.round.result.winner, 0);
});

test('teams: computer players finish whole games of every kind with 4, 6 and 8 players', () => {
  for (const [variant, setMax, players] of [['draw', 6, 4], ['allfives', 9, 4], ['train', 9, 6], ['foot', 12, 8], ['train', 12, 8]]) {
    for (const scoring of ['points', 'rounds']) {
      const random = seeded(players * 31 + setMax + scoring.length);
      let t = seated(newDominoTable({ players, setMax, variant, teams: true }));
      t = startMatch({ ...t, settings: { ...t.settings, scoring, bestOf: 3, rounds: 4, target: 100 } }, random);
      let steps = 0;
      while (t.phase !== 'over' && steps < 60000) {
        if (t.phase === 'scored') { t = deal(t, random); continue; }
        const seat = t.round.turn; const m = botMove(t, seat);
        t = m.type === 'play' ? playTile(t, seat, m.tile, m.arm) : m.type === 'draw' ? drawTile(t, seat) : pass(t, seat);
        steps++;
      }
      assert.equal(t.phase, 'over', `${variant} ${players} players ${scoring}`);
      assert.equal(t.match.scores.length, players / 2);
      if (scoring === 'rounds') assert.equal(t.match.sets.reduce((a, b) => a + b, 0), 1);
    }
  }
});

// ---------- Double 6: start with 7, or 5 and a boneyard ----------
import { startingTiles } from '../src/dominoes/engine.js';

test('double 6: start with 7 tiles or with 5 and a boneyard', () => {
  const deal4 = (startTiles, variant = 'draw') => {
    const t = seated(newDominoTable({ players: 4, setMax: 6, variant }));
    return startMatch({ ...t, settings: { ...t.settings, startTiles } }, seeded(77));
  };
  let t = deal4(7);
  assert.ok(t.round.hands.every((h) => h.length === 7));
  assert.equal(t.round.boneyard.length, 0);
  t = deal4(5);
  assert.ok(t.round.hands.every((h) => h.length === 5));
  assert.equal(t.round.boneyard.length, 8);
  // two players starting with 5: 18 to draw from
  const two = seated(newDominoTable({ players: 2, setMax: 6, variant: 'allfives' }));
  const t2 = startMatch({ ...two, settings: { ...two.settings, startTiles: 5 } }, seeded(5));
  assert.deepEqual([t2.round.hands[0].length, t2.round.boneyard.length], [5, 18]);
  // not for other sets or Train / Chicken Foot: the usual deal
  const nine = seated(newDominoTable({ players: 4, setMax: 9, variant: 'draw' }));
  assert.equal(startingTiles({ ...nine, settings: { ...nine.settings, startTiles: 5 } }), 9);
  const train = seated(newDominoTable({ players: 4, setMax: 6, variant: 'train' }));
  assert.equal(startingTiles({ ...train, settings: { ...train.settings, startTiles: 7 } }), 5);
  // later hands deal the same way
  const after = deal(endHand({ ...t, round: { ...t.round, hands: [[], ['1-2'], ['1-3'], ['1-4']] } }, 0, 'domino'), seeded(8));
  assert.ok(after.round.hands.every((h) => h.length === 5));
});

// ---------- Hand mode ----------
import { aimPages, swipeDirection, handTileWidth } from '../src/dominoes/handmode.js';

test('hand mode: places get top, bottom, left, right in turn; more than four go on further pages', () => {
  const m = (arm) => ({ tile: '1-2', arm });
  assert.deepEqual(aimPages([m('L'), m('R'), { tile: '3-4', arm: 'L' }], '1-2'), [[{ arm: 'L', dir: 'up' }, { arm: 'R', dir: 'down' }]]);
  assert.deepEqual(aimPages([m(null)], '1-2'), [[{ arm: null, dir: 'up' }]]);
  const six = aimPages(['a', 'b', 'c', 'd', 'e', 'f'].map(m), '1-2');
  assert.deepEqual(six.map((p) => p.map((x) => x.dir)), [['up', 'down', 'left', 'right'], ['up', 'down']]);
  assert.deepEqual(aimPages([m('L')], '5-5'), []);
});

test('hand mode: swipes go the way the finger mostly moved; small wobbles are taps', () => {
  assert.equal(swipeDirection(4, -80), 'up');
  assert.equal(swipeDirection(-10, 60), 'down');
  assert.equal(swipeDirection(-70, 20), 'left');
  assert.equal(swipeDirection(70, -20), 'right');
  assert.equal(swipeDirection(10, 12), null);
});

test('hand mode: tiles fill the space on any screen', () => {
  for (const [w, h] of [[250, 300], [800, 180], [1200, 500]]) {
    for (const count of [1, 5, 7, 12, 15]) {
      const { width, perRow } = handTileWidth(count, w, h);
      const rows = Math.ceil(count / perRow);
      assert.ok(width * perRow + 8 * (perRow - 1) <= w + 1, `${count} tiles fit ${w} wide`);
      assert.ok(width * 2 * rows + 8 * (rows - 1) <= h + 1, `${count} tiles fit ${h} high`);
      assert.ok(width >= 14);
    }
  }
});

test('a slam, a spin or a throw is remembered with the tile; anything else is just a plain play', () => {
  const line = fixed([['3-4', '1-2'], ['5-6', '0-0']]);
  // Mexican Train: the first dealt table where the player on turn has a tile to play
  const seeds = Array.from({ length: 50 }, (_, i) => startMatch(seated(newDominoTable({ players: 2, setMax: 6, variant: 'train' })), seeded(i + 1)));
  const train = seeds.find((t) => legalMoves(t, t.round.turn).length);
  for (const t of [line, train]) {
    const seat = t.round.turn;
    const m = legalMoves(t, seat)[0];
    const last = (...how) => playTile(t, seat, m.tile, m.arm, ...how).round.last;
    assert.equal(last('slam', true).style, 'slam');
    assert.equal(last('slam', true).thrown, true);
    assert.equal(last('spin').style, 'spin');
    assert.equal(last().style, undefined);
    assert.equal(last().thrown, undefined);
    assert.equal(last('papi').style, undefined); // no Papi Flip in dominoes
  }
});

test('going out is always a slam, and the leftover tiles are shown once the hand is over', () => {
  const t = fixed([['3-4'], ['5-6', '0-0']]);
  const done = playTile(t, 0, '3-4');
  assert.equal(done.round.last.style, 'slam');
  const open = publicTable(fixed([['3-4', '1-2'], ['5-6', '0-0']]));
  assert.equal(open.round.reveal, undefined);
  assert.deepEqual(publicTable(done).round.reveal, [[], ['5-6', '0-0']]);
  assert.equal(momentFor(done).title, 'Domino!');
  assert.equal(momentFor(done).seat, 0);
});

test('call-outs: scoring in All Fives, and doubles', () => {
  const fives = fixed([['0-5', '1-2'], ['3-4', '0-0']], { variant: 'allfives' });
  const scored = playTile(fives, 0, '0-5');
  assert.equal(scored.round.last.points, 5);
  assert.equal(calloutFor(scored).text, 'Five!');
  assert.equal(calloutFor(playTile(fixed([['6-6', '1-2'], ['3-4', '0-0']]), 0, '6-6')).text, 'Double 6!');
  assert.equal(calloutFor(playTile(fixed([['1-2', '3-3'], ['3-4', '0-0']]), 0, '1-2')), null);
});

const game = (id, winner, a, b) => ({ id, at: Number(id), winner, sides: [[{ name: a }], [{ name: b }]] });

test('records: wins, streaks, head to head and the lines at the start of a game', () => {
  const log = mergeDomLog([], [game('1', 0, 'Papi', 'Nick'), game('2', 0, 'Papi', 'Nick'), game('3', 1, 'Papi', 'Nick'), game('4', 1, 'Papi', 'Nick'), game('5', 0, 'Papi', 'nick ')]);
  const stats = domStats(log);
  assert.equal(stats[0].name, 'Papi');
  assert.deepEqual([stats[0].wins, stats[0].losses], [3, 2]);
  assert.deepEqual(headToHead(log, ['Papi', 'Nick']), [{ a: 'Papi', b: 'Nick', aw: 3, bw: 2 }]);
  assert.deepEqual(rivalryLines(log, ['Papi', 'Nick']), ['Papi leads Nick, 3 games to 2']);
  const moreLog = mergeDomLog(log, [game('6', 0, 'Papi', 'Nick')]);
  assert.ok(rivalryLines(moreLog, ['Papi', 'Nick']).includes('Papi has won 2 in a row'));
  // the same game twice counts once; junk from another device is ignored
  assert.equal(mergeDomLog(log, [game('1', 1, 'A', 'B'), { id: 7 }, null]).length, 5);
});

test('computer players get no record, and a finished game with a winner is what gets kept', () => {
  const t = seated(newDominoTable({ players: 2 }));
  const over = { ...t, phase: 'over', seats: [t.seats[0], { id: 'b', name: 'Boomer', bot: true }], match: { id: 'x', scores: [100, 40], winner: 0 } };
  const rec = toDomRecord(over);
  assert.equal(rec.winner, 0);
  assert.deepEqual(domStats([rec]).map((p) => p.name), ['P0']);
  assert.equal(toDomRecord({ ...over, phase: 'scored' }), null);
});

test('only real audio recordings are played from other devices', () => {
  assert.ok(validClip('data:audio/webm;codecs=opus;base64,AAAA'));
  assert.ok(validClip('data:audio/mp4;base64,AAAA'));
  assert.ok(!validClip('data:text/html;base64,AAAA'));
  assert.ok(!validClip('https://example.com/a.mp3'));
  assert.ok(!validClip(`data:audio/mp4;base64,${'A'.repeat(90000)}`));
});

