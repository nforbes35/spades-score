import { useEffect, useRef, useState } from 'react';
import { Icon } from './components.jsx';

export const ROLE_LABEL = { host: 'Table', player: 'Player', guest: 'Video', tv: 'TV' };

/** One video with a name label. Remote audio plays unless `muted`; browsers may need one tap first. */
export function VideoTile({ stream, muted, mirrored, label, note, micOff, className = '', fit = 'cover' }) {
  const ref = useRef(null);
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (v.srcObject !== stream) v.srcObject = stream;
    v.play?.().then(() => setBlocked(false)).catch(() => setBlocked(!muted));
  }, [stream, muted]);
  return (
    <div className={`vtile ${className}`}>
      <video ref={ref} autoPlay playsInline muted={muted} style={{ objectFit: fit }} className={mirrored ? 'mirrored' : ''} />
      {(label || micOff) && (
        <span className="vtile-label">
          {micOff && <Icon name="micOff" size={14} />}
          {label}
        </span>
      )}
      {note && <span className="vtile-note">{note}</span>}
      {blocked && (
        <button type="button" className="tap-sound" onClick={() => ref.current?.play().then(() => setBlocked(false)).catch(() => {})}>
          Tap for sound
        </button>
      )}
    </div>
  );
}

/** Mic, speaker, camera, flip and leave buttons, plus who handles sound in this room. */
export function CallButtons({ call, showFlip = true, size = 20 }) {
  return (
    <div className="call-buttons">
      {call.local && (
        <button type="button" className={call.micOn ? '' : 'off'} onClick={call.toggleMic}
          aria-label={call.micOn ? 'Mute microphone' : 'Unmute microphone'}>
          <Icon name={call.micOn ? 'mic' : 'micOff'} size={size} />
        </button>
      )}
      <button type="button" className={call.speakerOn ? '' : 'off'} onClick={call.toggleSpeaker}
        aria-label={call.speakerOn ? 'Turn sound off' : 'Turn sound on'}>
        <Icon name={call.speakerOn ? 'speaker' : 'speakerOff'} size={size} />
      </button>
      {call.local && (
        <button type="button" className={call.camOn ? '' : 'off'} onClick={call.toggleCam}
          aria-label={call.camOn ? 'Turn camera off' : 'Turn camera on'}>
          <Icon name={call.camOn ? 'video' : 'videoOff'} size={size} />
        </button>
      )}
      {call.local && showFlip && (
        <button type="button" onClick={call.flip} aria-label="Switch camera"><Icon name="flip" size={size} /></button>
      )}
      <button type="button" className="end" onClick={call.leave} aria-label="Leave video"><Icon name="close" size={size} /></button>
    </div>
  );
}

export function SoundNote({ call }) {
  if (!call.soundBy) return null;
  if (call.soundBy.role === 'otv') {
    return <p className="sound-note"><Icon name="tv" size={15} /> Everyone’s sound plays on the TV. Your camera and microphone still go out from this phone.</p>;
  }
  return (
    <p className="sound-note">
      <Icon name="speakerOff" size={15} /> {call.soundBy.name || 'Another device'} handles sound here, so this one starts
      muted (no squealing). Tap the buttons to change it.
    </p>
  );
}

const CORNERS = ['br', 'bl', 'tl', 'tr'];

/**
 * Floating video window for a phone. Shows `videos` (the people this phone should see) with this
 * phone's own camera small in the corner. Drag it to any corner; shrink it to a bubble.
 */
export function CallBox({ call, videos, emptyText = 'Waiting for others to turn on video…' }) {
  const [corner, setCorner] = useState('br');
  const [small, setSmall] = useState(false);
  const drag = useRef(null);
  const box = useRef(null);
  if (!call.joined) return null;

  const onDown = (e) => {
    if (e.target.closest('button')) return;
    drag.current = { x: e.clientX, y: e.clientY, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 6) d.moved = true;
    box.current.style.transform = `translate(${dx}px, ${dy}px)`;
  };
  const onUp = (e) => {
    const d = drag.current;
    drag.current = null;
    box.current.style.transform = '';
    if (!d) return;
    if (!d.moved) { if (small) setSmall(false); return; }
    setCorner(`${e.clientY > innerHeight / 2 ? 'b' : 't'}${e.clientX > innerWidth / 2 ? 'r' : 'l'}`);
  };

  const [first, ...rest] = videos;
  return (
    <div ref={box} className={`video-corner ${CORNERS.includes(corner) ? corner : 'br'}${small ? ' small' : ''}`}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      {first
        ? <VideoTile stream={first.stream} muted={!call.speakerOn} label={small ? '' : first.peer.name} micOff={!first.peer.mic} className="vc-main" />
        : <div className="vc-waiting">{emptyText}</div>}
      {!small && rest.length > 0 && (
        <div className="vc-more">
          {rest.map((v) => <VideoTile key={v.peer.id} stream={v.stream} muted={!call.speakerOn} className="vc-more-tile" />)}
        </div>
      )}
      {call.local && !small && <VideoTile stream={call.local} muted mirrored={call.mirrored} className="vc-self" />}
      {!small && (
        <div className="vc-controls">
          <CallButtons call={call} size={18} />
          <button type="button" onClick={() => setSmall(true)} aria-label="Make smaller"><Icon name="shrink" size={18} /></button>
        </div>
      )}
    </div>
  );
}
