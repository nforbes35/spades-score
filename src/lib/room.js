// The live link between every device in a game: the table's phone ("host"), remote players'
// phones ("player"), extra cameras or family watching ("guest"), and TV screens ("tv").
// Online it uses a Supabase Realtime broadcast channel (nothing is stored in a database).
// Without Supabase settings it falls back to BroadcastChannel, which links tabs in the same
// browser: handy for trying remote play on one computer.
//
// Every device says who it is in a heartbeat every few seconds, so each one knows who else is here.
// Messages go to everyone, or to one device when `to` is set.
import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const onlineReady = Boolean(URL && KEY);

const BEAT_MS = 4000;
const GONE_MS = 12000;
const RETRY_MS = 3000;
// Away from the app this long (a locked phone), the connection may have gone stale: reconnect on return.
const SLEEP_MS = 8000;
let client;

/** Four letters, no look-alikes (I/L/O). */
export function makeCode() {
  const letters = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  return Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
}

/** Link that opens the app joined to a game, optionally straight into a role. */
export function joinLink(code, { as, seat } = {}) {
  const q = new URLSearchParams({ join: code });
  if (as) q.set('as', as);
  if (seat != null) q.set('seat', String(seat));
  return `${location.origin}/?${q}`;
}

export const newDeviceId = () => Math.random().toString(36).slice(2, 10);

function openRoom(code, getMe, { onMessage, onPeers, onStatus }) {
  const name = `spades-${code.toUpperCase()}`;
  const peers = new Map();
  let transport;

  const post = (m) => transport.post({ ...m, from: getMe().id });
  const beat = (first = false, to) => post({ type: 'hb', who: getMe(), first, to });
  const publish = () => onPeers([...peers.values()]);

  function receive(m) {
    const me = getMe();
    if (!m || m.from === me.id || (m.to && m.to !== me.id)) return;
    if (m.type === 'bye') {
      if (peers.delete(m.from)) publish();
      return;
    }
    if (m.type === 'hb') {
      const known = peers.get(m.from);
      peers.set(m.from, { ...m.who, id: m.from, seen: Date.now() });
      if (!known || JSON.stringify({ ...known, seen: 0 }) !== JSON.stringify({ ...m.who, id: m.from, seen: 0 })) publish();
      if (m.first) beat(false, m.from); // answer a newcomer right away
      return;
    }
    const known = peers.get(m.from);
    if (known) known.seen = Date.now();
    onMessage(m, known ?? null);
  }

  if (onlineReady) {
    client ??= createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const ch = client.channel(name, { config: { broadcast: { self: false } } });
    ch.on('broadcast', { event: 'msg' }, ({ payload }) => receive(payload));
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') { onStatus('online'); beat(true); }
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') onStatus('error');
      else if (status === 'CLOSED') onStatus('offline');
    });
    transport = {
      post: (m) => ch.send({ type: 'broadcast', event: 'msg', payload: m }).catch(() => {}),
      close: () => client.removeChannel(ch),
    };
  } else {
    const bc = new BroadcastChannel(name);
    bc.onmessage = (e) => receive(e.data);
    transport = { post: (m) => bc.postMessage(m), close: () => bc.close() };
    setTimeout(() => { onStatus('local'); beat(true); });
  }

  const timer = setInterval(() => {
    beat();
    const now = Date.now();
    let changed = false;
    for (const [id, p] of peers) if (now - p.seen > GONE_MS) { peers.delete(id); changed = true; }
    if (changed) publish();
  }, BEAT_MS);

  return {
    send: (m, to) => post(to ? { ...m, to } : m),
    announce: () => beat(),
    close() {
      post({ type: 'bye' });
      clearInterval(timer);
      transport.close();
    },
  };
}

/**
 * Stay in the room for `code` as `me` ({ id, role, name, seat, place, call, ... }). Returns the other
 * devices here (`peers`), the connection status, and `send(message, toDeviceId?)`.
 */
export function useRoom(code, me, onMessage) {
  const [peers, setPeers] = useState([]);
  const [status, setStatus] = useState('connecting');
  const handler = useRef(onMessage);
  handler.current = onMessage;
  const meRef = useRef(me);
  meRef.current = me;
  const room = useRef(null);
  // Bumped to drop the connection and open a fresh one (after a lost signal, or a phone that slept).
  const [attempt, setAttempt] = useState(0);
  const reconnect = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!code) return undefined;
    setStatus('connecting');
    const r = openRoom(code, () => meRef.current, {
      onMessage: (m, from) => handler.current(m, from),
      onPeers: setPeers,
      onStatus: setStatus,
    });
    room.current = r;
    return () => { r.close(); room.current = null; setPeers([]); };
  }, [code, me.id, attempt]);

  // Lost the connection: try again every few seconds. Coming back online, or back to the app after the
  // phone slept, reconnects straight away.
  useEffect(() => {
    if (!code || (status !== 'error' && status !== 'offline')) return undefined;
    const t = setTimeout(reconnect, RETRY_MS);
    return () => clearTimeout(t);
  }, [code, status, reconnect]);
  useEffect(() => {
    if (!code) return undefined;
    let hiddenAt = 0;
    const onVisible = () => {
      if (document.visibilityState === 'hidden') hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > SLEEP_MS) reconnect();
    };
    document.addEventListener('visibilitychange', onVisible);
    addEventListener('online', reconnect);
    return () => { document.removeEventListener('visibilitychange', onVisible); removeEventListener('online', reconnect); };
  }, [code, reconnect]);

  // Tell the others straight away when something about this device changes (joined video, muted…).
  const meKey = JSON.stringify(me);
  useEffect(() => { room.current?.announce(); }, [meKey]);

  const send = useCallback((m, to) => room.current?.send(m, to), []);
  return { peers, status, send, reconnect };
}
