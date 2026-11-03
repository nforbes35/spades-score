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

// The sound of a deal: real card-slide recordings (CC0, Kenney's Casino Audio) laid out as a quick run of
// cards landing (public/sounds/deal.m4a), loaded once and played through Web Audio so it starts on time.
const DEAL_URL = '/sounds/deal.m4a';
let dealBuffer;
const context = () => {
  audio ??= new (window.AudioContext || window.webkitAudioContext)();
  if (audio.state === 'suspended') audio.resume().catch(() => {});
  return audio;
};
function loadDeal(a) {
  dealBuffer ??= fetch(DEAL_URL)
    .then((r) => r.arrayBuffer())
    .then((data) => new Promise((resolve, reject) => a.decodeAudioData(data, resolve, reject)))
    .catch(() => { dealBuffer = undefined; return null; });
  return dealBuffer;
}

/** The cards being dealt, starting `delay` seconds from now (when they start flying out). */
export function dealSound({ delay = 0, volume = 0.75 } = {}) {
  // Only while the app is on screen: a phone that's locked or in another app holds sounds back and plays
  // them all when it comes back, which would sound like deals at random moments.
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
  try {
    const a = context();
    if (a.state !== 'running') return;
    const at = a.currentTime + delay;
    loadDeal(a).then((buffer) => {
      // Still on time? (The first load can take a moment; a late deal sound is worse than none.)
      if (!buffer || a.state !== 'running' || a.currentTime > at + 0.3 || document.visibilityState !== 'visible') return;
      const src = a.createBufferSource();
      src.buffer = buffer;
      const gain = a.createGain();
      gain.gain.value = volume;
      src.connect(gain).connect(a.destination);
      src.start(Math.max(at, a.currentTime));
    });
  } catch { /* no sound available */ }
}

/** Browsers only allow sound after a tap: call this from one so later sounds can play. Also loads the deal sound. */
export function unlockSound() {
  try {
    const a = context();
    // iPhones also want something played during the tap: a moment of silence.
    const src = a.createBufferSource();
    src.buffer = a.createBuffer(1, 1, 22050);
    src.connect(a.destination);
    src.start();
    loadDeal(a);
  } catch { /* no sound available */ }
}

// The first tap or key press anywhere unlocks sound for the rest of the visit.
if (typeof window !== 'undefined') {
  const prime = () => {
    unlockSound();
    removeEventListener('pointerdown', prime, true);
    removeEventListener('keydown', prime, true);
  };
  addEventListener('pointerdown', prime, true);
  addEventListener('keydown', prime, true);
}
