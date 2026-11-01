import { useEffect, useRef, useState } from 'react';
import { Icon } from './components.jsx';

function Video({ stream, muted, mirrored, className }) {
  const ref = useRef(null);
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (v.srcObject !== stream) v.srcObject = stream;
    v.play?.().then(() => setBlocked(false)).catch(() => setBlocked(!muted));
  }, [stream, muted]);
  return (
    <>
      <video ref={ref} autoPlay playsInline muted={muted} className={`${className}${mirrored ? ' mirrored' : ''}`} />
      {blocked && (
        <button type="button" className="tap-sound" onClick={() => ref.current?.play().then(() => setBlocked(false)).catch(() => {})}>
          Tap for sound
        </button>
      )}
    </>
  );
}

const CORNERS = ['br', 'bl', 'tl', 'tr'];

/** Floating video chat window. Drag it to any corner; shrink it to a bubble. */
export default function VideoCorner({ call, peerName }) {
  const [corner, setCorner] = useState('br');
  const [small, setSmall] = useState(false);
  const drag = useRef(null);
  const box = useRef(null);

  if (!call.active) return null;

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
    const right = e.clientX > innerWidth / 2;
    const bottom = e.clientY > innerHeight / 2;
    setCorner(`${bottom ? 'b' : 't'}${right ? 'r' : 'l'}`);
  };

  const waiting = !call.remote;
  return (
    <div ref={box} className={`video-corner ${CORNERS.includes(corner) ? corner : 'br'}${small ? ' small' : ''}`}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      {call.remote
        ? <Video stream={call.remote} className="vc-remote" />
        : <div className="vc-waiting">{call.incoming ? `${peerName} wants to video chat` : `Calling ${peerName}…`}</div>}
      {call.local && !small && <Video stream={call.local} muted mirrored={call.mirrored} className="vc-self" />}
      {!small && (
        <div className="vc-controls">
          {call.local ? (
            <>
              <button type="button" className={call.micOn ? '' : 'off'} onClick={call.toggleMic} aria-label={call.micOn ? 'Mute' : 'Unmute'}>
                <Icon name={call.micOn ? 'mic' : 'micOff'} size={18} />
              </button>
              <button type="button" className={call.camOn ? '' : 'off'} onClick={call.toggleCam} aria-label={call.camOn ? 'Camera off' : 'Camera on'}>
                <Icon name={call.camOn ? 'video' : 'videoOff'} size={18} />
              </button>
              <button type="button" onClick={call.flip} aria-label="Switch camera"><Icon name="flip" size={18} /></button>
            </>
          ) : (
            <button type="button" className="join" onClick={call.start}><Icon name="video" size={18} /> Join</button>
          )}
          <button type="button" onClick={() => setSmall(true)} aria-label="Make smaller"><Icon name="shrink" size={18} /></button>
          <button type="button" className="end" onClick={call.hangUp} aria-label="End video">
            <Icon name="close" size={18} />
          </button>
        </div>
      )}
      {waiting && call.state === 'failed' && <div className="vc-error">Couldn’t connect video on this network.</div>}
    </div>
  );
}
