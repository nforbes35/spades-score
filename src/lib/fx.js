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
    loadGlass(a);
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

/** A soft thud: a slammed card hitting the table. Only while the app is on screen. */
export function thud() {
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
  try {
    const a = context();
    if (a.state !== 'running') return;
    const t = a.currentTime;
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.18);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.5, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    osc.connect(gain).connect(a.destination);
    osc.start(t);
    osc.stop(t + 0.26);
  } catch { /* no sound available */ }
}

// Glass breaking (spades broken): a real recording of a small pane shattering (public/sounds/glass.m4a).
const GLASS_URL = '/sounds/glass.m4a';
let glassBuffer;
function loadGlass(a) {
  glassBuffer ??= fetch(GLASS_URL)
    .then((r) => r.arrayBuffer())
    .then((data) => new Promise((resolve, reject) => a.decodeAudioData(data, resolve, reject)))
    .catch(() => { glassBuffer = undefined; return null; });
  return glassBuffer;
}

/** Glass shattering, `delay` seconds from now. Only while the app is on screen. */
export function glassBreak({ delay = 0, volume = 0.8 } = {}) {
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
  try {
    const a = context();
    if (a.state !== 'running') return;
    const at = a.currentTime + delay;
    loadGlass(a).then((buffer) => {
      if (a.state !== 'running' || a.currentTime > at + 0.3 || document.visibilityState !== 'visible') return;
      if (!buffer) { glassSynth(a, Math.max(at, a.currentTime)); return; } // (couldn't load the recording)
      const src = a.createBufferSource();
      src.buffer = buffer;
      const gain = a.createGain();
      gain.gain.value = volume;
      src.connect(gain).connect(a.destination);
      src.start(Math.max(at, a.currentTime));
    });
  } catch { /* no sound available */ }
}

/**
 * A stand-in shatter made on the spot, for when the recording can't load: a sharp crack, a burst of
 * shattering noise, then dozens of small shards tinkling down.
 */
function glassSynth(a, t0, volume = 0.6) {
  try {
    const out = a.createGain();
    out.gain.value = volume;
    // A little room, so it doesn't sound like it's inside the phone
    const room = a.createConvolver();
    room.buffer = impulse(a, 0.9, 3.2);
    const wet = a.createGain();
    wet.gain.value = 0.28;
    out.connect(a.destination);
    out.connect(room).connect(wet).connect(a.destination);

    const noise = noiseBuffer(a, 1.2);
    const burst = (at, dur, freq, q, gain, type = 'bandpass') => {
      const src = a.createBufferSource();
      src.buffer = noise;
      src.playbackRate.value = 0.9 + Math.random() * 0.3;
      const f = a.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = a.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(gain, at + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      src.connect(f).connect(g).connect(out);
      src.start(at, Math.random() * 0.5, dur + 0.05);
    };
    const ping = (at, freq, dur, gain) => {
      // A shard: a bright ring with a slightly detuned partner, gone almost as soon as it starts
      for (const [mul, lvl] of [[1, 1], [2.76, 0.35], [5.4, 0.12]]) {
        const o = a.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(freq * mul * (1 + (Math.random() - 0.5) * 0.01), at);
        const g = a.createGain();
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(gain * lvl, at + 0.0015);
        g.gain.exponentialRampToValueAtTime(0.0001, at + dur / mul ** 0.5);
        o.connect(g).connect(out);
        o.start(at);
        o.stop(at + dur + 0.05);
      }
    };

    // The crack: a hard, bright click and a low knock under it
    burst(t0, 0.05, 3800, 0.7, 1.0, 'highpass');
    const knock = a.createOscillator();
    const kg = a.createGain();
    knock.frequency.setValueAtTime(180, t0);
    knock.frequency.exponentialRampToValueAtTime(60, t0 + 0.08);
    kg.gain.setValueAtTime(0.0001, t0);
    kg.gain.exponentialRampToValueAtTime(0.45, t0 + 0.003);
    kg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);
    knock.connect(kg).connect(out);
    knock.start(t0);
    knock.stop(t0 + 0.15);
    // The shatter: overlapping bursts of glassy noise
    for (let i = 0; i < 9; i++) {
      burst(t0 + 0.005 + i * 0.012 + Math.random() * 0.01, 0.12 + Math.random() * 0.2, 2500 + Math.random() * 6000, 2 + Math.random() * 4, 0.5 - i * 0.04);
    }
    // The shards falling: dense at first, then fewer and quieter, bouncing as they land
    for (let i = 0; i < 46; i++) {
      const x = Math.random();
      const at = t0 + 0.02 + x * x * 1.1;
      const loud = 0.22 * (1 - x * 0.8) * (0.4 + Math.random() * 0.6);
      ping(at, 2600 + Math.random() * 6200, 0.05 + Math.random() * 0.16, loud);
      if (Math.random() < 0.35) burst(at, 0.03 + Math.random() * 0.04, 5000 + Math.random() * 4000, 6, loud * 0.8);
    }
  } catch { /* no sound available */ }
}

function noiseBuffer(a, seconds) {
  const b = a.createBuffer(1, Math.floor(a.sampleRate * seconds), a.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

/** A short, bright reverb tail (decaying noise), for a sense of the room. */
function impulse(a, seconds, decay) {
  const len = Math.floor(a.sampleRate * seconds);
  const b = a.createBuffer(2, len, a.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** decay;
  }
  return b;
}
