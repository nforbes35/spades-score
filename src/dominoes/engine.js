// Dominoes engine (pure, like the Spades one in lib/online.js): sets, dealing, legal moves, playing, drawing,
// passing, the end of a hand and scoring. The host's device runs it; the others see publicTable().
//
// Games ("variant"):
//   draw     – one line off the first tile; if you can't play, draw from the boneyard until you can.
//   block    – the same, but no drawing: if you can't play, you pass.
//   allfives – Draw with a spinner (a double played first opens all four sides) and points whenever the open ends
//              add up to a multiple of 5 (Muggins).
//   train    – Mexican Train: the round's double sits in the middle; everyone has their own train off it, plus the
//              shared Mexican Train. Play on your own train, the Mexican Train, or anyone's train with a marker
//              on it (you get a marker when you can't play). Play a double and you go again, and the double must
//              be covered before anything else. Draw one tile when you can't play.
//   foot     – Chicken Foot: six tiles go round the middle double before anything else; after that, any double
//              played makes a "chicken foot": three tiles must go on it before play goes on anywhere else.
//   Both play one round per double, from the highest down; leftover pips count against you (the 0|0 is 50) and
//   the lowest total wins.
// Sets: double-6, 9 or 12. Sides: every person for themselves, or teams of two (partners across the table)
// with 4, 6 or 8 players.
// Scoring ("scoring"): 'points' (above), or 'rounds': each hand is a round, won by whoever goes out or, when
// nobody can play, by the player with the fewest dots left. Best of 3 or 5 ("bestOf"; 0 = just keep count), and
// each best-of won is a set: sets carry on from one match to the next ("Next set").
//
// A tile is "lo-hi" (e.g. "4-6"). The layout is a root tile and arms off it: L and R, and for a spinner U and
// D once L and R both have a tile. Each placed tile is { t, inner, outer }: `inner` matches what it joined.
// Train and Chicken Foot use { root, lines: [{ id, start, tiles, owner?, closed?, on? }] } instead: each line
// starts from `start` (the middle double's number, or a chicken foot's double) and `arm` is the line's id.

import { tr, langMsg } from '../lib/i18n.js';

export const VARIANTS = {
  draw: { name: 'Draw', kind: 'line', draws: true, spinner: false, fives: false, target: 100 },
  block: { name: 'Block', kind: 'line', draws: false, spinner: false, fives: false, target: 100 },
  allfives: { name: 'All Fives', kind: 'line', draws: true, spinner: true, fives: true, target: 150 },
  train: { name: 'Mexican Train', kind: 'train', draws: true, drawOne: true, lowWins: true },
  foot: { name: 'Chicken Foot', kind: 'foot', draws: true, drawOne: true, lowWins: true },
};
export const kindOf = (table) => VARIANTS[table.settings.variant].kind;
/** The most players a game takes (the line games go round a 4-seat table; double-6 has too few tiles for more). */
export const maxPlayers = (variant, setMax) => (VARIANTS[variant].kind === 'line' || setMax === 6 ? 4 : 8);
/** Rounds in a Train or Chicken Foot game (one per double, highest first, unless the host picked fewer). */
export const roundsOf = (table) => Math.min(table.settings.setMax + 1, table.settings.rounds ?? table.settings.setMax + 1);
/** Leftover pips at the end of a Train or Chicken Foot round (the double blank counts 50). */
const penalty = (t) => (t === '0-0' ? 50 : pips(t));
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
  if (VARIANTS[variant].kind !== 'line') {
    if (max === 6) return players === 2 ? 7 : players === 3 ? 6 : 5;
    if (max === 9) return players <= 3 ? 12 : players === 4 ? 10 : players <= 6 ? 8 : 6;
    return players <= 4 ? 15 : players <= 6 ? 12 : 10;
  }
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

/** Teams of two are possible with an even number of players, 4 or more. */
export const teamsPossible = (players) => players >= 4 && players % 2 === 0;
/**
 * The sides that score: each seat on its own, or teams of two with partners across the table
 * (4 players: seats 0 & 2, 1 & 3; 6 players: 0 & 3, 1 & 4, 2 & 5; 8 players: 0 & 4 …).
 */
export const sideOf = (table, seat) => (table.settings.teams ? seat % (table.seats.length / 2) : seat);
export const sideCount = (table) => (table.settings.teams ? table.seats.length / 2 : table.seats.length);

/** A new table: seats (null = empty) and settings. */
export function newDominoTable({ players = 4, setMax = 6, variant = 'draw', teams = false, target } = {}) {
  return {
    game: 'dominoes',
    phase: 'lobby',
    seats: Array.from({ length: players }, () => null),
    settings: { setMax, variant, teams: teams && teamsPossible(players), target: target ?? VARIANTS[variant].target ?? 0, rounds: null, scoring: 'points', bestOf: 3, turnTimer: 0 },
    match: null,
    round: null,
  };
}

/**
 * Tiles each player starts with. Double-6 line games can start with 7 each, or 5 each with the rest in the
 * boneyard (`settings.startTiles`); otherwise the usual number for the set and players.
 */
export function startingTiles(table) {
  const { setMax, variant, startTiles } = table.settings;
  const n = table.seats.length;
  if (setMax === 6 && VARIANTS[variant].kind === 'line' && (startTiles === 7 || startTiles === 5) && startTiles * n <= 28) return startTiles;
  return handSize(setMax, n, variant);
}

/** Start the match (scores at 0) and deal the first hand. */
export function startMatch(table, random = Math.random) {
  const sides = sideCount(table);
  // sets won carry on to the next match (same players and sides)
  const before = table.match?.sets;
  const sets = Array.isArray(before) && before.length === sides ? before : Array(sides).fill(0);
  const match = { id: `${Date.now().toString(36)}${Math.floor(random() * 1e6).toString(36)}`, hands: [], scores: Array(sides).fill(0), lastWinner: null, sets };
  return deal({ ...table, match }, random);
}

/** Deal a new hand. The first hand (or after a blocked hand with no winner) starts with the highest double. */
export function deal(table, random = Math.random) {
  if (kindOf(table) !== 'line') return dealRound(table, random);
  const { setMax, variant } = table.settings;
  const n = table.seats.length;
  const tiles = shuffle(fullSet(setMax), random);
  const size = startingTiles(table);
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

/** Train and Chicken Foot: the round's double goes in the middle, everyone gets a hand, players take turns starting. */
function dealRound(table, random) {
  const { setMax, variant } = table.settings;
  const n = table.seats.length;
  const h = table.match.hands.length;
  const v = setMax - (h % (setMax + 1));
  const root = tileId(v, v);
  const tiles = shuffle(fullSet(setMax).filter((t) => t !== root), random);
  const size = handSize(setMax, n, variant);
  const hands = table.seats.map((_, s) => tiles.slice(s * size, (s + 1) * size));
  const boneyard = tiles.slice(n * size);
  const lines = kindOf(table) === 'train'
    ? [{ id: 'mex', owner: null, start: v, tiles: [] }, ...table.seats.map((_, s) => ({ id: `s${s}`, owner: s, start: v, tiles: [] }))]
    : Array.from({ length: 6 }, (_, i) => ({ id: `c${i}`, start: v, tiles: [], closed: false, on: root }));
  return {
    ...table,
    phase: 'playing',
    round: {
      hands, boneyard, layout: { root, lines, feet: 0 }, turn: h % n, mustPlay: null, passes: 0, moves: 0, last: null,
      dealtAt: Date.now(), result: null, engine: v, markers: Array(n).fill(false), openDouble: null, drew: false,
    },
  };
}

// ---------- the layout ----------

const lineEnd = (line) => (line.tiles.length ? line.tiles.at(-1).outer : line.start);

/** Train and Chicken Foot: the lines `seat` may play on now. */
function playableLines(table, seat) {
  const r = table.round;
  const lines = r.layout.lines;
  if (kindOf(table) === 'train') {
    if (r.openDouble) return lines.filter((l) => l.id === r.openDouble);
    return lines.filter((l) => l.owner == null || l.owner === seat || r.markers[l.owner]);
  }
  const open = lines.filter((l) => !l.closed);
  const empty = open.filter((l) => !l.tiles.length); // the middle's six, or a chicken foot's three, come first
  return empty.length ? empty : open;
}

/** A line's name, as the player whose turn it is would say it ("Your train", "Mexican Train", "Ann’s train"). */
export function lineName(table, arm, seat) {
  const line = table.round?.layout?.lines?.find((l) => l.id === arm);
  if (!line) return '';
  if (kindOf(table) === 'train') {
    if (line.owner == null) return tr('Mexican Train');
    if (line.owner === seat) return tr('Your train');
    const name = table.seats[line.owner]?.name;
    return name ? tr('{name}’s train', { name }) : tr('Their’s train');
  }
  return line.on === table.round.layout.root ? tr('Middle') : tr('Chicken foot');
}

/** The open arms and the number each needs. */
export function openEnds(table) {
  const lay = table.round.layout;
  if (!lay) return [];
  if (lay.lines) return lay.lines.filter((l) => !l.closed).map((l) => ({ arm: l.id, value: lineEnd(l) }));
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
  if (!lay || lay.lines) return 0;
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
  const ends = r.layout.lines ? playableLines(table, seat).map((l) => ({ arm: l.id, value: lineEnd(l) })) : openEnds(table);
  const out = [];
  for (const tile of hand) {
    const [a, b] = halves(tile);
    for (const { arm, value } of ends) if (a === value || b === value) out.push({ tile, arm });
  }
  return out;
}

export const canDraw = (table, seat) => {
  const r = table.round;
  const v = VARIANTS[table.settings.variant];
  return v.draws && r.turn === seat && r.boneyard.length > 0 && !(v.drawOne && r.drew) && legalMoves(table, seat).length === 0;
};
export const mustPass = (table, seat) => table.round.turn === seat && legalMoves(table, seat).length === 0 && !canDraw(table, seat);

const nextSeat = (table, seat) => (seat + 1) % table.seats.length;

/** Play `tile` on `arm` (any arm it fits when arm is omitted). Throws with a plain reason if it can't. */
/** Fancier ways to put a tile down (only the look differs). `thrown`: swiped in from hand mode. */
export const TILE_STYLES = ['slam', 'spin'];

export function playTile(table, seat, tile, arm, style = null, thrown = false) {
  const r = table.round;
  if (table.phase !== 'playing') throw new Error('The hand is over.');
  if (r.turn !== seat) throw new Error('It’s not your turn.');
  const moves = legalMoves(table, seat).filter((m) => m.tile === tile);
  if (!moves.length && r.layout) throw new Error('That tile doesn’t match an open end.');
  // (these reasons go to the player who tried it: plain English, translated where they're shown; this one has a blank)
  if (!moves.length) throw Object.assign(new Error(`Start with the ${tile.replace('-', '|')}.`), { lang: langMsg('Start with the {tile}.', { tile: tile.replace('-', '|') }) });
  const move = arm === undefined ? moves[0] : moves.find((m) => m.arm === arm);
  if (!move) throw new Error('That tile doesn’t fit there.');

  const hands = r.hands.map((h, s) => (s === seat ? h.filter((t) => t !== tile) : h));
  // (your last tile always gets slammed: that's how you go out)
  const flair = { ...(TILE_STYLES.includes(style) ? { style } : {}), ...(thrown ? { thrown: true } : {}), ...(hands[seat].length ? {} : { style: 'slam' }) };
  if (r.layout?.lines) return playOnLine(table, seat, tile, move.arm, hands, flair);
  let layout;
  if (!r.layout) {
    layout = { root: tile, spinner: VARIANTS[table.settings.variant].spinner && isDouble(tile), arms: { L: [], R: [], U: [], D: [] } };
  } else {
    const value = openEnds(table).find((e) => e.arm === move.arm).value;
    const [a, b] = halves(tile);
    const placed = { t: tile, inner: value, outer: a === value ? b : a };
    layout = { ...r.layout, arms: { ...r.layout.arms, [move.arm]: [...r.layout.arms[move.arm], placed] } };
  }
  let next = { ...table, round: { ...r, hands, layout, mustPlay: null, passes: 0, moves: r.moves + 1, turn: nextSeat(table, seat), last: { seat, tile, arm: move.arm, at: Date.now(), ...flair } } };

  // All Fives: the open ends add up to a multiple of 5 → that many points
  if (VARIANTS[table.settings.variant].fives) {
    const total = endsTotal(next);
    if (total > 0 && total % 5 === 0) {
      next = addPoints(next, sideOf(table, seat), total, { seat, kind: 'fives', points: total });
      next = { ...next, round: { ...next.round, last: { ...next.round.last, points: total } } };
    }
  }
  if (!hands[seat].length) return endHand(next, seat, 'domino');
  return next;
}

/** Train and Chicken Foot: put `tile` on the line `arm`. */
function playOnLine(table, seat, tile, arm, hands, flair = {}) {
  const r = table.round;
  const lay = r.layout;
  const line = lay.lines.find((l) => l.id === arm);
  const value = lineEnd(line);
  const [a, b] = halves(tile);
  const placed = { t: tile, inner: value, outer: a === value ? b : a };
  let lines = lay.lines.map((l) => (l.id === arm ? { ...l, tiles: [...l.tiles, placed] } : l));
  let feet = lay.feet ?? 0;
  let turn = nextSeat(table, seat);
  let openDouble = null;
  let markers = r.markers;
  if (kindOf(table) === 'train') {
    if (line.owner === seat && markers[seat]) markers = markers.map((m, i) => (i === seat ? false : m));
    if (a === b) { openDouble = arm; turn = seat; } // a double: cover it, and you go again
  } else if (a === b) {
    // a chicken foot: this line ends here and three new ones start off the double
    feet += 1;
    lines = [...lines.map((l) => (l.id === arm ? { ...l, closed: true } : l)),
      ...['a', 'b', 'c'].map((x) => ({ id: `f${feet}${x}`, start: a, tiles: [], closed: false, on: tile }))];
  }
  const next = {
    ...table,
    round: { ...r, hands, layout: { ...lay, lines, feet }, markers, openDouble, drew: false, passes: 0, moves: r.moves + 1, turn, last: { seat, tile, arm, at: Date.now(), ...flair } },
  };
  if (!hands[seat].length) return endHand(next, seat, 'domino');
  return next;
}

/** Draw one tile from the boneyard (only when you can't play). */
export function drawTile(table, seat) {
  if (!canDraw(table, seat)) throw new Error(VARIANTS[table.settings.variant].draws ? 'You can play, or the boneyard is empty.' : 'No drawing in this game.');
  const r = table.round;
  const [tile, ...boneyard] = r.boneyard;
  return { ...table, round: { ...r, boneyard, drew: true, hands: r.hands.map((h, s) => (s === seat ? [...h, tile] : h)), last: { seat, drew: true, at: Date.now() } } };
}

/** Pass (only when you can't play or draw). When everyone has passed in a row, the hand is blocked. */
export function pass(table, seat) {
  if (!mustPass(table, seat)) throw new Error('You can still play or draw.');
  const r = table.round;
  if (VARIANTS[table.settings.variant].drawOne) {
    // Train / Chicken Foot: a marker goes on your train; the hand is stuck once everyone has passed with no tiles left to draw
    const passes = r.boneyard.length ? 0 : r.passes + 1;
    const markers = kindOf(table) === 'train' ? r.markers.map((m, i) => (i === seat ? true : m)) : r.markers;
    const next = { ...table, round: { ...r, passes, markers, drew: false, turn: nextSeat(table, seat), last: { seat, passed: true, at: Date.now() } } };
    return passes >= table.seats.length ? endHand(next, null, 'blocked') : next;
  }
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
export const byRounds = (table) => table.settings.scoring === 'rounds';
/** Rounds needed to win the set (best of 3: 2, best of 5: 3), or null when just keeping count. */
export const roundsToWin = (table) => (byRounds(table) && table.settings.bestOf ? Math.floor(table.settings.bestOf / 2) + 1 : null);

/** Dots left in each player's hand (Train and Chicken Foot count the 0|0 as 50). */
const handDots = (table) => table.round.hands.map((h) => h.reduce((sum, t) => sum + (VARIANTS[table.settings.variant].lowWins ? penalty(t) : pips(t)), 0));

/**
 * Who won the hand (a side): whoever went out, or when nobody can play, the player with the fewest dots left
 * (null when players on different sides tie for fewest).
 */
function handWinner(table, outSeat, reason, seatPips) {
  if (reason === 'domino') return sideOf(table, outSeat);
  const low = Math.min(...seatPips);
  const sides = new Set(seatPips.map((p, s) => (p === low ? sideOf(table, s) : null)).filter((x) => x != null));
  return sides.size === 1 ? [...sides][0] : null;
}

/** Scoring by rounds: the winner gets a round; the first to enough rounds wins the set (and the match). */
function endByRounds(table, outSeat, reason) {
  const r = table.round;
  const sides = sideCount(table);
  const seatPips = handDots(table);
  const winner = handWinner(table, outSeat, reason, seatPips);
  const points = Array(sides).fill(0);
  if (winner != null) points[winner] = 1;
  const scores = table.match.scores.map((s, i) => s + points[i]);
  const need = roundsToWin(table);
  const champ = need && winner != null && scores[winner] >= need ? winner : null;
  const sets = champ != null ? (table.match.sets ?? Array(sides).fill(0)).map((n, i) => (i === champ ? n + 1 : n)) : table.match.sets;
  const hand = { reason, winner, outSeat, points, seatPips, engine: r.engine, at: Date.now() };
  return {
    ...table,
    phase: champ != null ? 'over' : 'scored',
    round: { ...r, result: hand },
    match: { ...table.match, hands: [...table.match.hands, hand], scores, sets, lastWinner: reason === 'domino' ? outSeat : null, winner: champ },
  };
}

export function endHand(table, outSeat, reason) {
  if (byRounds(table)) return endByRounds(table, outSeat, reason);
  if (VARIANTS[table.settings.variant].lowWins) return endRound(table, outSeat, reason);
  const r = table.round;
  const sides = sideCount(table);
  const seatPips = r.hands.map((h) => h.reduce((sum, t) => sum + pips(t), 0));
  const sidePips = Array(sides).fill(0);
  seatPips.forEach((p, s) => { sidePips[sideOf(table, s)] += p; });
  // nobody can play: the player with the fewest dots left wins the hand for their side
  const winner = handWinner(table, outSeat, reason, seatPips);
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

/** Train / Chicken Foot: everyone adds what's left in their hand; after the last round the lowest total wins. */
function endRound(table, outSeat, reason) {
  const r = table.round;
  const seatPips = r.hands.map((h) => h.reduce((sum, t) => sum + penalty(t), 0));
  const uniqueLow = (list) => { const low = Math.min(...list); return list.filter((x) => x === low).length === 1 ? list.indexOf(low) : null; };
  const winner = handWinner(table, outSeat, reason, seatPips);
  // each side adds what its players have left (teams: both partners' hands)
  const points = Array(sideCount(table)).fill(0);
  seatPips.forEach((p, s) => { points[sideOf(table, s)] += p; });
  const scores = table.match.scores.map((s, i) => s + points[i]);
  const hand = { reason, winner, outSeat, points, seatPips, engine: r.engine, at: Date.now() };
  const done = table.match.hands.length + 1 >= roundsOf(table);
  const champ = done ? uniqueLow(scores) : null;
  return {
    ...table,
    phase: done ? 'over' : 'scored',
    round: { ...r, result: hand },
    match: { ...table.match, hands: [...table.match.hands, hand], scores, lastWinner: null, winner: champ, tie: done && champ == null },
  };
}

/** What everyone may see: hands and the boneyard become counts (each player gets their own hand separately). */
export function publicTable(table) {
  if (!table.round) return table;
  const r = table.round;
  // (once the hand is over everyone's leftover tiles get turned over)
  return { ...table, round: { ...r, hands: null, boneyard: null, counts: r.hands.map((h) => h.length), boneyardCount: r.boneyard.length, ...(r.result ? { reveal: r.hands } : {}) } };
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
