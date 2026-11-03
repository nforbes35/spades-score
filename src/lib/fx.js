// Little touches: keep the screen awake during a game, a chime, and a buzz.
import { useEffect } from 'react';

export function useWakeLock(active) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return undefined;
    let lock = null;
    const get = () => navigator.wakeLock.request('screen').then((l) => { lock = l; }).catch(() => {});
    const onVisible = () => { if (document.visibilityState === 'visible') get(); };
    get();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      lock?.release().catch(() => {});
    };
  }, [active]);
}

let audio;
/** Two soft notes. Browsers only allow sound after the person has tapped something. */
export function chime(high = false) {
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    const now = audio.currentTime;
    [high ? 880 : 660, high ? 1320 : 990].forEach((freq, i) => {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.25, now + i * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.12 + 0.35);
      osc.connect(gain).connect(audio.destination);
      osc.start(now + i * 0.12);
      osc.stop(now + i * 0.12 + 0.4);
    });
  } catch { /* no sound available */ }
}

export const buzz = (pattern = 60) => { try { navigator.vibrate?.(pattern); } catch { /* not supported */ } };

// Card sounds, made on the fly from short bursts of filtered noise (no sound files to download).
let noise;
const context = () => {
  audio ??= new (window.AudioContext || window.webkitAudioContext)();
  if (audio.state === 'suspended') audio.resume().catch(() => {});
  return audio;
};
function flick(a, at, volume, pitch) {
  noise ??= (() => {
    const buf = a.createBuffer(1, Math.round(a.sampleRate * 0.07), a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 4;
    return buf;
  })();
  const src = a.createBufferSource();
  src.buffer = noise;
  const filter = a.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = pitch * (0.85 + Math.random() * 0.3);
  filter.Q.value = 1.1;
  const gain = a.createGain();
  gain.gain.value = volume;
  src.connect(filter).connect(gain).connect(a.destination);
  src.start(at);
}

/** A quick riffle shuffle, then one flick for every card dealt (`gap` seconds apart, after `riffle` seconds). */
export function dealSound({ cards = 52, gap = 0.028, riffle = 0.45 } = {}) {
  try {
    const a = context();
    const t0 = a.currentTime + 0.02;
    for (let i = 0; i < 22; i++) flick(a, t0 + i * 0.017, 0.1 + Math.random() * 0.05, 4200);
    for (let i = 0; i < cards; i++) flick(a, t0 + riffle + i * gap, 0.28, 2100);
  } catch { /* no sound available */ }
}

/** Browsers only allow sound after a tap: call this from one so later sounds can play. */
export function unlockSound() {
  try { context(); } catch { /* no sound available */ }
}
