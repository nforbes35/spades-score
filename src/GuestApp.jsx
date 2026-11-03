import { useEffect, useState } from 'react';
import { standings } from './lib/scoring.js';
import { read, write } from './lib/store.js';
import { useRoom } from './lib/room.js';
import { useDevice } from './lib/device.js';
import { useCall } from './lib/call.js';
import { useWakeLock } from './lib/fx.js';
import { Icon, StatusDot } from './components.jsx';
import { VideoTile, CallButtons, SoundNote } from './Video.jsx';
import { ScoreCard } from './Scoreboard.jsx';

const NAME_KEY = 'spades-guest-name';

/**
 * Video guest: an extra phone or iPad at the table to put more faces on the TV, or family watching
 * from home. Shows its own camera, the table and everyone else; no cards.
 */
export default function GuestApp({ code, onLeave }) {
  const [name, setName] = useState(() => read(NAME_KEY) ?? '');
  const [named, setNamed] = useState(() => Boolean(read(NAME_KEY)));
  const [game, setGame] = useState(null);
  const [device, setDevice] = useDevice(code, { role: 'guest', name: named ? name : '' });
  const room = useRoom(code, device, (m) => {
    if (m.type === 'state') setGame(m.game);
    else if (m.type === 'rtc') call.handle(m);
  });
  const call = useCall({ room, me: device, setMe: setDevice, facing: 'user' });
  const host = room.peers.find((p) => p.role === 'host');
  useEffect(() => { if (host) room.send({ type: 'hello' }, host.id); }, [host?.id, room.send]);
  useWakeLock(call.joined);

  const table = call.videos.find((v) => v.peer.role === 'host');
  const others = call.videos.filter((v) => v.peer.role !== 'host');

  return (
    <div className="app guest-mode">
      <header className="hero">
        <div className="wrap hero-row">
          <div className="brand">
            <span className="brand-mark">♠</span>
            <h1>Family Spades</h1>
            <span className="mode-chip"><Icon name="video" size={13} /> Video</span>
          </div>
          <button type="button" className="icon-btn" onClick={() => { if (confirm('Leave this game?')) { call.leave(); onLeave(); } }}>Leave</button>
        </div>
        <div className="wrap">
          {game && (
            <div className="scores">
              {[0, 1].map((t) => (
                <ScoreCard key={t} t={t} team={game.teams[t]} standing={standings(game)[t]} target={game.target}
                  showBags={game.rules.bagsEnabled} bagLimit={game.rules.bagsLimit} compact />
              ))}
            </div>
          )}
          <div className="target">
            <StatusDot on={Boolean(host)} label={host ? 'Connected to the table' : room.status === 'error' ? 'Connection problem' : 'Connecting…'} />
          </div>
        </div>
      </header>

      <main className="wrap">
        {!named ? (
          <form className="card waiting-card" onSubmit={(e) => { e.preventDefault(); if (name.trim()) { write(NAME_KEY, name.trim()); setNamed(true); } }}>
            <h2>What’s your name?</h2>
            <p className="muted">It shows under your video.</p>
            <input className="code-input name-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" autoFocus />
            <button type="submit" className="primary big" disabled={!name.trim()}>Continue</button>
          </form>
        ) : !call.joined ? (
          <div className="card waiting-card">
            <Icon name="video" size={34} />
            <h2>Join the video</h2>
            <p className="muted">
              Point this camera at your face. At the table, it adds you around the table picture on the remote
              player’s TV.
            </p>
            <button type="button" className="primary big" onClick={call.join}>Turn on camera</button>
            {call.error && <p className="scan-msg">{call.error}</p>}
          </div>
        ) : (
          <>
            <div className="guest-grid">
              <VideoTile stream={call.local} muted mirrored={call.mirrored} label={`${device.name} (you)`} micOff={!call.micOn} className="guest-self" />
              {table && <VideoTile stream={table.stream} muted={!call.speakerOn} label="The table" className="guest-tile" />}
              {others.map((v) => (
                <VideoTile key={v.peer.id} stream={v.stream} muted={!call.speakerOn} label={v.peer.name} micOff={!v.peer.mic} className="guest-tile" />
              ))}
            </div>
            <div className="card guest-controls">
              <CallButtons call={call} />
            </div>
            <SoundNote call={call} />
          </>
        )}
      </main>
    </div>
  );
}
