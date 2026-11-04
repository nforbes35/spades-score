// Little touches: keep the screen awake during a game, a chime, and a buzz.
import { useEffect, useSyncExternalStore } from 'react';

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
  if (!settings.effects) return;
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

// ---------- Sound settings (this device): sound effects on/off, and the glass break on its own ----------
const EFFECTS_KEY = 'spades-sound-effects';
const GLASS_KEY = 'spades-glass-sound';
const readOn = (k) => { try { return localStorage.getItem(k) !== 'false'; } catch { return true; } };
let settings = { effects: readOn(EFFECTS_KEY), glass: readOn(GLASS_KEY) };
const settingListeners = new Set();
/** Turn sound effects ('effects') or the glass break ('glass') on or off on this device. */
export function setSoundSetting(key, on) {
  settings = { ...settings, [key]: on };
  try { localStorage.setItem(key === 'glass' ? GLASS_KEY : EFFECTS_KEY, String(on)); } catch { /* no storage */ }
  settingListeners.forEach((fn) => fn());
}
export function useSoundSettings() {
  return useSyncExternalStore((fn) => { settingListeners.add(fn); return () => settingListeners.delete(fn); }, () => settings);
}

// Only while the app is on screen: a phone that's locked or in another app holds sounds back and plays
// them all when it comes back, which would sound like deals at random moments.
const onScreen = () => typeof document === 'undefined' || document.visibilityState === 'visible';

const context = () => {
  audio ??= new (window.AudioContext || window.webkitAudioContext)();
  // Paused or interrupted (an iPhone in a call often is): ask it to carry on
  if (audio.state !== 'running') audio.resume?.().catch(() => {});
  return audio;
};

/** Load and decode a recording once (null if it can't be). */
const samples = {};
function load(a, url) {
  samples[url] ??= fetch(url)
    .then((r) => r.arrayBuffer())
    .then((data) => new Promise((resolve, reject) => a.decodeAudioData(data, resolve, reject)))
    .catch(() => { samples[url] = undefined; return null; });
  return samples[url];
}

/**
 * Play a recording `delay` seconds from now (or a slice of it: from `offset` for `duration`). Through Web
 * Audio for good timing; if that's paused or the recording isn't ready, a plain audio element instead.
 * Up to a second late is fine; later than that it's dropped (a late sound is worse than none).
 */
function playSample(url, { delay = 0, volume = 1, offset = 0, duration, rate = 1 } = {}) {
  const due = performance.now() + delay * 1000;
  const fallback = () => {
    if (!onScreen() || performance.now() > due + 1000) return;
    try {
      const el = new Audio(url);
      el.volume = Math.min(1, volume);
      el.playbackRate = rate;
      const wait = Math.max(0, due - performance.now());
      setTimeout(() => {
        try { el.currentTime = offset; } catch { /* not seekable yet */ }
        el.play().catch(() => {});
        if (duration) setTimeout(() => el.pause(), (duration / rate) * 1000 + 30);
      }, wait);
    } catch { /* no sound available */ }
  };
  let a;
  try { a = context(); } catch { fallback(); return; }
  load(a, url).then((buffer) => {
    if (!onScreen() || performance.now() > due + 1000) return;
    if (!buffer || a.state !== 'running') { fallback(); return; }
    const src = a.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    const gain = a.createGain();
    gain.gain.value = volume;
    src.connect(gain).connect(a.destination);
    const startAt = a.currentTime + Math.max(0, (due - performance.now()) / 1000);
    if (duration) src.start(startAt, offset, duration); else src.start(startAt, offset);
  });
}

// The sound of a deal: real card-slide recordings (CC0, Kenney's Casino Audio) laid out as a quick run of
// cards landing (public/sounds/deal.m4a).
const DEAL_URL = '/sounds/deal.m4a';

/** The cards being dealt, starting `delay` seconds from now (when they start flying out). */
export function dealSound({ delay = 0, volume = 0.75 } = {}) {
  if (!settings.effects || !onScreen()) return;
  playSample(DEAL_URL, { delay, volume });
}

// Where each card in the deal recording starts, so single real card sounds can be cut from it.
let slideStarts;
function findSlides(buffer) {
  const d = buffer.getChannelData(0), win = Math.floor(buffer.sampleRate * 0.005);
  const env = [];
  for (let i = 0; i + win <= d.length; i += win) {
    let sum = 0;
    for (let j = i; j < i + win; j++) sum += d[j] * d[j];
    env.push(Math.sqrt(sum / win));
  }
  const peak = Math.max(...env) || 1;
  const starts = [];
  let quiet = 99;
  env.forEach((v, k) => {
    if (v > peak * 0.3 && quiet >= 8) starts.push(Math.max(0, k * 0.005 - 0.006));
    quiet = v < peak * 0.12 ? quiet + 1 : 0;
  });
  return starts.length ? starts : [0];
}
/** One card landing on the table: a single real card slide, a different one each time. */
export function cardSound({ delay = 0, volume = 0.9 } = {}) {
  if (!settings.effects || !onScreen()) return;
  try {
    const a = context();
    load(a, DEAL_URL).then((buffer) => {
      if (!buffer) return;
      slideStarts ??= findSlides(buffer);
      const offset = slideStarts[Math.floor(Math.random() * slideStarts.length)];
      playSample(DEAL_URL, { delay, volume, offset, duration: 0.14, rate: 0.95 + Math.random() * 0.1 });
    });
  } catch { /* no sound available */ }
}
/** A won trick being swept up: a few soft slides, quick and a little lower. */
export function sweepSound({ delay = 0 } = {}) {
  if (!settings.effects) return;
  [0, 0.06, 0.12].forEach((t, i) => cardSound({ delay: delay + t, volume: 0.45 - i * 0.08 }));
}

/** Browsers only allow sound after a tap: call this from one so later sounds can play. Also loads the recordings. */
export function unlockSound() {
  try {
    const a = context();
    // iPhones also want something played during the tap: a moment of silence.
    const src = a.createBufferSource();
    src.buffer = a.createBuffer(1, 1, 22050);
    src.connect(a.destination);
    src.start();
    load(a, DEAL_URL);
    load(a, GLASS_URL);
  } catch { /* no sound available */ }
}

// The first tap or key press anywhere unlocks sound for the rest of the visit (and wakes it again later).
if (typeof window !== 'undefined') {
  let unlocked = false;
  const prime = () => {
    if (!unlocked) { unlocked = true; unlockSound(); return; }
    if (audio && audio.state !== 'running') audio.resume?.().catch(() => {});
  };
  addEventListener('pointerdown', prime, true);
  addEventListener('keydown', prime, true);
}

/** A soft thud: a slammed card hitting the table. Only while the app is on screen. */
export function thud() {
  if (!settings.effects || !onScreen()) return;
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
// It has its own switch, separate from the other sound effects.
const GLASS_URL = '/sounds/glass.m4a';

/** Glass shattering, `delay` seconds from now. Only while the app is on screen. */
export function glassBreak({ delay = 0, volume = 0.8 } = {}) {
  if (!settings.glass || !onScreen()) return;
  playSample(GLASS_URL, { delay, volume });
}
