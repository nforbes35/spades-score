// This device's identity in a game room: a random id, its role, name and seat, where it is (place.js),
// and whether it's in the video call.
import { useEffect, useState } from 'react';
import { newDeviceId } from './room.js';
import { usePlace } from './place.js';

export function useDevice(code, { role, name = '', seat = null }) {
  const place = usePlace(code);
  const [me, setMe] = useState(() => ({ id: newDeviceId(), role, name, seat, place: null, call: false, mic: false }));
  useEffect(() => {
    setMe((m) => (m.role === role && m.name === name && m.seat === seat && m.place === place ? m : { ...m, role, name, seat, place }));
  }, [role, name, seat, place]);
  return [me, setMe];
}
