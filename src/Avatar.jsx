import { useEffect, useRef, useState } from 'react';
import { CHARACTERS, BACKDROPS, parseAvatar, characterAvatar, nameColors, initials, robotLook, photoAvatar, loadImage } from './lib/profile.js';
import { Icon } from './components.jsx';

/** Someone's icon: their photo, their character, a robot for a computer player, or their initials. */
export function Avatar({ value, name = '', bot, className = '' }) {
  const a = bot ? null : parseAvatar(value);
  const look = bot ? robotLook(name) : null;
  const colors = look?.colors ?? a?.colors ?? nameColors(name);
  return (
    <span className={`avatar-icon${a?.kind === 'photo' ? ' photo' : ''} ${className}`} style={{ '--av-a': colors[0], '--av-b': colors[1] }}>
      {bot ? <Robot face={look.face} />
        : a?.kind === 'photo' ? <img src={a.src} alt="" draggable="false" />
        : a?.kind === 'emoji' ? <span className="av-emoji">{a.emoji}</span>
        : <span className="av-initials">{initials(name)}</span>}
    </span>
  );
}

/** A friendly robot head for computer players; `face` picks one of four faces. */
function Robot({ face }) {
  const eye = 'var(--av-a)';
  return (
    <svg className="av-robot" viewBox="0 0 100 100" aria-hidden="true">
      <path d="M50 27V15" stroke="#e2e8f0" strokeWidth="4" strokeLinecap="round" />
      <circle cx="50" cy="13" r="6" fill={eye} stroke="#fff" strokeWidth="3" />
      <rect x="13" y="46" width="10" height="20" rx="4" fill="#cbd5e1" />
      <rect x="77" y="46" width="10" height="20" rx="4" fill="#cbd5e1" />
      <rect x="20" y="27" width="60" height="56" rx="17" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="2" />
      <rect x="28" y="38" width="44" height="26" rx="11" fill="#1e293b" />
      {face === 0 && <><circle cx="40" cy="51" r="5.5" fill={eye} /><circle cx="60" cy="51" r="5.5" fill={eye} /></>}
      {face === 1 && <rect x="34" y="47" width="32" height="8" rx="4" fill={eye} />}
      {face === 2 && <path d="M35 54q5-8 10 0M55 54q5-8 10 0" stroke={eye} strokeWidth="4" fill="none" strokeLinecap="round" />}
      {face === 3 && <><circle cx="50" cy="51" r="8.5" fill={eye} /><circle cx="52" cy="49" r="3" fill="#fff" /></>}
      {face === 2 || face === 3
        ? <path d="M40 72q10 6 20 0" stroke="#94a3b8" strokeWidth="3.5" fill="none" strokeLinecap="round" />
        : <g fill="#94a3b8"><rect x="38" y="69" width="5" height="6" rx="1.5" /><rect x="47.5" y="69" width="5" height="6" rx="1.5" /><rect x="57" y="69" width="5" height="6" rx="1.5" /></g>}
    </svg>
  );
}

/** Pick a name and an icon: a character on a colour, a photo, or just initials. */
export function ProfileEditor({ name, avatar, onName, onAvatar, autoFocus }) {
  const current = parseAvatar(avatar);
  const [backdrop, setBackdrop] = useState(current?.kind === 'emoji' ? current.backdrop : 0);
  const [photo, setPhoto] = useState(null); // an <img> being cropped
  const [error, setError] = useState(null);
  const fileRef = useRef(null);

  async function pickFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    try { setPhoto(await loadImage(file)); } catch (err) { setError(err.message); }
  }

  if (photo) {
    return <PhotoCrop image={photo} onCancel={() => setPhoto(null)}
      onDone={(value) => { onAvatar(value); setPhoto(null); }} />;
  }

  return (
    <div className="profile-editor">
      <div className="profile-preview">
        <Avatar value={avatar} name={name || '?'} className="xl" />
        <input className="code-input name-input" value={name} onChange={(e) => onName(e.target.value)}
          placeholder="Your name" maxLength={14} autoFocus={autoFocus} aria-label="Your name" />
      </div>

      <div className="profile-actions">
        <button type="button" className="soft" onClick={() => fileRef.current?.click()}><Icon name="camera" size={18} /> {current?.kind === 'photo' ? 'New photo' : 'Use a photo'}</button>
        {avatar && <button type="button" className="text-btn" onClick={() => onAvatar(null)}>Just my initials</button>}
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickFile} />
      </div>
      {error && <p className="scan-msg">{error}</p>}

      <div className="section-title">Or pick a character</div>
      <div className="backdrops" role="radiogroup" aria-label="Colour">
        {BACKDROPS.map((c, i) => (
          <button key={i} type="button" role="radio" aria-checked={backdrop === i} aria-label={`Colour ${i + 1}`}
            className={`backdrop${backdrop === i ? ' on' : ''}`} style={{ '--av-a': c[0], '--av-b': c[1] }}
            onClick={() => { setBackdrop(i); if (current?.kind === 'emoji') onAvatar(characterAvatar(current.emoji, i)); }} />
        ))}
      </div>
      <div className="characters">
        {CHARACTERS.map((emoji) => {
          const value = characterAvatar(emoji, backdrop);
          return (
            <button key={emoji} type="button" className={`character${avatar === value ? ' on' : ''}`} onClick={() => onAvatar(value)} aria-label={`Character ${emoji}`}>
              <Avatar value={value} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

const CROP_PX = 240;
const MAX_ZOOM = 4;

/** Drag and zoom a photo inside the circle, then keep that square. */
function PhotoCrop({ image, onCancel, onDone }) {
  const w = image.naturalWidth, h = image.naturalHeight;
  const cover = CROP_PX / Math.min(w, h);
  const [zoom, setZoom] = useState(1);
  const scale = cover * zoom;
  const clamp = (p, s = scale) => ({
    x: Math.min(0, Math.max(CROP_PX - w * s, p.x)),
    y: Math.min(0, Math.max(CROP_PX - h * s, p.y)),
  });
  const [pos, setPos] = useState(() => clamp({ x: (CROP_PX - w * cover) / 2, y: (CROP_PX - h * cover) / 2 }, cover));
  const drag = useRef(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => () => URL.revokeObjectURL(image.src), [image]);

  const zoomTo = (z) => {
    // Zoom around the middle of the circle.
    const s = cover * z;
    const cx = (CROP_PX / 2 - pos.x) / scale, cy = (CROP_PX / 2 - pos.y) / scale;
    setZoom(z);
    setPos(clamp({ x: CROP_PX / 2 - cx * s, y: CROP_PX / 2 - cy * s }, s));
  };

  async function done() {
    setBusy(true);
    const side = Math.min(w, h);
    const crop = { x: -pos.x / scale / side, y: -pos.y / scale / side, size: CROP_PX / scale / side };
    onDone(await photoAvatar(image, crop));
  }

  return (
    <div className="photo-crop">
      <p className="muted center">Drag to move. Slide to zoom.</p>
      <div className="crop-frame" style={{ width: CROP_PX, height: CROP_PX }}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }; }}
        onPointerMove={(e) => { if (drag.current) setPos(clamp({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y })); }}
        onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
        <img src={image.src} alt="" draggable="false" style={{ width: w * scale, height: h * scale, transform: `translate(${pos.x}px, ${pos.y}px)` }} />
      </div>
      <input type="range" className="crop-zoom" min="1" max={MAX_ZOOM} step="0.01" value={zoom} aria-label="Zoom"
        onChange={(e) => zoomTo(Number(e.target.value))} />
      <div className="row" style={{ justifyContent: 'center' }}>
        <button type="button" className="secondary" onClick={onCancel}>Cancel</button>
        <button type="button" className="primary go" disabled={busy} onClick={done}>Use this photo</button>
      </div>
    </div>
  );
}
