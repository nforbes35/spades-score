// Dominoes engine (pure, like the Spades one in lib/online.js): sets, dealing, legal moves, playing, drawing,
// passing, the end of a hand and scoring. The host's device runs it; the others see publicTable().
//
// Games ("variant"):
//   draw     – one line off the first tile; if you can't play, draw from the boneyard until you can.
//   block    – the same, but no drawing: if you can't play, you pass.
//   allfives – Draw with a spinner (a double played first opens all four sides) and points whenever the open ends
//              add up to a multiple of 5 (Muggins).
// Sets: double-6, 9 or 12. Sides: every person for themselves, or two teams of two (partners across).
//
// A tile is "lo-hi" (e.g. "4-6"). The layout is a root tile and arms off it: L and R, and for a spinner U and
// D once L and R both have a tile. Each placed tile is { t, inner, outer }: `inner` matches what it joined.

export const VARIANTS = {
  draw: { name: 'Draw', draws: true, spinner: false, fives: false, target: 100 },
  block: { name: 'Block', draws: false, spinner: false, fives: false, target: 100 },
  allfives: { name: 'All Fives', draws: true, spinner: true, fives: true, target: 150 },
};
export const SETS = [6, 9, 12];

export const tileId = (a, b) => (a <= b ? `${a}-${b}` : `${b}-${a}`);
export const halves = (t) => t.split('-').map(Number);
export const pips = (t) => { const [a, b] = halves(t); return a + b; };
export const isDouble = (t) => { const [a, b] = halves(t); return a === b; };

/** Every tile in a double-`max` set (28, 55 or 91 tiles). */
export function fullSet(max) {
  const out = [];
  for (let a = 0; a <= max; a++) for (let b = a; b <= max; b++) out.push(tileId(a, b));
  return out;
}

/** Tiles each player starts with, for a set and number of players (draw games keep some in the boneyard). */
export function handSize(max, players, variant = 'draw') {
  if (max === 6) return players === 2 ? 7 : players === 3 ? (variant === 'block' ? 9 : 6) : (variant === 'block' ? 7 : 5);
  if (max === 9) return players <= 4 ? 9 : players <= 6 ? 7 : 6;
  return players <= 4 ? 12 : players <= 6 ? 11 : 10;
}

export function shuffle(list, random = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** The sides that score: each seat on its own, or two teams (seats 0 & 2, 1 & 3). */
export const sideOf = (table, seat) => (table.settings.teams ? seat % 2 : seat);
export const sideCount = (table) => (table.settings.teams ? 2 : table.seats.length);

/** A new table: seats (null = empty) and settings. */
export function newDominoTable({ players = 4, setMax = 6, variant = 'draw', teams = false, target } = {}) {
  return {
    game: 'dominoes',
    phase: 'lobby',
    seats: Array.from({ length: players }, () => null),
    settings: { setMax, variant, teams: teams && players === 4, target: target ?? VARIANTS[variant].target, turnTimer: 0 },
    match: null,
    round: null,
  };
}

/** Start the match (scores at 0) and deal the first hand. */
export function startMatch(table, random = Math.random) {
  const sides = sideCount(table);
  const match = { id: `${Date.now().toString(36)}${Math.floor(random() * 1e6).toString(36)}`, hands: [], scores: Array(sides).fill(0), lastWinner: null };
  return deal({ ...table, match }, random);
}

/** Deal a new hand. The first hand (or after a blocked hand with no winner) starts with the highest double. */
export function deal(table, random = Math.random) {
  const { setMax, variant } = table.settings;
  const n = table.seats.length;
  const tiles = shuffle(fullSet(setMax), random);
  const size = handSize(setMax, n, variant);
  const hands = table.seats.map((_, s) => tiles.slice(s * size, (s + 1) * size));
  const boneyard = tiles.slice(n * size);
  let turn = table.match.lastWinner;
  let mustPlay = null;
  if (turn == null) {
    // the highest double in anyone's hand opens (or the heaviest tile if nobody has a double)
    const all = hands.flatMap((h, s) => h.map((t) => ({ t, s })));
    const doubles = all.filter((x) => isDouble(x.t)).sort((x, y) => pips(y.t) - pips(x.t));
    const first = doubles[0] ?? [...all].sort((x, y) => pips(y.t) - pips(x.t))[0];
    turn = first.s;
    mustPlay = first.t;
  }
  return {
    ...table,
    phase: 'playing',
    round: { hands, boneyard, layout: null, turn, mustPlay, passes: 0, moves: 0, last: null, dealtAt: Date.now(), result: null },
  };
}

// ---------- the layout ----------

/** The open arms and the number each needs. */
export function openEnds(table) {
  const lay = table.round.layout;
  if (!lay) return [];
  const [ra, rb] = halves(lay.root);
  const end = (arm, fallback) => (lay.arms[arm]?.length ? lay.arms[arm].at(-1).outer : fallback);
  const out = [{ arm: 'L', value: end('L', ra) }, { arm: 'R', value: end('R', rb) }];
  // a spinner opens up and down once both its sides have a tile
  if (lay.spinner && lay.arms.L?.length && lay.arms.R?.length) out.push({ arm: 'U', value: end('U', ra) }, { arm: 'D', value: end('D', ra) });
  return out;
}

/** All Fives: the open ends added up (a double on an end counts both halves). */
export function endsTotal(table) {
  const lay = table.round.layout;
  if (!lay) return 0;
  const [ra, rb] = halves(lay.root);
  const L = lay.arms.L ?? [], R = lay.arms.R ?? [];
  if (!L.length && !R.length) return ra + rb;
  const count = (arm) => {
    const list = lay.arms[arm] ?? [];
    if (!list.length) return isDouble(lay.root) ? ra * 2 : arm === 'L' ? ra : rb;
    const last = list.at(-1);
    return last.inner === last.outer ? last.outer * 2 : last.outer;
  };
  let total = count('L') + count('R');
  for (const arm of ['U', 'D']) if (lay.arms[arm]?.length) total += count(arm);
  return total;
}

/** The moves `seat` can make now: [{ tile, arm }] (arm null = the first tile of the hand). */
export function legalMoves(table, seat) {
  const r = table.round;
  if (!r || table.phase !== 'playing' || r.turn !== seat) return [];
  const hand = r.hands[seat];
  if (!r.layout) return (r.mustPlay ? hand.filter((t) => t === r.mustPlay) : hand).map((tile) => ({ tile, arm: null }));
  const ends = openEnds(table);
  const out = [];
  for (const tile of hand) {
    const [a, b] = halves(tile);
    for (const { arm, value } of ends) if (a === value || b === value) out.push({ tile, arm });
  }
  return out;
}

export const canDraw = (table, seat) => {
  const r = table.round;
  return VARIANTS[table.settings.variant].draws && r.turn === seat && r.boneyard.length > 0 && legalMoves(table, seat).length === 0;
};
export const mustPass = (table, seat) => table.round.turn === seat && legalMoves(table, seat).length === 0 && !canDraw(table, seat);

const nextSeat = (table, seat) => (seat + 1) % table.seats.length;

/** Play `tile` on `arm` (any arm it fits when arm is omitted). Throws with a plain reason if it can't. */
export function playTile(table, seat, tile, arm) {
  const r = table.round;
  if (table.phase !== 'playing') throw new Error('The hand is over.');
  if (r.turn !== seat) throw new Error('It’s not your turn.');
  const moves = legalMoves(table, seat).filter((m) => m.tile === tile);
  if (!moves.length) throw new Error(r.layout ? 'That tile doesn’t match an open end.' : `Start with the ${tile.replace('-', '|')}.`);
  const move = arm === undefined ? moves[0] : moves.find((m) => m.arm === arm);
  if (!move) throw new Error('That tile doesn’t fit there.');

  const hands = r.hands.map((h, s) => (s === seat ? h.filter((t) => t !== tile) : h));
  let layout;
  if (!r.layout) {
    layout = { root: tile, spinner: VARIANTS[table.settings.variant].spinner && isDouble(tile), arms: { L: [], R: [], U: [], D: [] } };
  } else {
    const value = openEnds(table).find((e) => e.arm === move.arm).value;
    const [a, b] = halves(tile);
    const placed = { t: tile, inner: value, outer: a === value ? b : a };
    layout = { ...r.layout, arms: { ...r.layout.arms, [move.arm]: [...r.layout.arms[move.arm], placed] } };
  }
  let next = { ...table, round: { ...r, hands, layout, mustPlay: null, passes: 0, moves: r.moves + 1, turn: nextSeat(table, seat), last: { seat, tile, arm: move.arm, at: Date.now() } } };

  // All Fives: the open ends add up to a multiple of 5 → that many points
  if (VARIANTS[table.settings.variant].fives) {
    const total = endsTotal(next);
    if (total > 0 && total % 5 === 0) next = addPoints(next, sideOf(table, seat), total, { seat, kind: 'fives', points: total });
  }
  if (!hands[seat].length) return endHand(next, seat, 'domino');
  return next;
}

/** Draw one tile from the boneyard (only when you can't play). */
export function drawTile(table, seat) {
  if (!canDraw(table, seat)) throw new Error(VARIANTS[table.settings.variant].draws ? 'You can play, or the boneyard is empty.' : 'No drawing in this game.');
  const r = table.round;
  const [tile, ...boneyard] = r.boneyard;
  return { ...table, round: { ...r, boneyard, hands: r.hands.map((h, s) => (s === seat ? [...h, tile] : h)), last: { seat, drew: true, at: Date.now() } } };
}

/** Pass (only when you can't play or draw). When everyone has passed in a row, the hand is blocked. */
export function pass(table, seat) {
  if (!mustPass(table, seat)) throw new Error('You can still play or draw.');
  const r = table.round;
  const passes = r.passes + 1;
  const next = { ...table, round: { ...r, passes, turn: nextSeat(table, seat), last: { seat, passed: true, at: Date.now() } } };
  if (passes >= table.seats.length) return endHand(next, null, 'blocked');
  return next;
}

/** Points to a side during the hand (All Fives), kept in the round and added to the match at the end. */
function addPoints(table, side, points, event) {
  const r = table.round;
  const scored = [...(r.scored ?? Array(sideCount(table)).fill(0))];
  scored[side] += points;
  return { ...table, round: { ...r, scored, events: [...(r.events ?? []), event] } };
}

/**
 * The hand is over: someone went out ('domino'), or nobody can move ('blocked': the side with the fewest pips
 * wins; a tie means nobody does). The winning side scores the other sides' pips (All Fives: rounded to 5).
 */
export function endHand(table, outSeat, reason) {
  const r = table.round;
  const sides = sideCount(table);
  const seatPips = r.hands.map((h) => h.reduce((sum, t) => sum + pips(t), 0));
  const sidePips = Array(sides).fill(0);
  seatPips.forEach((p, s) => { sidePips[sideOf(table, s)] += p; });
  let winner = null;
  if (reason === 'domino') winner = sideOf(table, outSeat);
  else {
    const low = Math.min(...sidePips);
    const lows = sidePips.map((p, i) => (p === low ? i : -1)).filter((i) => i >= 0);
    if (lows.length === 1) winner = lows[0];
  }
  const fives = VARIANTS[table.settings.variant].fives;
  const points = [...(r.scored ?? Array(sides).fill(0))];
  if (winner != null) {
    let won = sidePips.reduce((sum, p, i) => (i === winner ? sum : sum + p), 0);
    if (reason === 'blocked') won -= sidePips[winner];
    if (fives) won = Math.round(won / 5) * 5;
    points[winner] += Math.max(0, won);
  }
  const scores = table.match.scores.map((s, i) => s + points[i]);
  const hand = { reason, winner, outSeat, points, seatPips, at: Date.now() };
  const top = Math.max(...scores);
  const champ = top >= table.settings.target && scores.filter((s) => s === top).length === 1 ? scores.indexOf(top) : null;
  return {
    ...table,
    phase: champ != null ? 'over' : 'scored',
    round: { ...r, result: hand },
    match: {
      ...table.match,
      hands: [...table.match.hands, hand],
      scores,
      lastWinner: reason === 'domino' ? outSeat : null,
      winner: champ,
    },
  };
}

/** What everyone may see: hands and the boneyard become counts (each player gets their own hand separately). */
export function publicTable(table) {
  if (!table.round) return table;
  const r = table.round;
  return { ...table, round: { ...r, hands: null, boneyard: null, counts: r.hands.map((h) => h.length), boneyardCount: r.boneyard.length } };
}

/** A computer player's move: the heaviest tile that fits (All Fives: the one scoring most), else draw/pass. */
export function botMove(table, seat) {
  const moves = legalMoves(table, seat);
  if (moves.length) {
    const fives = VARIANTS[table.settings.variant].fives;
    const value = (m) => {
      let v = pips(m.tile);
      if (fives) {
        try {
          const t = endsTotal(playTile(table, seat, m.tile, m.arm));
          if (t % 5 === 0) v += t * 3;
        } catch { /* not playable */ }
      }
      return v + (isDouble(m.tile) ? 2 : 0);
    };
    const best = [...moves].sort((x, y) => value(y) - value(x))[0];
    return { type: 'play', tile: best.tile, arm: best.arm };
  }
  if (canDraw(table, seat)) return { type: 'draw' };
  return { type: 'pass' };
}
