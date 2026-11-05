// The fun around the game: what gets called out, the family's records and rivalries, and the lines people
// throw at each other. Nothing here changes who wins.
import { read, write } from '../lib/store.js';
import { nameKey } from '../lib/stats.js';
import { kindOf, sideOf, byRounds, VARIANTS, halves } from './engine.js';
import { tr, langMsg } from '../lib/i18n.js';

const WORDS = { 5: 'Five', 10: 'Ten', 15: 'Fifteen', 20: 'Twenty', 25: 'Twenty-five', 30: 'Thirty', 35: 'Thirty-five', 40: 'Forty', 45: 'Forty-five', 50: 'Fifty', 55: 'Fifty-five', 60: 'Sixty' };

/** What gets called out for the tile just played (null: nothing special). Worked out on each device, in its language. */
export function calloutFor(table) {
  const r = table.round;
  const last = r?.last;
  if (!last?.tile || r.result) return null;
  if (last.points) return { text: tr('{word}!', { word: tr(WORDS[last.points] ?? String(last.points)) }), sub: `+${last.points}`, big: last.points >= 20 };
  const [a, b] = halves(last.tile);
  if (a !== b) return null;
  const kind = kindOf(table);
  if (kind === 'train') return { text: tr('Double!'), sub: tr('Cover it 🚂') };
  if (kind === 'foot') return { text: tr('Chicken foot!'), sub: '🐔' };
  return a >= 5 ? { text: tr('Double {n}!', { n: a }) } : null;
}

/** The big moment at the end of a hand: its headline, who it's about, and whether to throw confetti. Each device works it out, in its language. */
export function momentFor(table) {
  const res = table.round?.result;
  if (!res) return null;
  const { match, seats } = table;
  const over = table.phase === 'over' && match.winner != null;
  const shutout = over && !VARIANTS[table.settings.variant].lowWins && match.scores.every((sc, i) => i === match.winner || sc === 0);
  let seat = res.outSeat ?? null;
  if (res.reason !== 'domino') {
    const pips = res.seatPips ?? [];
    const onSide = pips.map((p, s) => ({ p, s })).filter(({ s }) => res.winner != null && sideOf(table, s) === res.winner);
    seat = onSide.length ? onSide.sort((x, y) => x.p - y.p)[0].s : null;
  }
  const name = seat != null ? seats[seat]?.name : null;
  const title = shutout ? tr('Shut out!') : res.reason === 'domino' ? tr('Domino!') : tr('Blocked!');
  const sub = res.reason === 'domino' ? tr('{name} is out of tiles', { name })
    : name ? tr('Nobody can play. {name} has the fewest dots', { name })
      : tr('Nobody can play, and it’s a tie');
  return { title, sub: byRounds(table) || !shutout ? sub : tr('{sub}, and nobody else scored', { sub }), seat, confetti: res.reason === 'domino' || shutout };
}

// ---------- The record of finished games ----------
const LOG_KEY = 'dominoes-game-log';
const MAX_GAMES = 500;

export const loadDomLog = () => { const l = read(LOG_KEY); return Array.isArray(l) ? l : []; };

/** A finished game reduced to who was on which side and who won. */
export function toDomRecord(table) {
  const { match, seats } = table;
  if (table.phase !== 'over' || match?.winner == null) return null;
  const sides = match.scores.map(() => []);
  seats.forEach((x, s) => { if (x) sides[sideOf(table, s)].push({ name: x.name, bot: Boolean(x.bot) }); });
  return { id: match.id, at: Date.now(), variant: table.settings.variant, setMax: table.settings.setMax, sides, winner: match.winner };
}

const wellFormed = (g) => g && typeof g.id === 'string' && Array.isArray(g.sides) && Number.isInteger(g.winner) && Array.isArray(g.sides[g.winner])
  && g.sides.every((side) => Array.isArray(side) && side.every((p) => typeof p?.name === 'string'));

/** Add games (by id, oldest first), keeping the most recent. */
export function mergeDomLog(log, games) {
  const byId = new Map(log.map((g) => [g.id, g]));
  (Array.isArray(games) ? games : []).filter(wellFormed).forEach((g) => { if (!byId.has(g.id)) byId.set(g.id, g); });
  return [...byId.values()].sort((x, y) => (x.at ?? 0) - (y.at ?? 0)).slice(-MAX_GAMES);
}
export function recordDomGame(table) {
  const rec = toDomRecord(table);
  if (rec) write(LOG_KEY, mergeDomLog(loadDomLog(), [rec]));
}
export function mergeIntoDomLog(games) { write(LOG_KEY, mergeDomLog(loadDomLog(), games)); }

const people = (side) => side.filter((p) => !p.bot);

/** Everyone's numbers: wins, losses, their current run, best first. */
export function domStats(log) {
  const players = new Map();
  [...log].sort((x, y) => (x.at ?? 0) - (y.at ?? 0)).forEach((g) => {
    g.sides.forEach((side, i) => people(side).forEach((p) => {
      const k = nameKey(p.name);
      const x = players.get(k) ?? { key: k, name: p.name, wins: 0, losses: 0, streak: 0 };
      const won = i === g.winner;
      x.name = p.name;
      if (won) x.wins += 1; else x.losses += 1;
      x.streak = won ? Math.max(x.streak, 0) + 1 : Math.min(x.streak, 0) - 1;
      players.set(k, x);
    }));
  });
  return [...players.values()]
    .map((x) => ({ ...x, games: x.wins + x.losses, pct: Math.round((x.wins / (x.wins + x.losses)) * 100) }))
    .sort((x, y) => y.wins - x.wins || y.pct - x.pct || x.name.localeCompare(y.name));
}

/** Head to head between the people at this table: how many games each has beaten the other. */
export function headToHead(log, names) {
  const keys = [...new Set(names.map(nameKey))];
  const shown = new Map(names.map((n) => [nameKey(n), n]));
  const pairs = [];
  keys.forEach((a, i) => keys.slice(i + 1).forEach((b) => {
    let aw = 0, bw = 0;
    log.forEach((g) => {
      const sideOfPerson = (k) => g.sides.findIndex((side) => people(side).some((p) => nameKey(p.name) === k));
      const sa = sideOfPerson(a), sb = sideOfPerson(b);
      if (sa < 0 || sb < 0 || sa === sb) return;
      if (g.winner === sa) aw += 1; else if (g.winner === sb) bw += 1;
    });
    if (aw + bw) pairs.push(aw >= bw ? { a: shown.get(a), b: shown.get(b), aw, bw } : { a: shown.get(b), b: shown.get(a), aw: bw, bw: aw });
  }));
  return pairs.sort((x, y) => y.aw + y.bw - (x.aw + x.bw));
}

/**
 * A couple of lines for the start of a game: "Papi leads Nick, 12 games to 9", "Ann has won 3 in a row". They go in
 * the table for everyone, so they're langMsg values: show them with tMsg.
 */
export function rivalryLines(log, names, most = 3) {
  const lines = headToHead(log, names).slice(0, 2).map(({ a, b, aw, bw }) => {
    if (aw === bw) return aw === 1 ? langMsg('{a} and {b} are tied, {n} game each', { a, b, n: aw }) : langMsg('{a} and {b} are tied, {n} games each', { a, b, n: aw });
    return aw === 1 ? langMsg('{a} leads {b}, {n} game to {m}', { a, b, n: aw, m: bw }) : langMsg('{a} leads {b}, {n} games to {m}', { a, b, n: aw, m: bw });
  });
  const here = new Set(names.map(nameKey));
  domStats(log).filter((p) => here.has(p.key)).forEach((p) => {
    if (p.streak >= 2) lines.push(langMsg('{name} has won {n} in a row', { name: p.name, n: p.streak }));
    else if (p.streak <= -3) lines.push(langMsg('{name} has lost {n} straight and wants revenge', { name: p.name, n: -p.streak }));
  });
  return lines.slice(0, most);
}

// ---------- Trash talk ----------
export const TALK_LINES = [
  { id: 'knock', en: 'Knock knock!', es: '¡Toc, toc!' },
  { id: 'teach', en: 'Who taught you to play?', es: '¿Quién te enseñó a jugar?' },
  { id: 'weep', en: 'Read ’em and weep.', es: 'Míralas y llora.' },
  { id: 'all', en: 'Is that all you got?', es: '¿Eso es todo lo que tienes?' },
  { id: 'ready', en: 'Y’all ain’t ready!', es: '¡No están listos!' },
  { id: 'doctor', en: 'Somebody call a doctor!', es: '¡Que alguien llame a un doctor!' },
  { id: 'papi', en: 'Papi taught me that one.', es: 'Eso me lo enseñó Papi.' },
];
/**
 * What this device shows for a line someone said ({ text, line, lang }): the wording in `myLang`, plus `original` if
 * that's different from what they said. `needs` names the language to translate from when it's a typed line in the
 * other language; `guess` is guessLang from translate.js.
 */
export function talkFor(said, myLang, guess) {
  const built = said.line && TALK_LINES.find((l) => l.id === said.line);
  if (built) {
    const from = said.lang === 'es' ? 'es' : 'en';
    return { text: built[myLang], original: from === myLang ? null : built[from], needs: null };
  }
  const from = guess(said.text, said.lang === 'es' || said.lang === 'en' ? said.lang : myLang);
  return { text: said.text, original: null, needs: from === myLang ? null : from };
}
const TALK_KEY = 'dominoes-talk';
export const MAX_CLIP_CHARS = 80000;
export const validClip = (c) => typeof c === 'string' && c.length <= MAX_CLIP_CHARS && /^data:audio\/[\w.+-]+(;[\w=.+-]+)*;base64,[A-Za-z0-9+/=]+$/.test(c);
export const loadTalk = () => { const t = read(TALK_KEY); return { custom: Array.isArray(t?.custom) ? t.custom : [], clips: t?.clips && typeof t.clips === 'object' ? t.clips : {} }; };
export const saveTalk = (t) => write(TALK_KEY, t);
