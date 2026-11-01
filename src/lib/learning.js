// Learns from the scorekeeper's corrections. The card reader gives every card a score; each time a
// checked 13-card hand is sent, we remember (scores, the real hand). From that history this fits a
// small per-card adjustment on this phone: cards the reader tends to miss with your deck and light
// get picked at lower scores, cards it tends to imagine need higher ones, and look-alike mix-ups
// (say 6♣ read as 9♣) are offered as suggestions.
import { FULL_DECK, parseCard } from './cards.js';

const KEY = 'spades-card-learning';
const MAX_EXAMPLES = 150;

// Starting point before any corrections: a card is picked at score 0.5 and suggested from about 0.36.
const PRIOR = { w: 10, b: -5 };
const PICK = 0.5;
const SUGGEST = 0.2;
// How firmly each card holds to the starting point. Evidence adds up across hands, so a card needs
// a couple of corrections that agree before it changes; one odd photo only nudges it.
const HOLD_BIAS = 0.3;
const HOLD_SLOPE = 0.05;
const NEWTON_STEPS = 25;

const sigmoid = (z) => 1 / (1 + Math.exp(-z));

/**
 * For each card fit p(in hand) = sigmoid((10 + dw) * score - 5 + db) to the remembered hands, with
 * (dw, db) held toward 0. Two numbers per card, solved directly with Newton's method.
 */
function fitCard(points) {
  let dw = 0;
  let db = 0;
  for (let i = 0; i < NEWTON_STEPS; i++) {
    let gw = HOLD_SLOPE * dw;
    let gb = HOLD_BIAS * db;
    let hww = HOLD_SLOPE;
    let hbb = HOLD_BIAS;
    let hwb = 0;
    for (const [s, y] of points) {
      const p = sigmoid((PRIOR.w + dw) * s + PRIOR.b + db);
      const v = p * (1 - p);
      gw += (p - y) * s;
      gb += p - y;
      hww += v * s * s;
      hbb += v;
      hwb += v * s;
    }
    const det = hww * hbb - hwb * hwb;
    const stepW = (hbb * gw - hwb * gb) / det;
    const stepB = (hww * gb - hwb * gw) / det;
    // Keep each step modest so it never overshoots.
    const scale = Math.min(1, 3 / Math.max(Math.abs(stepW), Math.abs(stepB), 1e-9));
    dw -= stepW * scale;
    db -= stepB * scale;
    if (Math.abs(stepW) + Math.abs(stepB) < 1e-6) break;
  }
  return { dw, db };
}

/** Learn this phone's per-card adjustments from remembered (scores, real hand) pairs. */
export function fit(examples) {
  const model = { w: PRIOR.w, b: PRIOR.b, dw: {}, db: {} };
  for (const c of FULL_DECK) {
    const points = examples.map((ex) => [ex.scores[c] ?? 0, ex.hand.includes(c) ? 1 : 0]);
    const { dw, db } = points.length ? fitCard(points) : { dw: 0, db: 0 };
    model.dw[c] = dw;
    model.db[c] = db;
  }
  model.confusions = confusions(examples);
  return model;
}

export const chance = (model, card, score) =>
  sigmoid((model.w + (model.dw[card] ?? 0)) * score + model.b + (model.db[card] ?? 0));

const lookAlike = (a, b) => {
  const x = parseCard(a);
  const y = parseCard(b);
  return x.rank === y.rank || x.suit.id === y.suit.id;
};

/** Count "read X but it was really Y" for look-alike cards (same rank or same suit). */
function confusions(examples) {
  const counts = {};
  for (const ex of examples) {
    const hand = new Set(ex.hand);
    const wrong = FULL_DECK.filter((c) => !hand.has(c) && (ex.scores[c] ?? 0) >= PICK);
    const missed = ex.hand.filter((c) => (ex.scores[c] ?? 0) < PICK);
    for (const x of wrong) {
      for (const y of missed) {
        if (!lookAlike(x, y)) continue;
        counts[x] ??= {};
        counts[x][y] = (counts[x][y] ?? 0) + 1;
      }
    }
  }
  return counts;
}

/**
 * Turn reader scores into { cards, unsure, mixups }: picked cards (at most 13), ones to double-check,
 * and [read, maybe-really] pairs this phone has learned the reader confuses.
 */
export function pickCards(scores, model) {
  const ranked = FULL_DECK
    .map((c) => ({ c, p: chance(model, c, scores[c] ?? 0) }))
    .sort((a, b) => b.p - a.p);
  const cards = ranked.filter((x) => x.p >= PICK).slice(0, 13).map((x) => x.c);
  // If the reader saw X and X has really been Y at least twice before, ask about Y.
  const mixups = [];
  for (const [x, ys] of Object.entries(model.confusions ?? {})) {
    if ((scores[x] ?? 0) < PICK) continue;
    for (const [y, count] of Object.entries(ys)) {
      if (count >= 2 && !cards.includes(y)) mixups.push([x, y]);
    }
  }
  const likely = ranked.filter((x) => x.p >= SUGGEST && !cards.includes(x.c)).map((x) => x.c);
  const fromMixups = mixups.map(([, y]) => y);
  const unsure = [...new Set([...fromMixups, ...likely])].slice(0, Math.max(13 - cards.length, fromMixups.length));
  return { cards, unsure, mixups };
}

// ----- Storage on this phone -----

export function loadExamples() {
  try {
    return JSON.parse(localStorage.getItem(KEY))?.examples ?? [];
  } catch {
    return [];
  }
}

export function rememberHand(scores, hand) {
  if (hand.length !== 13) return;
  const examples = [...loadExamples(), { scores, hand, at: Date.now() }].slice(-MAX_EXAMPLES);
  try { localStorage.setItem(KEY, JSON.stringify({ examples })); } catch { /* storage full: skip */ }
  cached = null;
}

export function forgetLearning() {
  try { localStorage.removeItem(KEY); } catch { /* nothing to forget */ }
  cached = null;
}

let cached = null;
/** The fitted model for this phone's history (refit only when the history changes). */
export function learnedModel() {
  if (!cached) {
    const examples = loadExamples();
    cached = { model: fit(examples), count: examples.length };
  }
  return cached;
}
