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
