// The moments around the game: mixing the tiles, "Domino!", call-outs, trash talk and the photo album.
import { useEffect, useRef, useState } from 'react';
import { Confetti, Icon, Sheet } from '../components.jsx';
import { Avatar } from '../Avatar.jsx';
import { VideoTile } from '../Video.jsx';
import { tileHit } from '../lib/fx.js';
import Domino from './Domino.jsx';
import { halves } from './engine.js';
import { getLang, tr, tMsg } from '../lib/i18n.js';
import { newHand, moveHand, stepWash } from './wash.js';
import { TALK_LINES, loadTalk, saveTalk, MAX_CLIP_CHARS, validClip, clipType, domStats, headToHead, loadDomLog } from './fun.js';
import { loadPhotos, deletePhoto } from './album.js';

/** The tiles face down in a pile; everyone drags a finger to stir them (others' fingers arrive through `bus`). */
export function DomWash({ table, ms, onSend, bus, onSkip, tv }) {
  const canvas = useRef(null);
  const lines = table.match?.hands.length === 0 ? table.match?.rivalry ?? [] : [];
  useEffect(() => {
    const el = canvas.current;
    if (!el) return undefined;
    const c = el.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0, H = 0, L = 40;
    const size = () => {
      W = el.clientWidth; H = el.clientHeight;
      el.width = W * dpr; el.height = H * dpr;
      L = Math.max(34, Math.min(72, Math.min(W, H) / 7));
    };
    size();
    const watch = new ResizeObserver(size);
    watch.observe(el);
    const count = Math.min(36, ((table.settings.setMax + 1) * (table.settings.setMax + 2)) / 2);
    // (laid out once the screen has a size: it can still be 0 × 0 at the very start)
    const tiles = [];
    const layOut = () => {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * 6.28, d = Math.sqrt(Math.random()) * Math.min(W, H) * 0.36;
        tiles.push({ x: W / 2 + Math.cos(a) * d, y: H / 2 + Math.sin(a) * d, r: Math.random() * 6.28, vx: 0, vy: 0, vr: 0 });
      }
    };
    let ghost = newHand();
    const hands = new Map(); // each finger here, and each other player's, by id
    let lastClack = 0, raf = 0, last = performance.now();
    const handMove = (id, x, y, now) => { hands.set(id, moveHand(hands.get(id) ?? newHand(), x, y, now, L)); };
    // each click is two tiles really hitting: louder the harder they hit
    const touching = new Map();
    const click = (force, now) => {
      if (!force || now - lastClack < 45) return;
      lastClack = now;
      tileHit(force);
    };
    bus.current = (x, y, who) => { if (Number.isFinite(x) && Number.isFinite(y)) { handMove(`them-${who}`, x * W, y * H, performance.now()); } };
    // the pointer(s)
    const downs = new Set();
    let sent = 0;
    const at = (e) => { const r = el.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }; };
    const move = (e) => {
      if (!downs.has(e.pointerId)) return;
      const p = at(e);
      const now = performance.now();
      handMove(e.pointerId, p.x, p.y, now);
      if (now - sent > 110) { sent = now; onSend?.(+(p.x / W).toFixed(3), +(p.y / H).toFixed(3)); }
    };
    const start = (e) => { downs.add(e.pointerId); el.setPointerCapture?.(e.pointerId); hands.delete(e.pointerId); move(e); };
    const stop = (e) => { downs.delete(e.pointerId); };
    el.addEventListener('pointerdown', start);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', stop);
    el.addEventListener('pointercancel', stop);
    const body = (t) => {
      const w = L, h = L / 2;
      c.save();
      c.translate(t.x, t.y);
      c.rotate(t.r);
      c.shadowColor = 'rgba(0, 0, 0, 0.45)'; c.shadowBlur = 5; c.shadowOffsetY = 2;
      c.fillStyle = '#f5efe0';
      c.beginPath();
      c.roundRect(-w / 2, -h / 2, w, h, 4);
      c.fill();
      c.shadowColor = 'transparent';
      c.fillStyle = 'rgba(110, 85, 50, 0.55)';
      c.beginPath();
      c.arc(0, 0, h * 0.13, 0, 6.3);
      c.fill();
      c.restore();
    };
    const frame = (now) => {
      const dt = Math.min(2, (now - last) / 16.7);
      last = now;
      if (!tiles.length && W > 0 && H > 0) layOut();
      // a slow stir of its own while nobody's touching it, so the pile is alive
      const live = [...hands.values()].filter((h) => now - h.at < 300);
      if (!live.length) {
        ghost = moveHand(ghost, W / 2 + Math.cos(now / 700) * W * 0.18, H / 2 + Math.sin(now / 520) * H * 0.12, now, L);
        ghost.soft = 0.3;
      }
      click(stepWash(tiles, live.length ? live : [ghost], { W, H, L, dt, now, touching }), now);
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, W, H);
      tiles.forEach(body);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      watch.disconnect();
      el.removeEventListener('pointerdown', start);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', stop);
      el.removeEventListener('pointercancel', stop);
      bus.current = null;
    };
  }, []);
  return (
    <div className="dom-wash">
      <div className="table-oval" aria-hidden="true" />
      <canvas ref={canvas} className="dom-wash-canvas" aria-label={tr('Dominoes face down, being mixed')} />
      <div className="dw-head">
        <h2>{tr('Mix the tiles!')}</h2>
        <p>{tv ? tr('Everyone’s stirring the pile') : tr('Drag your finger through the pile')}</p>
        {lines.map((l, i) => <p key={i} className="dw-rivalry">{tMsg(l)}</p>)}
      </div>
      <div className="dw-bar" style={{ animationDuration: `${ms}ms` }} />
      {!tv && <button type="button" className="dw-skip" onClick={onSkip}>{tr('Skip')}</button>}
    </div>
  );
}

/** "Domino!": the winner, big, and everyone else's leftover tiles turned over. Tap to move on. */
export function DomMoment({ table, info, stream, icon, onClose, snap }) {
  const reveal = table.round.reveal ?? [];
  const seatPips = table.round.result?.seatPips ?? [];
  const who = info.seat != null ? table.seats[info.seat] : null;
  const anyVideo = stream && stream.getVideoTracks().length > 0;
  const most = Math.max(1, ...reveal.map((h) => h.length));
  return (
    <div className={`dom-moment${info.confetti ? ' won' : ' stuck'}`} onClick={onClose}>
      {info.confetti && <Confetti />}
      {snap && <div className="dm-flash" aria-hidden="true" />}
      <h1 className="dm-title">{info.title}</h1>
      {who && (
        <div className="dm-hero">
          {anyVideo ? <VideoTile stream={stream} muted /> : <Avatar value={icon} name={who.name} bot={who.bot} className="seat-icon" />}
        </div>
      )}
      <p className="dm-sub">{info.sub}</p>
      {snap && <p className="dm-snap">📸 {tr('Reaction photo saved to the album')}</p>}
      <div className="dm-hands" style={{ '--most': most }}>
        {reveal.map((hand, s) => (hand.length > 0 && table.seats[s] ? (
          <div key={s} className="dm-hand">
            <span className="dm-name">{table.seats[s].name}<b>{seatPips[s] ?? 0}</b></span>
            <span className="dm-tiles">
              {hand.map((t, i) => { const [a, b] = halves(t); return <span key={t} className="dm-flip" style={{ animationDelay: `${0.5 + i * 0.09}s` }}><Domino a={a} b={b} size={42} /></span>; })}
            </span>
          </div>
        ) : null))}
      </div>
      <p className="dm-tap">{tr('Tap to continue')}</p>
    </div>
  );
}

export const DomCallout = ({ c }) => (
  <div className={`dom-callout${c.big ? ' big' : ''}`} aria-live="polite"><b>{c.text}</b>{c.sub && <span>{c.sub}</span>}</div>
);

const FIREFLIES = [[12, 30, 0], [28, 62, 2.1], [44, 22, 4.3], [61, 70, 1.2], [76, 38, 3.4], [88, 60, 5.2], [20, 80, 2.8], [68, 18, 0.7], [52, 48, 3.9]];
const STARS = [[6, 8], [15, 16], [24, 6], [33, 13], [42, 5], [55, 11], [64, 5], [83, 8], [92, 15], [9, 26], [96, 28], [37, 22]];
/** The night out on the porch that goes with the crickets: dark sky, moon, string lights, a railing and fireflies. Drawn under the tiles. */
export const PorchNight = () => (
  <div className="porch-night" aria-hidden="true">
    {STARS.map(([x, y]) => <i key={`${x}${y}`} className="porch-star" style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${(x % 5) * 0.6}s` }} />)}
    <i className="porch-moon" />
    <i className="porch-lights" />
    <i className="porch-rail" />
    {FIREFLIES.map(([x, y, d]) => <i key={`${x}${y}`} className="porch-fly" style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${d}s` }} />)}
  </div>
);

/** Someone's line, over the table for everyone. */
export const DomTalk = ({ talk }) => (
  <div className="dom-talk" role="status"><b>{talk.name}</b><span>{talk.text}</span>{talk.original && <small>🌐 {talk.original}</small>}</div>
);

const CLIP_MS = 3000;
/** The trash talk lines: tap one to say it; record your own voice for any of them; add your own. */
export function TalkSheet({ onSay, onClose }) {
  const lang = getLang();
  const [talk, setTalk] = useState(loadTalk);
  const [recording, setRecording] = useState(null);
  const [draft, setDraft] = useState('');
  const [problem, setProblem] = useState(null);
  const change = (next) => { setTalk(next); saveTalk(next); };
  const recorder = useRef(null);
  useEffect(() => () => recorder.current?.stop?.(), []);
  const record = async (id) => {
    setProblem(null);
    if (recording === id) { recorder.current?.stop(); return; }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { setProblem(tr('This device can’t record here.')); return; }
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { setProblem(tr('Allow the microphone to record your voice.')); return; }
    // mp4 first: every phone can play it back, while older iPhones can't play webm
    const type = ['audio/mp4', 'audio/webm;codecs=opus'].find((t) => MediaRecorder.isTypeSupported(t));
    const rec = new MediaRecorder(stream, { ...(type ? { mimeType: type } : {}), audioBitsPerSecond: 24000 });
    const parts = [];
    rec.ondataavailable = (e) => { if (e.data?.size) parts.push(e.data); };
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      recorder.current = null;
      setRecording(null);
      if (!parts.length) { setProblem(tr('The microphone didn’t pick anything up. Try again.')); return; }
      const reader = new FileReader();
      reader.onerror = () => setProblem(tr('That recording didn’t work. Try again.'));
      reader.onload = () => {
        const clip = reader.result;
        if (typeof clip === 'string' && clip.length > MAX_CLIP_CHARS) { setProblem(tr('That recording is too big to send.')); return; }
        if (!validClip(clip)) { setProblem(tr('That recording didn’t work. Try again.')); return; }
        const now = loadTalk();
        change({ ...now, clips: { ...now.clips, [id]: clip } });
      };
      reader.readAsDataURL(new Blob(parts, { type: clipType(rec.mimeType || type) }));
    };
    recorder.current = rec;
    setRecording(id);
    rec.start();
    setTimeout(() => { if (rec.state === 'recording') rec.stop(); }, CLIP_MS);
  };
  const removeVoice = (id) => { const { [id]: _gone, ...clips } = talk.clips; change({ ...talk, clips }); };
  const removeLine = (id) => { const { [id]: _gone, ...clips } = talk.clips; change({ custom: talk.custom.filter((l) => l.id !== id), clips }); };
  const add = (e) => {
    e.preventDefault();
    const text = draft.trim().slice(0, 50);
    if (!text) return;
    change({ ...talk, custom: [...talk.custom, { id: `c${Date.now().toString(36)}`, text }] });
    setDraft('');
  };
  const row = (l, custom) => (
    <div key={l.id} className="talk-row">
      <button type="button" className="talk-say" onClick={() => onSay(l.text ?? l[lang], talk.clips[l.id] ?? null, custom ? null : l.id)}>{talk.clips[l.id] ? '🗣️ ' : ''}{l.text ?? l[lang]}</button>
      <button type="button" className={`talk-mic${recording === l.id ? ' on' : ''}`} aria-label={recording === l.id ? tr('Stop recording') : tr('Record your voice saying {line}', { line: l.text ?? l[lang] })} onClick={() => record(l.id)}>{recording === l.id ? '⏹' : '🎙️'}</button>
      {talk.clips[l.id] && !custom && <button type="button" className="talk-x" aria-label={tr('Remove your recording')} onClick={() => removeVoice(l.id)}><Icon name="close" size={14} /></button>}
      {custom && <button type="button" className="talk-x" aria-label={tr('Remove this line')} onClick={() => removeLine(l.id)}><Icon name="close" size={14} /></button>}
    </div>
  );
  return (
    <Sheet title={tr('Talk some trash')} short onClose={onClose} closeLabel={tr('Close')}>
      <p className="muted small">{tr('Tap a line and everyone hears it. Tap 🎙️ to record it in your own voice (3 seconds).')}</p>
      {problem && <p className="talk-problem">{problem}</p>}
      <div className="talk-list">
        {TALK_LINES.map((l) => row(l, false))}
        {talk.custom.map((l) => row(l, true))}
      </div>
      <form className="talk-add" onSubmit={add}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={50} placeholder={tr('Add your own line')} aria-label={tr('Add your own line')} />
        <button type="submit" className="secondary" disabled={!draft.trim()}>{tr('Add')}</button>
      </form>
    </Sheet>
  );
}

/** The photos this device has kept: look, share or delete. */
export function AlbumSheet({ onClose }) {
  const [photos, setPhotos] = useState(null);
  const [open, setOpen] = useState(null);
  const urls = useRef(new Map());
  const urlOf = (p) => { if (!urls.current.has(p.id)) urls.current.set(p.id, URL.createObjectURL(p.blob)); return urls.current.get(p.id); };
  const reload = () => loadPhotos().then(setPhotos).catch(() => setPhotos([]));
  useEffect(() => { reload(); const map = urls.current; return () => map.forEach((u) => URL.revokeObjectURL(u)); }, []);
  const fileOf = (p) => new File([p.blob], `family-games-${new Date(p.at).toISOString().slice(0, 10)}.jpg`, { type: 'image/jpeg' });
  const canShare = (p) => { try { return Boolean(navigator.canShare?.({ files: [fileOf(p)] })); } catch { return false; } };
  return (
    <Sheet title={open ? open.title : tr('Family album')} onClose={open ? () => setOpen(null) : onClose} closeLabel={open ? tr('Back') : tr('Done')}>
      {open ? (
        <div className="album-big">
          <img src={urlOf(open)} alt={open.title} />
          <p className="muted small center">{new Date(open.at).toLocaleString(getLang(), { dateStyle: 'long', timeStyle: 'short' })}</p>
          <div className="row">
            {canShare(open)
              ? <button type="button" className="primary" onClick={() => navigator.share({ files: [fileOf(open)] }).catch(() => {})}>{tr('Share')}</button>
              : <a className="primary album-save" href={urlOf(open)} download={fileOf(open).name}>{tr('Save')}</a>}
            <button type="button" className="secondary" onClick={() => { if (confirm(tr('Delete this photo?'))) deletePhoto(open.id).then(() => { setOpen(null); reload(); }); }}>{tr('Delete')}</button>
          </div>
        </div>
      ) : (
        <>
          {photos?.length === 0 && <div className="card empty stats-empty"><span style={{ fontSize: 34 }}>📸</span><p>{tr('When a hand ends during a video chat, a picture of everyone’s reaction lands here. Photos stay on this device unless you share them.')}</p></div>}
          <div className="album-grid">
            {(photos ?? []).map((p) => <button key={p.id} type="button" onClick={() => setOpen(p)} aria-label={p.title}><img src={urlOf(p)} alt="" /></button>)}
          </div>
        </>
      )}
    </Sheet>
  );
}

/** Dominoes' part of Stats & records. */
export function DomStatsList() {
  const [log] = useState(loadDomLog);
  const players = domStats(log);
  const pairs = headToHead(log, players.map((p) => p.name)).slice(0, 8);
  if (!players.length) return <div className="card empty stats-empty"><Icon name="trophy" size={34} /><p>{tr('Finish a game of dominoes and everyone’s record shows up here.')}</p></div>;
  return (
    <>
      <div className="leaderboard">
        {players.map((p, i) => (
          <div key={p.key} className="card lb-row">
            <span className="lb-rank">{['🥇', '🥈', '🥉'][i] ?? i + 1}</span>
            <span className="lb-main"><b>{p.name}</b><span className="muted small">{p.wins}–{p.losses}{p.streak >= 2 ? ` · ${tr('won {n} straight', { n: p.streak })}` : p.streak <= -2 ? ` · ${tr('lost {n} straight', { n: -p.streak })}` : ''}</span><span className="lb-bar"><i style={{ width: `${p.pct}%` }} /></span></span>
            <span className="lb-pct">{p.pct}%</span>
          </div>
        ))}
      </div>
      {pairs.length > 0 && <div className="section-title">{tr('Head to head')}</div>}
      {pairs.map((x) => <div key={`${x.a}${x.b}`} className="card dom-h2h"><span>{x.a}</span><b>{x.aw} – {x.bw}</b><span>{x.b}</span></div>)}
    </>
  );
}
