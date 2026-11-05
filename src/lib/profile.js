// Who you are at the table: your name and your icon. An icon is a picture character on a colour, a
// photo you upload (cut to a small square), or, until you pick one, your initials. Computer players
// each get their own robot. Icons are swapped between the devices in a game (useAvatars).
import { useEffect, useRef, useState } from 'react';
import { tabRead, tabWrite } from './store.js';
import { tr } from './i18n.js';

const NAME_KEY = 'spades-online-name';
const AVATAR_KEY = 'spades-avatar';
const PHOTO_PX = 120;
const PHOTO_QUALITY = 0.8;
const RESEND_MS = 20000;

export const CHARACTERS = ['🦊', '🐻', '🐼', '🐨', '🦁', '🐯', '🐸', '🐵', '🦉', '🐧', '🐰', '🐶', '🐱', '🦄', '🐲', '🦖', '🐙', '🦈', '🐢', '🦩', '🤠', '😎', '👑', '🃏'];
export const BACKDROPS = [
  ['#60a5fa', '#2563eb'], ['#a78bfa', '#7c3aed'], ['#f472b6', '#db2777'], ['#fb923c', '#ea580c'],
  ['#facc15', '#ca8a04'], ['#4ade80', '#16a34a'], ['#2dd4bf', '#0d9488'], ['#94a3b8', '#475569'],
];

export const loadName = () => tabRead(NAME_KEY) ?? '';
export const saveName = (name) => tabWrite(NAME_KEY, name);
export const loadAvatar = () => tabRead(AVATAR_KEY) ?? null;
export const saveAvatar = (avatar) => tabWrite(AVATAR_KEY, avatar);

export const characterAvatar = (emoji, backdrop) => `e:${backdrop}:${emoji}`;

/** What an avatar string is: { kind: 'photo', src } | { kind: 'emoji', emoji, colors } | null. */
export function parseAvatar(value) {
  if (typeof value !== 'string') return null;
  if (value.startsWith('p:data:image/')) return { kind: 'photo', src: value.slice(2) };
  const m = /^e:(\d+):(.+)$/.exec(value);
  if (m) return { kind: 'emoji', emoji: m[2], colors: BACKDROPS[Number(m[1]) % BACKDROPS.length], backdrop: Number(m[1]) };
  return null;
}

const hash = (text) => [...String(text ?? '')].reduce((h, c) => (h * 31 + c.codePointAt(0)) >>> 0, 7);

/** Colours for someone without an icon, the same for a name on every device. */
export const nameColors = (name) => BACKDROPS[hash(name.trim().toLowerCase()) % BACKDROPS.length];

export const initials = (name) => {
  const words = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  return (words.length > 1 ? words[0][0] + words[words.length - 1][0] : words[0].slice(0, 2)).toUpperCase().slice(0, 2);
};

/** Which robot a computer player gets: a colour and a face, from its name. */
export function robotLook(name) {
  const h = hash(name);
  return { colors: BACKDROPS[h % BACKDROPS.length], face: (h >> 3) % 4 };
}

/**
 * Cut a photo to a small square for an icon. `crop` is the square to keep, as fractions of the
 * picture ({ x, y, size } of the shorter side); the default is the middle.
 */
export async function photoAvatar(image, crop) {
  const w = image.naturalWidth, h = image.naturalHeight;
  const side = Math.min(w, h);
  const c = crop ?? { x: (w - side) / 2 / side, y: (h - side) / 2 / side, size: 1 };
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = PHOTO_PX;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, c.x * side, c.y * side, c.size * side, c.size * side, 0, 0, PHOTO_PX, PHOTO_PX);
  return `p:${canvas.toDataURL('image/jpeg', PHOTO_QUALITY)}`;
}

/** Open a picked image file as an <img> (iPhones hand over HEIC photos as JPEG). */
export function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(tr('That picture couldn’t be opened.'))); };
    img.src = url;
  });
}

/**
 * Everyone's icons in a game room, by device id. This device's icon goes to each device that joins,
 * to everyone when it changes, and again now and then in case a message was dropped. Returns the icons
 * and a message handler (true if it was an icon message).
 */
export function useAvatars(room, me, mine) {
  const [icons, setIcons] = useState({});
  const told = useRef(new Set());
  const heard = useRef(new Set());
  const peerKey = room.peers.map((p) => p.id).join(',');
  useEffect(() => { told.current = new Set(); }, [mine]);
  useEffect(() => {
    for (const p of room.peers) {
      if (told.current.has(p.id) || p.role === 'tv' || p.role === 'card') continue;
      told.current.add(p.id);
      room.send({ type: 'avatar', avatar: mine }, p.id);
    }
  }, [peerKey, mine]);
  useEffect(() => {
    const timer = setInterval(() => room.send({ type: 'avatar', avatar: mine }), RESEND_MS);
    return () => clearInterval(timer);
  }, [mine, room.send]);
  const all = { ...icons, [me.id]: mine };
  const handle = (m, from) => {
    if (m.type !== 'avatar' || !from) return false;
    const value = typeof m.avatar === 'string' && m.avatar.length < 40000 ? m.avatar : null;
    // The first time a device says hello, answer with ours: what we sent when it appeared may have
    // gone out before it was listening.
    if (!heard.current.has(from.id)) { heard.current.add(from.id); room.send({ type: 'avatar', avatar: mine }, from.id); }
    setIcons((x) => (x[from.id] === value ? x : { ...x, [from.id]: value }));
    return true;
  };
  return [all, handle];
}
