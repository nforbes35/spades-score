import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tr, setLang, getLang } from '../src/lib/i18n.js';
import ES from '../src/i18n/es.js';
import { guessLang, translateText } from '../src/lib/translate.js';
import { talkFor, TALK_LINES } from '../src/dominoes/fun.js';

const sources = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? sources(p) : /\.jsx?$/.test(f) ? [p] : [];
});
const LITERAL = /\b(?:tr|tx|langMsg)\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g;
const keys = () => {
  const found = new Map();
  for (const f of sources('src')) {
    for (const m of readFileSync(f, 'utf8').matchAll(LITERAL)) {
      const key = (m[1] ?? m[2]).replace(/\\(['"\\])/g, '$1');
      if (!found.has(key)) found.set(key, f);
    }
  }
  return found;
};
const blanks = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join();

test('everything shown through tr() has Spanish wording', () => {
  const missing = [...keys()].filter(([k]) => !ES[k]).map(([k, f]) => `${f}: ${k}`);
  assert.deepEqual(missing, []);
});
test('Spanish wording keeps the same blanks as the English', () => {
  const bad = Object.entries(ES).filter(([k, v]) => blanks(k) !== blanks(v)).map(([k]) => k);
  assert.deepEqual(bad, []);
});
test('tr fills blanks and follows the language; unknown wording stays English', () => {
  const before = getLang();
  ES['Test {a}'] = 'Prueba {a}';
  setLang('en'); assert.equal(tr('Test {a}', { a: 1 }), 'Test 1');
  setLang('es'); assert.equal(tr('Test {a}', { a: 1 }), 'Prueba 1');
  assert.equal(tr('No such wording'), 'No such wording');
  setLang(before);
  delete ES['Test {a}'];
});

test('guessLang tells the two apart and falls back when unsure', () => {
  assert.equal(guessLang('You play like my grandma'), 'en');
  assert.equal(guessLang('Juegas como mi abuela'), 'es');
  assert.equal(guessLang('¡Dale!'), 'es');
  assert.equal(guessLang('Y’all ain’t ready'), 'en');
  assert.equal(guessLang('Papi', 'es'), 'es');
  assert.equal(guessLang('Papi', 'en'), 'en');
});
const reply = (data, ok = true) => async () => ({ ok, json: async () => data });
test('translateText cleans the result and treats the service’s errors as failure', async () => {
  assert.equal(await translateText('a1', 'en', 'es', reply({ responseStatus: 200, responseData: { translatedText: '^ ¿Hola?' } })), '¿Hola?');
  assert.equal(await translateText('a2', 'en', 'es', reply({ responseStatus: 200, responseData: { translatedText: 'MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS' } })), null);
  assert.equal(await translateText('a3', 'en', 'es', reply({ responseStatus: 429, responseData: { translatedText: 'x' } })), null);
  assert.equal(await translateText('a4', 'en', 'es', async () => { throw new Error('offline'); }), null);
});
test('talkFor: built-in lines switch wording; typed lines ask for translation only when needed', () => {
  const l = TALK_LINES[1];
  assert.deepEqual(talkFor({ line: l.id, text: l.es, lang: 'es' }, 'en', guessLang), { text: l.en, original: l.es, needs: null });
  assert.deepEqual(talkFor({ line: l.id, text: l.en, lang: 'en' }, 'en', guessLang), { text: l.en, original: null, needs: null });
  assert.equal(talkFor({ text: 'Juegas como mi abuela', lang: 'es' }, 'en', guessLang).needs, 'es');
  assert.equal(talkFor({ text: 'Juegas como mi abuela', lang: 'en' }, 'en', guessLang).needs, 'es'); // typed in Spanish on an English phone
  assert.equal(talkFor({ text: 'Juegas como mi abuela', lang: 'es' }, 'es', guessLang).needs, null);
});
