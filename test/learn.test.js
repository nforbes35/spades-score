import test from 'node:test';
import assert from 'node:assert/strict';
import { GAMES } from '../src/learn/rules.js';
import { adviseDomino, judgeDomino, whyNotTile, notedLacks, adviseBid, advisePlay, judgePlay, whyNotCard } from '../src/learn/coach.js';
import { newDominoTable, startMatch, legalMoves, playTile, drawTile, pass, canDraw, botMove, VARIANTS, fullSet } from '../src/dominoes/engine.js';
import { newTable, startGame, placeBid, playCard, legalCards } from '../src/lib/online.js';
import { botBid, botPlay } from '../src/lib/bots.js';

const seeded = (n) => () => { n = (n * 16807) % 2147483647; return (n - 1) / 2147483646; };
const fullWording = (o) => typeof o?.en === 'string' && o.en.length > 0 && typeof o?.es === 'string' && o.es.length > 0;

test('every game has rules in both languages, including how to win', () => {
  assert.deepEqual(GAMES.map((g) => g.id), ['spades', ...Object.keys(VARIANTS)]);
  for (const g of GAMES) {
    assert.ok(fullWording(g.name) && fullWording(g.short), g.id);
    assert.ok(g.sections.some((s) => s.tips), `${g.id} has strategy`);
    for (const s of g.sections) {
      assert.ok(fullWording(s.title), g.id);
      for (const p of s.points) assert.ok(fullWording(p), `${g.id}: ${p.en}`);
    }
  }
});

for (const variant of Object.keys(VARIANTS)) {
  test(`dominoes coach: ${variant} advice is always legal over whole games`, () => {
    for (let seedNo = 1; seedNo <= 25; seedNo++) {
      const random = seeded(seedNo * 7919);
      let table = newDominoTable({ players: 2, setMax: 6, variant });
      table = { ...table, seats: [{ id: 'me', name: 'Me' }, { id: 'bot', name: 'Bot', bot: true }] };
      table = startMatch(table, random);
      let lacks = [];
      for (let steps = 0; steps < 400 && table.phase === 'playing'; steps++) {
        const seat = table.round.turn;
        if (seat === 1) {
          const m = botMove(table, 1);
          if (m.type !== 'play' && table.round.layout && !table.round.layout.lines) lacks = notedLacks(table, lacks);
          table = m.type === 'play' ? playTile(table, 1, m.tile, m.arm) : m.type === 'draw' ? drawTile(table, 1) : pass(table, 1);
          continue;
        }
        const a = adviseDomino(table, 0, lacks);
        assert.ok(fullWording(a.why), JSON.stringify(a));
        assert.ok(!/undefined|NaN/.test(a.why.en + a.why.es), a.why.en);
        const moves = legalMoves(table, 0);
        if (a.type === 'draw') { assert.ok(canDraw(table, 0)); table = drawTile(table, 0); continue; }
        if (a.type === 'pass') { table = pass(table, 0); continue; }
        assert.ok(moves.some((m) => m.tile === a.tile && m.arm === a.arm));
        const pick = moves[Math.floor(random() * moves.length)];
        const verdict = judgeDomino(table, 0, pick, lacks);
        assert.ok(['best', 'fine', 'better'].includes(verdict.rating));
        const wrong = fullSet(6).find((t) => !moves.some((m) => m.tile === t));
        if (wrong) assert.ok(fullWording(whyNotTile(table, 0, wrong)));
        table = playTile(table, 0, pick.tile, pick.arm);
      }
      assert.notEqual(table.phase, 'playing', `${variant} seed ${seedNo} finished`);
    }
  });
}

test('coach prefers a scoring move in All Fives and going out always', () => {
  let table = newDominoTable({ players: 2, setMax: 6, variant: 'allfives' });
  table = startMatch({ ...table, seats: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B', bot: true }] }, seeded(5));
  const r = { ...table.round, turn: 0, mustPlay: null, hands: [['1-2', '0-6', '5-5'], ['3-3']], layout: { root: '4-6', spinner: false, arms: { L: [], R: [], U: [], D: [] } }, boneyard: [] };
  // ends 4 and 6: 6|0 on the 6 leaves 4 and 0 (no score); there's nothing else that fits but it must be the 0-6
  assert.equal(adviseDomino({ ...table, round: r }, 0).tile, '0-6');
  const out = { ...table.round, turn: 0, mustPlay: null, hands: [['0-6'], ['3-3']], layout: r.layout, boneyard: [] };
  assert.match(adviseDomino({ ...table, round: out }, 0).why.en, /last tile/);
});

test('spades coach: bid and play advice stay legal through whole hands', () => {
  for (let seedNo = 1; seedNo <= 25; seedNo++) {
    const random = seeded(seedNo * 104729);
    let table = newTable({ target: 500 });
    table = { ...table, seats: [0, 1, 2, 3].map((s) => ({ id: `p${s}`, name: `P${s}`, bot: s > 0 })) };
    table = startGame(table, random);
    while (table.phase === 'bidding') {
      const s = table.round.turn;
      const b = adviseBid(table.round.hands[s]);
      assert.ok(fullWording(b.why));
      assert.ok(!/undefined|NaN/.test(b.why.en + b.why.es));
      const pick = botBid(table.round.hands[s]);
      table = placeBid(table, s, pick);
    }
    while (table.phase === 'playing') {
      const s = table.round.turn;
      if (s > 0) { table = playCard(table, s, botPlay(table, s)); continue; }
      const options = legalCards(table, 0);
      const a = advisePlay(table, 0);
      assert.ok(options.includes(a.card));
      assert.ok(fullWording(a.why), a.card);
      assert.ok(!/undefined|NaN/.test(a.why.en + a.why.es), a.why.en);
      const pick = options[Math.floor(random() * options.length)];
      assert.ok(['best', 'fine', 'better'].includes(judgePlay(table, 0, pick).rating));
      const bad = table.round.hands[0].find((c) => !options.includes(c));
      if (bad) assert.ok(fullWording(whyNotCard(table, 0, bad)));
      table = playCard(table, 0, pick);
    }
    assert.ok(['scored', 'over'].includes(table.phase));
  }
});
