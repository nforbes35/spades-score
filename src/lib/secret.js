// Private hands in online mode. Every message in a game room reaches every device, so each player's
// cards are locked before they're sent: each device makes a key pair when it opens the game and shares
// only the public half; the host and that player work out a shared secret key (ECDH P-256) and the
// cards travel encrypted with it (AES-GCM). Other players' devices can't read them.
// (The host's device deals, so it does know every hand: the price of having no server.)
import { useEffect, useState } from 'react';

const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function makeKeys() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey']);
  const pub = toB64(await crypto.subtle.exportKey('raw', pair.publicKey));
  return { pair, pub, shared: new Map() };
}

async function sharedKey(keys, theirPub) {
  if (!keys.shared.has(theirPub)) {
    const pub = await crypto.subtle.importKey('raw', fromB64(theirPub), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    keys.shared.set(theirPub, crypto.subtle.deriveKey(
      { name: 'ECDH', public: pub }, keys.pair.privateKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
    ));
  }
  return keys.shared.get(theirPub);
}

/** Lock `data` so only the device with public key `theirPub` can read it. */
export async function seal(keys, theirPub, data) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const body = new TextEncoder().encode(JSON.stringify(data));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await sharedKey(keys, theirPub), body);
  return { iv: toB64(iv), ct: toB64(ct) };
}

/** Unlock something `seal`ed for this device by the device with public key `theirPub`. */
export async function unseal(keys, theirPub, box) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(box.iv) }, await sharedKey(keys, theirPub), fromB64(box.ct));
  return JSON.parse(new TextDecoder().decode(pt));
}

/** This page's key pair (made once). */
export function useKeys() {
  const [keys, setKeys] = useState(null);
  useEffect(() => { makeKeys().then(setKeys).catch(() => {}); }, []);
  return keys;
}
