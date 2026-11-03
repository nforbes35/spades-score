// This device's identity in a game room: a random id, its role, name and seat, where it is (place.js),
// and whether it's in the video call.
import { useEffect, useState } from 'react';
import { newDeviceId } from './room.js';
import { usePlace } from './place.js';

/** `id` keeps the same identity across reloads (online mode, so a player gets their seat back). */
export function useDevice(code, { role, name = '', seat = null, id, pub = null }) {
  const place = usePlace(code);
  const [me, setMe] = useState(() => ({ id: id ?? newDeviceId(), role, name, seat, place: null, pub, call: false, mic: false }));
  useEffect(() => {
    setMe((m) => (m.role === role && m.name === name && m.seat === seat && m.place === place && m.pub === pub
      ? m : { ...m, role, name, seat, place, pub }));
  }, [role, name, seat, place, pub]);
  return [me, setMe];
}

// Is this screen a TV? Smart TV and streaming-stick browsers say so in their user agent. A laptop or iPad on
// a TV can't be told apart, so once this device has picked "TV" it's remembered.
const TV_KEY = 'spades-is-tv';
const TV_AGENT = /SMART-?TV|SmartTV|Tizen|Web0S|webOS|NetCast|HbbTV|BRAVIA|VIDAA|Roku|CrKey|GoogleTV|Android TV|AFT[A-Z]|AppleTV|PlayStation|Xbox/i;
export function isTvScreen() {
  try { if (localStorage.getItem(TV_KEY) != null) return localStorage.getItem(TV_KEY) === 'true'; } catch { /* no storage */ }
  return TV_AGENT.test(navigator.userAgent);
}
export function rememberTvScreen(tv) {
  try { localStorage.setItem(TV_KEY, String(tv)); } catch { /* no storage */ }
}
