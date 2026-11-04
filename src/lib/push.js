// "Your turn" alerts: a push notification (with a buzz) when it's your turn and the app isn't on screen.
// This phone subscribes once (after asking permission); the game's host sends the alert through /api/push.
import { useEffect, useState } from 'react';
import { read, write } from './store.js';

// The public half of the push keys (the private half is a Vercel setting).
const VAPID_PUBLIC = 'BFRnIXnEhb_bngp-2j3zEC4Hx_piL3bYvuox-mcJnnJNtTY7kZJ6YfctbIok7F3z1CXBRLTgRZ0W6Xm9lmhYSJc';
const ALERTS_KEY = 'spades-turn-alerts';

export const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** iPhones and iPads only allow notifications for the app added to the Home Screen. */
export const needsHomeScreen = () => {
  if (typeof window === 'undefined') return false;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone;
  return ios && !standalone;
};

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
 * alert; `why` says why alerts can't be turned on here (or null).
 */
export function useTurnAlerts() {
  const [on, setOn] = useState(() => read(ALERTS_KEY) === true);
  const [sub, setSub] = useState(null);
  const why = !pushSupported() ? 'This browser can’t show alerts.' : needsHomeScreen() ? 'Add Family Spades to your Home Screen first (Share → Add to Home Screen), then turn this on from there.' : null;
  useEffect(() => {
    if (on && !why) subscription(false).then(setSub).catch(() => setSub(null));
  }, [on, why]);
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
      if (!s) return 'Alerts are blocked. Allow notifications for Family Spades in Settings, then try again.';
      write(ALERTS_KEY, true);
      setOn(true);
      setSub(s);
      return null;
    } catch {
      return 'Couldn’t turn on alerts on this phone.';
    }
  };
  return { on, sub, toggle, why };
}

/** Host: send one player's phone a "your turn" alert. Returns false if that phone can't be reached any more. */
export async function sendTurnAlert(sub, { title = 'Family Spades', body = 'Your turn', tag = 'turn' } = {}) {
  try {
    const res = await fetch('/api/push', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub, title, body, tag }),
    });
    return res.status !== 410;
  } catch {
    return true;
  }
}
