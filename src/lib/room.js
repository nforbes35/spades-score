// The live link between the table's phone ("host") and the remote player's phone ("remote").
// Online it uses a Supabase Realtime broadcast channel (nothing is stored in a database).
// Without Supabase settings it falls back to BroadcastChannel, which links tabs in the same
// browser: handy for trying remote play on one computer.
import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const onlineReady = Boolean(URL && KEY);

const BEAT_MS = 4000;
const GONE_MS = 12000;
let client;

/** Four letters, no look-alikes (I/L/O). */
export function makeCode() {
  const letters = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  return Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
}

export const joinLink = (code) => `${location.origin}/?join=${code}`;

function openRoom(code, role, { onMessage, onPeer, onStatus }) {
  const name = `spades-${code.toUpperCase()}`;
  let lastSeen = 0;
  let peer = false;
  let transport;

  const post = (m) => transport.post({ ...m, from: role });
  const setPeer = (v) => { if (peer !== v) { peer = v; onPeer(v); } };

  function receive(m) {
    if (!m || m.from === role) return;
    lastSeen = Date.now();
    if (m.type === 'bye') { setPeer(false); return; }
    setPeer(true);
    if (m.type === 'hb') {
      if (m.first) post({ type: 'hb' }); // answer a newcomer right away
      return;
    }
    onMessage(m);
  }

  if (onlineReady) {
    client ??= createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const ch = client.channel(name, { config: { broadcast: { self: false } } });
    ch.on('broadcast', { event: 'msg' }, ({ payload }) => receive(payload));
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') { onStatus('online'); post({ type: 'hb', first: true }); }
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
    setTimeout(() => { onStatus('local'); post({ type: 'hb', first: true }); });
  }

  const timer = setInterval(() => {
    post({ type: 'hb' });
    if (peer && Date.now() - lastSeen > GONE_MS) setPeer(false);
  }, BEAT_MS);

  return {
    send: post,
    close() {
      post({ type: 'bye' });
      clearInterval(timer);
      transport.close();
    },
  };
}

/** Keep a room open while `code` is set. `onMessage` gets everything the other phone sends. */
export function useRoom(code, role, onMessage) {
  const [peer, setPeer] = useState(false);
  const [status, setStatus] = useState('connecting');
  const handler = useRef(onMessage);
  handler.current = onMessage;
  const room = useRef(null);

  useEffect(() => {
    if (!code) return undefined;
    setStatus('connecting');
    const r = openRoom(code, role, { onMessage: (m) => handler.current(m), onPeer: setPeer, onStatus: setStatus });
    room.current = r;
    return () => { r.close(); room.current = null; setPeer(false); };
  }, [code, role]);

  const send = useCallback((m) => room.current?.send(m), []);
  return { peer, status, send };
}
