// "Your turn" alerts: a push notification (with a buzz) when it's your turn and the app isn't on screen.
// This phone subscribes once (after asking permission); the game's host sends the alert through /api/push.
import { useEffect, useState } from 'react';
import { read, write } from './store.js';
import { tr, useLang } from './i18n.js';
import ES from '../i18n/es.js';

// The public half of the push keys (the private half is a Vercel setting).
const VAPID_PUBLIC = 'BFRnIXnEhb_bngp-2j3zEC4Hx_piL3bYvuox-mcJnnJNtTY7kZJ6YfctbIok7F3z1CXBRLTgRZ0W6Xm9lmhYSJc';
const ALERTS_KEY = 'spades-turn-alerts';

/**
 * An alert's wording in the language of the phone it's going to (not this device's): `text` is the English,
 * or langMsg('{name}, it’s your turn', { name }). Unknown wording goes as it is.
 */
export function alertWording(text, lang) {
  const key = typeof text === 'string' ? text : text?.k ?? '';
  const s = (lang === 'es' && ES[key]) || key;
  return s.replace(/\{(\w+)\}/g, (m, k) => (text?.p && k in text.p ? String(text.p[k]) : m));
}

export const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** iPhones and iPads only allow notifications for the app added to the Home Screen. */
export const needsHomeScreen = () => {
  if (typeof window === 'undefined') return false;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone;
  return ios && !standalone;
};

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error(tr('timed out'))), ms))]);

const keyBytes = (b64) => {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

/** This phone's push subscription (as plain JSON), asking permission first if `ask`; null if not possible. */
async function subscription(ask) {
  if (!pushSupported()) return null;
  if (Notification.permission !== 'granted') {
    if (!ask) return null;
    if ((await Notification.requestPermission()) !== 'granted') return null;
  }
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription())
    ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC) }));
  return sub.toJSON();
}

/**
 * Turn alerts on this phone: { on, sub, toggle, why }. `sub` is shared with the host so it can send the
 * alert, and carries this phone's language (`sub.lang`) so the alert comes worded for it; `why` says why
 * alerts can't be turned on here (or null).
 */
export function useTurnAlerts() {
  const [on, setOn] = useState(() => read(ALERTS_KEY) === true);
  const [sub, setSub] = useState(null);
  const [problem, setProblem] = useState(null); // why signing this phone up failed
  const lang = useLang();
  const why = !pushSupported() ? tr('This browser can’t show alerts.') : needsHomeScreen() ? tr('Add Family Spades to your Home Screen first (Share → Add to Home Screen), then turn this on from there.') : null;
  useEffect(() => {
    if (on && !why) signUp(false);
  }, [on, why]);
  /** Sign this phone up for alerts; returns why it couldn't (or null). */
  const signUp = async (ask) => {
    try {
      const s = await withTimeout(subscription(ask), 15000);
      setSub(s);
      const p = s ? null : Notification.permission === 'denied' ? tr('Notifications are blocked in Settings') : tr('Notifications not allowed yet');
      setProblem(p);
      return p;
    } catch (err) {
      const p = tr('Couldn’t sign up ({why})', { why: err?.message || err });
      setSub(null);
      setProblem(p);
      return p;
    }
  };
  const toggle = async () => {
    if (on) {
      write(ALERTS_KEY, false);
      setOn(false);
      setSub(null);
      return null;
    }
    if (why) return why;
    try {
      const s = await subscription(true);
      if (!s) return tr('Alerts are blocked. Allow notifications for Family Spades in Settings, then try again.');
      write(ALERTS_KEY, true);
      setOn(true);
      setSub(s);
      return null;
    } catch {
      return tr('Couldn’t turn on alerts on this phone.');
    }
  };
  return { on, sub: sub && { ...sub, lang }, toggle, why, problem, retry: () => signUp(true) };
}

/**
 * Send one player's phone a "your turn" alert. Resolves to { ok, gone, why }: `gone` if that phone can't be
 * reached any more, `why` a plain description of what happened (for the test alert). `body` is the English or a
 * langMsg; it goes out in the language of `sub.lang` (English if a phone didn't say).
 */
export async function sendTurnAlert(sub, { title = 'Family Spades', body = 'Your turn', tag = 'turn', delay = 0 } = {}) {
  try {
    const { lang, ...subscription } = sub ?? {};
    const res = await fetch('/api/push', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription, title, body: alertWording(body, lang), tag, delay }),
    });
    let info = {};
    try { info = await res.json(); } catch { /* no body */ }
    const service = /apple/.test(sub?.endpoint) ? 'Apple' : /google/.test(sub?.endpoint) ? 'Google' : tr('the push service');
    if (res.ok) return { ok: true, gone: false, why: tr('Sent: {service} accepted the alert.', { service }) };
    if (res.status === 410) return { ok: false, gone: true, why: tr('{service} says this phone isn’t signed up any more. Turn Turn alerts off and on again.', { service }) };
    if (res.status === 503) return { ok: false, gone: false, why: tr('Alerts aren’t set up on the server yet.') };
    return { ok: false, gone: false, why: tr('Couldn’t send ({detail}).', { detail: `${res.status}${info.detail ? `: ${info.detail}` : ''}` }) };
  } catch {
    return { ok: false, gone: false, why: tr('Couldn’t reach the server to send the alert.') };
  }
}

/** Is this phone allowed to show notifications right now? (for the test alert) */
export const alertPermission = () => (pushSupported() ? Notification.permission : 'unsupported');
