// Translating a line someone typed themselves. The built-in lines have their wording in both languages; these go to
// MyMemory (a free translation service, no account), one line at a time, only when a player's language differs.
const URL_BASE = 'https://api.mymemory.translated.net/get';
const TIMEOUT_MS = 6000;

const ES_WORDS = new Set('el la los las un una unos unas de del que y o en es eso esto esta este estas son soy eres está estás no sí si por para con sin como más muy pero te tu tú tus me mi mis yo se lo le les nos quien quién qué cómo cuándo dónde porque juega juegas jugar voy vas va vamos tienes tengo hay ya ahora nunca siempre todo todos nada mira oye ay dale ganar gano ganas pierdes perdiste abuela abuelo hermano mano ese esa aquí allí bien mal malo buena bueno'.split(' '));
const EN_WORDS = new Set('the a an of and or in is it this that these those are am you your i my me he she we they them to for with without as more very but who what how when where why because play plays playing got get go going have has had there now never always all nothing look win lose lost beat can cant don’t don\'t ain’t ain\'t won’t won\'t good bad at on not yes up out so like'.split(' '));

/** Which language a line is in: 'en', 'es', or `fallback` if it can't tell. */
export function guessLang(text, fallback = 'en') {
  const s = String(text ?? '').toLowerCase();
  let es = /[¿¡ñáéíóúü]/.test(s) ? 2 : 0;
  let en = /['’](t|s|m|re|ll|ve|d)\b/.test(s) ? 2 : 0;
  for (const w of s.split(/[^\p{L}'’]+/u)) {
    if (ES_WORDS.has(w)) es += 1;
    if (EN_WORDS.has(w)) en += 1;
  }
  if (es === en) return fallback;
  return es > en ? 'es' : 'en';
}

const cleaned = (data) => {
  const out = data?.responseData?.translatedText;
  if (Number(data?.responseStatus) !== 200 || typeof out !== 'string') return null;
  if (/MYMEMORY WARNING|QUERY LENGTH|INVALID (LANGUAGE|EMAIL)|PLEASE SELECT/i.test(out)) return null; // the service's errors arrive as "translations"
  const text = out.replace(/^[\s^]+/, '').trim();
  return text || null;
};

const remembered = new Map();
/** The line in language `to`, or null if it couldn't be translated (no internet, the service's daily limit). */
export async function translateText(text, from, to, fetcher = globalThis.fetch) {
  const key = `${from}|${to}|${text}`;
  if (remembered.has(key)) return remembered.get(key);
  try {
    const q = new URLSearchParams({ q: text, langpair: `${from}|${to}` });
    const res = await fetcher(`${URL_BASE}?${q}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    const out = cleaned(await res.json());
    if (out) remembered.set(key, out);
    return out;
  } catch { return null; }
}
