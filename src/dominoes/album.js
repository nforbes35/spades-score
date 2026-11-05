// Reaction photos: when a hand ends in a video chat, a picture of everyone's faces, kept in this device's own
// album (never uploaded; people share one themselves if they want to).
const DB = 'family-games-album';
const STORE = 'photos';
const MOST = 200;

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
const run = async (mode, fn) => {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => { resolve(req?.result); db.close(); };
    tx.onerror = () => { reject(tx.error); db.close(); };
  });
};
/** Newest first. */
export const loadPhotos = async () => ((await run('readonly', (s) => s.getAll())) ?? []).sort((a, b) => b.at - a.at);
export const deletePhoto = (id) => run('readwrite', (s) => s.delete(id));
export async function savePhoto(blob, title) {
  const at = Date.now();
  await run('readwrite', (s) => s.put({ id: `${at}`, at, title, blob }));
  const all = await loadPhotos();
  await Promise.all(all.slice(MOST).map((p) => deletePhoto(p.id)));
}

/** A picture of the videos on the table right now, with names and a caption. Null if nobody's on camera. */
export function snapReactions(table, title) {
  const videos = [...document.querySelectorAll('.dom-vstrip .dom-vmedia video')].filter((v) => v.videoWidth > 0 && !v.closest('.no-video') && !v.classList.contains('no-video'));
  if (!videos.length) return Promise.resolve(null);
  const cols = Math.ceil(Math.sqrt(videos.length));
  const rows = Math.ceil(videos.length / cols);
  const w = 1080, cellW = Math.floor(w / cols), cellH = Math.floor(cellW * 0.75), band = 90;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = rows * cellH + band;
  const c = canvas.getContext('2d');
  c.fillStyle = '#14100c';
  c.fillRect(0, 0, w, canvas.height);
  videos.forEach((v, i) => {
    const x = (i % cols) * cellW, y = Math.floor(i / cols) * cellH;
    const k = Math.max(cellW / v.videoWidth, cellH / v.videoHeight);
    const sw = cellW / k, sh = cellH / k;
    c.drawImage(v, (v.videoWidth - sw) / 2, (v.videoHeight - sh) / 2, sw, sh, x, y, cellW, cellH);
    const seat = Number(v.closest('[data-seat]')?.dataset.seat);
    const name = table.seats[seat]?.name;
    if (name) {
      c.font = '700 30px system-ui, sans-serif';
      const tw = c.measureText(name).width;
      c.fillStyle = 'rgba(0, 0, 0, 0.6)';
      c.fillRect(x + 10, y + cellH - 54, tw + 24, 44);
      c.fillStyle = '#fff';
      c.fillText(name, x + 22, y + cellH - 22);
    }
  });
  c.fillStyle = '#fff';
  c.font = '800 38px system-ui, sans-serif';
  c.fillText(title, 24, rows * cellH + 42);
  c.font = '500 24px system-ui, sans-serif';
  c.fillStyle = 'rgba(255, 255, 255, 0.75)';
  c.fillText(new Date().toLocaleDateString(undefined, { dateStyle: 'long' }), 24, rows * cellH + 76);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
}
