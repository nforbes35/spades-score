// Which devices are in the same place (same home Wi-Fi), so they don't all play sound and squeal.
// A browser can't see the Wi-Fi name, but devices on one home network share one internet address.
// Each device asks a public STUN server what its address looks like from outside and shares only a
// scrambled fingerprint of it (mixed with the game code), never the address itself.
import { useEffect, useState } from 'react';

const STUN = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];

async function publicAddress() {
  const pc = new RTCPeerConnection({ iceServers: STUN });
  const found = new Set();
  pc.onicecandidate = (e) => {
    const c = e.candidate?.candidate;
    if (c && / typ srflx/.test(c)) found.add(c.split(' ')[4]);
  };
  pc.createDataChannel('probe');
  await pc.setLocalDescription(await pc.createOffer());
  await new Promise((resolve) => {
    const t = setTimeout(resolve, 3000);
    pc.onicegatheringstatechange = () => {
      if (pc.iceGatheringState === 'complete') { clearTimeout(t); resolve(); }
    };
  });
  pc.close();
  return [...found].sort()[0] ?? null;
}

async function fingerprint(text) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return [...bytes.slice(0, 6)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** A short fingerprint shared by devices on the same network, or null if it can't be told. */
export function usePlace(code) {
  const [place, setPlace] = useState(null);
  useEffect(() => {
    if (!code) return undefined;
    let live = true;
    publicAddress()
      .then((addr) => (addr ? fingerprint(`${addr}|${code}`) : null))
      .then((p) => { if (live) setPlace(p); })
      .catch(() => {});
    return () => { live = false; };
  }, [code]);
  return place;
}

const SOUND_ORDER = { host: 0, player: 1, ohost: 1, oplayer: 1, guest: 2, tv: 3, otv: 4 };

/**
 * Only one device per place should use its microphone and speaker; any more and sound loops between
 * them. The table's phone handles sound at the table; at a remote player's home their phone does (it
 * can cancel its own echo); otherwise whoever joined first. Returns who handles sound here, or null
 * if this device has the place to itself.
 */
export function soundDevice(me, peers) {
  if (!me.place) return null;
  // An online game's TV only plays sound; the mic belongs to a phone.
  const here = peers.filter((p) => p.call && p.place === me.place && p.role !== 'otv');
  if (!here.length) return null;
  const all = [me, ...here].sort((a, b) => (SOUND_ORDER[a.role] - SOUND_ORDER[b.role]) || (a.since - b.since));
  return all[0];
}
