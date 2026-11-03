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

// The shuffle at each deal: a real recording (public/sounds, CC0 from Kenney's Casino Audio), loaded once and
// played through Web Audio so it starts on time.
const SHUFFLE_URL = '/sounds/shuffle.m4a';
let shuffleBuffer;
const context = () => {
  audio ??= new (window.AudioContext || window.webkitAudioContext)();
  if (audio.state === 'suspended') audio.resume().catch(() => {});
  return audio;
};
function loadShuffle(a) {
  shuffleBuffer ??= fetch(SHUFFLE_URL)
    .then((r) => r.arrayBuffer())
    .then((data) => new Promise((resolve, reject) => a.decodeAudioData(data, resolve, reject)))
    .catch(() => { shuffleBuffer = undefined; return null; });
  return shuffleBuffer;
}

/** Shuffle sound for a new deal. */
export function dealSound({ volume = 0.8 } = {}) {
  try {
    const a = context();
    loadShuffle(a).then((buffer) => {
      if (!buffer) return;
      const src = a.createBufferSource();
      src.buffer = buffer;
      const gain = a.createGain();
      gain.gain.value = volume;
      src.connect(gain).connect(a.destination);
      src.start();
    });
  } catch { /* no sound available */ }
}

/** Browsers only allow sound after a tap: call this from one so later sounds can play. Also loads the shuffle. */
export function unlockSound() {
  try {
    const a = context();
    // iPhones also want something played during the tap: a moment of silence.
    const src = a.createBufferSource();
    src.buffer = a.createBuffer(1, 1, 22050);
    src.connect(a.destination);
    src.start();
    loadShuffle(a);
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
