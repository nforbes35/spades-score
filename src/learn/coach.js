// The coach in a practice game: what it would play and why, in both languages, and what it thinks of what you played.
// Pure, like the engines it reads. Each piece of advice is { move, why: { en, es } } with the blanks filled in.
import { VARIANTS, legalMoves, canDraw, playTile, endsTotal, openEnds, pips, isDouble, halves, kindOf } from '../dominoes/engine.js';
import { legalCards, trickWinner, currentHand } from '../lib/online.js';
import { botBid, botPlay } from '../lib/bots.js';
import { parseCard, RANKS } from '../lib/cards.js';
import { seatEntry } from '../lib/table.js';
import { isNil, contractBid, totalBooks } from '../lib/scoring.js';
import { SEATS } from '../lib/table.js';

const show = (t) => t.replace('-', '|');
const both = (en, es) => ({ en, es });

// ---------- Dominoes ----------

/** What's known about who can't match a number: when someone draws or passes, they hold none of the open numbers. */
export const notedLacks = (table, lacks = []) => {
  const values = openEnds(table).map((e) => e.value);
  return [...new Set([...lacks, ...values])];
};

const numbersIn = (tiles) => { const m = {}; tiles.forEach((t) => halves(t).forEach((n) => { m[n] = (m[n] ?? 0) + 1; })); return m; };

/** Scores one move for the seat: higher is better; `why` says the biggest reason. */
function weighMove(table, seat, move, lacks) {
  const variant = VARIANTS[table.settings.variant];
  const rest = table.round.hands[seat].filter((t) => t !== move.tile);
  let after;
  try { after = playTile(table, seat, move.tile, move.arm); } catch { return { value: -1e6, reason: 'heavy' }; }
  if (!rest.length) return { value: 1e5, reason: 'out' };
  const reasons = [];
  const add = (value, reason) => reasons.push({ value, reason });
  add(pips(move.tile), 'heavy');
  if (isDouble(move.tile)) add(5, 'double');
  if (after.phase === 'playing') {
    const ends = openEnds(after).map((e) => e.value);
    const mine = numbersIn(rest);
    const fits = rest.filter((t) => { const [a, b] = halves(t); return ends.includes(a) || ends.includes(b); }).length;
    add(fits * 2.5, 'flex');
    if (variant.fives) {
      const total = endsTotal(after);
      if (total > 0 && total % 5 === 0) add(total * 2, 'score');
    }
    if (lacks.length && ends.length && ends.every((v) => lacks.includes(v))) add(12, 'block');
    if (kindOf(table) === 'train') {
      const [a, b] = halves(move.tile);
      const line = table.round.layout.lines.find((l) => l.id === move.arm);
      if (a === b) {
        const covers = rest.some((t) => halves(t).includes(a));
        add(covers ? 6 : -12, covers ? 'double' : 'heavy');
      }
      if (line?.owner === seat) add(table.round.markers[seat] ? 14 : 3, table.round.markers[seat] ? 'marker' : 'flex');

    }
    if (kindOf(table) === 'foot' && isDouble(move.tile)) {
      const [a] = halves(move.tile);
      add((mine[a] ?? 0) >= 2 ? 8 : -6, 'double');
    }
    if (move.tile === '0-0' && variant.lowWins) add(25, 'zero');
  }
  return { value: reasons.reduce((s, r) => s + r.value, 0), reason: [...reasons].sort((x, y) => y.value - x.value)[0]?.reason ?? 'heavy' };
}

const WHY_TILE = {
  out: (t) => both(`The ${t} is your last tile: play it and you win the hand!`, `El ${t} es tu última ficha: ¡juégala y ganas la mano!`),
  score: (t, table, after) => both(`The ${t} makes the ends add up to ${after}, a multiple of 5, so it scores ${after} points.`, `Con el ${t} los extremos suman ${after}, múltiplo de 5, así que anotas ${after} puntos.`),
  block: (t) => both(`The ${t} leaves numbers the computer has shown it doesn’t have, so it may have to draw or pass.`, `El ${t} deja números que la computadora no tiene, así que quizás tenga que robar o pasar.`),
  double: (t) => both(`Play the ${t} while you can: a double only matches one number, so it’s easily stuck in your hand.`, `Juega el ${t} ahora que puedes: un doble solo coincide con un número, y se queda fácil en tu mano.`),
  flex: (t) => both(`The ${t} leaves numbers your other tiles can play on, so you’ll still have moves next turn.`, `El ${t} deja números donde tus otras fichas pueden jugar, así que tendrás jugadas en tu próximo turno.`),
  heavy: (t) => both(`The ${t} is your heaviest choice. If someone else goes out, those dots count against you, so drop them early.`, `El ${t} es tu opción más pesada. Si otro sale, esos puntos cuentan en tu contra, así que bótalos pronto.`),
  marker: (t) => both(`Playing the ${t} on your own train takes off your marker, so others can’t play there any more.`, `Jugar el ${t} en tu propio tren quita tu marcador, así que los demás ya no pueden jugar ahí.`),
  zero: (t) => both(`Get rid of the ${t} now: it counts 50 against you if it’s still in your hand.`, `Sal del ${t} ahora: cuenta 50 en tu contra si se queda en tu mano.`),
};

/** The coach's pick for a player's turn, or null when it isn't their turn to choose a tile. */
export function adviseDomino(table, seat, lacks = []) {
  const moves = legalMoves(table, seat);
  if (!moves.length) {
    if (canDraw(table, seat)) return { type: 'draw', why: both('Nothing in your hand matches an open end, so draw from the boneyard.', 'Nada en tu mano coincide con un extremo abierto, así que roba del pozo.') };
    return { type: 'pass', why: both('Nothing fits and you can’t draw, so you pass. Knock on the table!', 'Nada sirve y no puedes robar, así que pasas. ¡Toca la mesa!') };
  }
  const only = new Set(moves.map((m) => m.tile)).size === 1;
  const weighed = moves.map((m) => ({ ...m, ...weighMove(table, seat, m, lacks) })).sort((x, y) => y.value - x.value);
  const best = weighed[0];
  const name = show(best.tile);
  if (!table.round.layout && only) return { type: 'play', tile: best.tile, arm: best.arm, value: best.value, forced: true, why: both(`The ${name} has to start this hand.`, `El ${name} tiene que abrir esta mano.`) };
  if (only && best.reason !== 'out') return { type: 'play', tile: best.tile, arm: best.arm, value: best.value, forced: true, why: both(`The ${name} is the only tile that fits.`, `El ${name} es la única ficha que sirve.`) };
  let total = 0;
  if (best.reason === 'score') total = endsTotal(playTile(table, seat, best.tile, best.arm));
  return { type: 'play', tile: best.tile, arm: best.arm, value: best.value, reason: best.reason, why: WHY_TILE[best.reason](name, table, total) };
}

/** After the player picks a move: 'best', 'fine' (close enough), or 'better' with the coach's advice to compare. */
export function judgeDomino(table, seat, move, lacks = []) {
  const best = adviseDomino(table, seat, lacks);
  if (best.type !== 'play' || (best.tile === move.tile && (best.arm === move.arm || move.arm === undefined))) return { rating: 'best', best };
  if (best.tile === move.tile) return { rating: 'fine', best };
  const mine = weighMove(table, seat, move, lacks).value;
  return { rating: best.value - mine <= 4 ? 'fine' : 'better', best };
}

/** Why a tile can't be played right now, in both languages. */
export function whyNotTile(table, seat, tile) {
  const r = table.round;
  const name = show(tile);
  if (!r.layout && r.mustPlay) return both(`This hand has to start with the ${show(r.mustPlay)}, the highest double.`, `Esta mano tiene que abrir con el ${show(r.mustPlay)}, el doble más alto.`);
  if (r.openDouble) return both(`The double has to be covered first, and the ${name} doesn’t match it.`, `Primero hay que cubrir el doble, y el ${name} no coincide.`);
  const values = [...new Set(openEnds(table).map((e) => e.value))].join(', ');
  return both(`The ${name} doesn’t match an open end. You need one of these numbers: ${values}.`, `El ${name} no coincide con un extremo abierto. Necesitas uno de estos números: ${values}.`);
}

// ---------- Spades ----------

const rankOf = (c) => RANKS.indexOf(parseCard(c).rank);
const suitOf = (c) => c.slice(-1);
const card = (c) => { const { rank, suit } = parseCard(c); return `${rank}${suit.sym}`; };

/** What the coach would bid, and how it counted: { bid, call, why }. */
export function adviseBid(cards) {
  const pick = botBid(cards);
  const aces = cards.filter((c) => rankOf(c) === 12);
  const spades = cards.filter((c) => suitOf(c) === 'S');
  const kings = cards.filter((c) => rankOf(c) === 11 && suitOf(c) !== 'S');
  if (pick.call === 'nil') return { bid: 0, call: 'nil', why: both('You have no high cards at all, so you could try Nil: promise to win nothing, for 100 points.', 'No tienes cartas altas, así que podrías intentar Nil: prometes no ganar nada, por 100 puntos.') };
  const bits = { en: [], es: [] };
  if (aces.length) { bits.en.push(`${aces.length} ace${aces.length > 1 ? 's' : ''}`); bits.es.push(`${aces.length} ${aces.length > 1 ? 'ases' : 'as'}`); }
  if (kings.length) { bits.en.push(`${kings.length} king${kings.length > 1 ? 's' : ''}`); bits.es.push(`${kings.length} ${kings.length > 1 ? 'reyes' : 'rey'}`); }
  bits.en.push(`${spades.length} spade${spades.length === 1 ? '' : 's'}`);
  bits.es.push(`${spades.length} ${spades.length === 1 ? 'pica' : 'picas'}`);
  return {
    bid: pick.bid, call: 'none',
    why: both(`You hold ${bits.en.join(', ')}. Aces and long spades are your likely books, so I’d bid ${pick.bid}.`, `Tienes ${bits.es.join(', ')}. Los ases y muchas picas son tus bazas probables, así que yo apostaría ${pick.bid}.`),
  };
}

const teamNeed = (table, seat) => {
  const hand = currentHand(table);
  const t = hand.teams[SEATS[seat][0]];
  return { need: contractBid(t) - totalBooks(t), bid: contractBid(t), took: totalBooks(t) };
};

/** The coach's pick for a Spades turn: { card, why }. */
export function advisePlay(table, seat) {
  const pick = botPlay(table, seat);
  const options = legalCards(table, seat);
  const r = table.round;
  const name = card(pick);
  const only = options.length === 1;
  if (only) return { card: pick, forced: true, why: both(`The ${name} is the only card you can play.`, `El ${name} es la única carta que puedes jugar.`) };
  const me = seatEntry(currentHand(table), seat);
  if (isNil(me.call)) return { card: pick, why: both(`You went Nil, so stay under the others: the ${name} is the safest way not to win this book.`, `Apostaste Nil, así que quédate por debajo: el ${name} es lo más seguro para no ganar esta baza.`) };
  const { need } = teamNeed(table, seat);
  if (!r.trick.length) {
    if (rankOf(pick) === 12) return { card: pick, why: both(`Lead your ${name}: an ace of a side suit is your surest book, before someone runs out of that suit and trumps it.`, `Abre con tu ${name}: el as de otro palo es tu baza más segura, antes de que alguien se quede sin ese palo y lo corte con pica.`) };
    return { card: pick, why: both(`Lead the ${name}: low cards from your longest suit keep your winners safe for later.`, `Abre con el ${name}: las cartas bajas de tu palo más largo guardan tus ganadoras para después.`) };
  }
  const winningNow = trickWinner(r.trick);
  const partner = (seat + 2) % 4;
  const wouldWin = trickWinner([...r.trick, { seat, card: pick }]) === seat;
  if (winningNow === partner && !wouldWin) return { card: pick, why: both(`Your partner is winning this book, so don’t waste a good card. Play your low ${name}.`, `Tu compañero va ganando esta baza, así que no gastes una carta buena. Juega tu ${name}.`) };
  if (wouldWin && r.trick.length === 3) return { card: pick, why: both(`You’re last to play, so win it with the cheapest card that does the job: the ${name}.`, `Juegas de último, así que gana con la carta más barata que alcance: el ${name}.`) };
  if (wouldWin && suitOf(pick) === 'S' && suitOf(r.trick[0].card) !== 'S') return { card: pick, why: both(`You’re out of that suit, so a spade wins it: trump with the ${name}.`, `Ya no tienes ese palo, así que una pica gana: corta con el ${name}.`) };
  if (wouldWin) return { card: pick, why: both(`The ${name} can win this book${need > 0 ? `, and your team still needs ${need}` : ''}.`, `El ${name} puede ganar esta baza${need > 0 ? `, y a tu equipo todavía le faltan ${need}` : ''}.`) };
  return { card: pick, why: both(`You can’t win this one, so throw your lowest card, the ${name}, and keep the good ones.`, `Esta no la puedes ganar, así que bota tu carta más baja, el ${name}, y guarda las buenas.`) };
}

/** Judges a card you played against the coach's pick: 'best', 'fine' or 'better'. */
export function judgePlay(table, seat, chosen) {
  const best = advisePlay(table, seat);
  if (chosen === best.card) return { rating: 'best', best };
  const r = table.round;
  const wins = (c) => (r.trick.length ? trickWinner([...r.trick, { seat, card: c }]) === seat : rankOf(c) === 12);
  const close = wins(chosen) === wins(best.card) && Math.abs(rankOf(chosen) - rankOf(best.card)) <= 2 && suitOf(chosen) === suitOf(best.card);
  return { rating: close ? 'fine' : 'better', best };
}

/** Why a card can't be played, in both languages. */
export function whyNotCard(table, seat, c) {
  const r = table.round;
  if (r.trick.length) {
    const led = r.trick[0].card;
    const name = { D: ['diamonds', 'diamantes'], C: ['clubs', 'tréboles'], H: ['hearts', 'corazones'], S: ['spades', 'picas'] }[suitOf(led)];
    return both(`You have ${name[0]}, so you must follow suit and play one.`, `Tienes ${name[1]}, así que debes seguir el palo y jugar una.`);
  }
  return both('Spades aren’t broken yet: you can’t lead them until someone has played one on another suit.', 'Las picas aún no están rotas: no puedes abrir con ellas hasta que alguien juegue una sobre otro palo.');
}
