// The app's language, chosen per device: English or Spanish. The English wording is the key, so tr('Done') reads like
// plain text and anything missing from the Spanish list just shows in English. See "Languages" in CLAUDE.md.
import { createElement, Fragment, useSyncExternalStore } from 'react';
import ES from '../i18n/es.js';

const KEY = 'family-games-lang';
export const LANGS = [{ id: 'en', label: 'English' }, { id: 'es', label: 'Español' }];

const stored = () => { try { return globalThis.localStorage?.getItem(KEY) ?? null; } catch { return null; } };
const deviceLang = () => (/^es\b/i.test(globalThis.navigator?.language ?? '') ? 'es' : 'en');
let lang = stored() === 'es' || stored() === 'en' ? stored() : deviceLang();
const showOnPage = () => { if (globalThis.document) document.documentElement.lang = lang; };
showOnPage();

const listeners = new Set();
export const getLang = () => lang;
export function setLang(next) {
  if (next !== 'en' && next !== 'es') return;
  lang = next;
  try { globalThis.localStorage?.setItem(KEY, next); } catch { /* private mode: lasts until the app closes */ }
  showOnPage();
  listeners.forEach((f) => f());
}
const subscribe = (f) => { listeners.add(f); return () => listeners.delete(f); };
/** Re-draws a component (main.jsx uses it around the whole app) when the language changes. */
export const useLang = () => useSyncExternalStore(subscribe, getLang, getLang);

const wording = (key) => (lang === 'es' && ES[key]) || key;

/** The wording in this device's language, with {name}-style blanks filled in. */
export const tr = (key, params) => {
  const s = wording(key);
  return params ? s.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m)) : s;
};

/** Like tr, but a blank can be a piece of the page (a <b>name</b>, an icon). */
export const tx = (key, params = {}) => createElement(Fragment, null,
  ...wording(key).split(/(\{\w+\})/).map((part) => {
    const m = /^\{(\w+)\}$/.exec(part);
    return m && m[1] in params ? params[m[1]] : part;
  }));

/** Text that goes to other devices is sent as { k, p } (see langMsg, tMsg), so each device shows it in its own language. */
export const langMsg = (k, p) => ({ k, p });
export const tMsg = (m) => (typeof m === 'string' ? tr(m) : m?.k ? tr(m.k, m.p) : '');
