import { useEffect, useRef, useState } from 'react';
import { standings, winner, isNil, nilLabel } from './lib/scoring.js';
import { SEATS, teamOf, playerName, seatEntry, stageOf, liveOf, leaderOf, booksPlayed } from './lib/table.js';
import { useRoom } from './lib/room.js';
import { useDevice } from './lib/device.js';
import { useCall } from './lib/call.js';
import { useWakeLock } from './lib/fx.js';
import { Icon, PlayingCard } from './components.jsx';
import { VideoTile } from './Video.jsx';

/**
 * TV view: open on a smart TV's browser, a laptop on HDMI, or an iPad mirrored to an Apple TV.
 * The table's rear camera fills the middle, everyone else's faces sit down both sides, and the
 * scores, bids and books run along the top. It only watches: no camera or microphone.
 */
export default function TvApp({ code, onLeave }) {
  const [game, setGame] = useState(null);
  const [started, setStarted] = useState(false);
  const [device, setDevice] = useDevice(code, { role: 'tv', name: 'TV' });
  const room = useRoom(code, device, (m) => {
    if (m.type === 'state') setGame(m.game);
    else if (m.type === 'rtc') call.handle(m);
  });
  const call = useCall({ room, me: device, setMe: setDevice, receiveOnly: true });
  const host = room.peers.find((p) => p.role === 'host');
  useEffect(() => { if (host) room.send({ type: 'hello' }, host.id); }, [host?.id, room.send]);
  useWakeLock(started);
  const idle = useIdleCursor();

  // A TV needs one click or tap before it may play sound; that's also when it goes full screen.
  const start = () => {
    setStarted(true);
    call.join();
    document.documentElement.requestFullscreen?.().catch(() => {});
  };

  const table = call.videos.find((v) => v.peer.role === 'host');
  const faces = call.videos.filter((v) => v.peer.role !== 'host' && v.peer.role !== 'tv');
  const left = faces.filter((_, i) => i % 2 === 0);
  const right = faces.filter((_, i) => i % 2 === 1);

  return (
    <div className={`tv${idle ? ' idle' : ''}`}>
      {game && <TvScoreboard game={game} />}
      <div className={`tv-stage${faces.length ? '' : ' solo'}`}>
        <div className="tv-side">
          {left.map((v) => <Face key={v.peer.id} v={v} muted={!call.speakerOn} />)}
        </div>
        <div className="tv-center">
          {table
            ? <VideoTile stream={table.stream} muted={!call.speakerOn} fit="contain" label="The table" className="tv-table" />
            : <div className="tv-waiting">{host ? 'Waiting for the table’s camera…' : `Waiting for the table to open game ${code}…`}</div>}
        </div>
        <div className="tv-side">
          {right.map((v) => <Face key={v.peer.id} v={v} muted={!call.speakerOn} />)}
        </div>
      </div>
      <div className="tv-corner">
        <span className={`tv-dot${host ? ' on' : ''}`} />
        {call.soundBy ? `Sound: ${call.soundBy.name || 'phone'}` : 'Sound on this screen'}
        <button type="button" onClick={call.toggleSpeaker} aria-label={call.speakerOn ? 'Turn sound off' : 'Turn sound on'}>
          <Icon name={call.speakerOn ? 'speaker' : 'speakerOff'} size={18} />
        </button>
        <button type="button" onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})} aria-label="Full screen">
          <Icon name="expand" size={18} />
        </button>
        <button type="button" onClick={() => { if (confirm('Close the TV view?')) onLeave(); }} aria-label="Close TV view">
          <Icon name="close" size={18} />
        </button>
      </div>
      {!started && (
        <button type="button" className="tv-start" onClick={start}>
          <span className="brand-mark">♠</span>
          <b>Spades TV view</b>
          <span>Game {code}</span>
          <span className="tv-start-go">Click or tap to start</span>
        </button>
      )}
    </div>
  );
}

function Face({ v, muted }) {
  const seatName = v.peer.role === 'player' ? v.peer.name : v.peer.name || 'Guest';
  return <VideoTile stream={v.stream} muted={muted} label={seatName} micOff={!v.peer.mic} className="tv-face" />;
}

/** Hide the mouse pointer after a few still seconds (laptops on HDMI). */
function useIdleCursor() {
  const [idle, setIdle] = useState(false);
  const timer = useRef();
  useEffect(() => {
    const wake = () => {
      setIdle(false);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setIdle(true), 3000);
    };
    wake();
    addEventListener('mousemove', wake);
    addEventListener('touchstart', wake);
    return () => { removeEventListener('mousemove', wake); removeEventListener('touchstart', wake); clearTimeout(timer.current); };
  }, []);
  return idle;
}

function TvScoreboard({ game }) {
  const stand = standings(game);
  const win = winner(game);
  const hand = game.hands.find((h) => h.inPlay);
  const stage = hand ? stageOf(hand) : null;
  const live = hand ? liveOf(hand) : null;
  const leader = stage === 'play' ? leaderOf(hand) : null;
  const played = Object.entries(live?.played ?? {}).filter(([, c]) => c);
  return (
    <div className="tv-top">
      <div className="tv-scores">
        {[0, 1].map((t) => (
          <div key={t} className={`tv-team t${t}${win === t ? ' won' : ''}`}>
            <span>{game.teams[t].name}</span>
            <b>{stand[t].score}</b>
          </div>
        ))}
      </div>
      {hand ? (
        <div className="tv-seats">
          {SEATS.map((_, s) => {
            const p = seatEntry(hand, s);
            return (
              <div key={s} className={`tv-seat t${teamOf(s)}${leader === s ? ' leading' : ''}`}>
                <span className="tv-seat-name">{playerName(game, s)}</span>
                <span className="tv-seat-num">
                  {stage === 'bids'
                    ? (isNil(p.call) ? nilLabel(p.call) : `bid ${p.bid}`)
                    : <>{p.books}<small>/{isNil(p.call) ? nilLabel(p.call) : p.bid}</small></>}
                </span>
                {leader === s && <span className="tv-lead">leads</span>}
              </div>
            );
          })}
          <div className="tv-book">
            {stage === 'bids' ? 'Bidding' : booksPlayed(hand) >= 13 ? 'All 13 played' : `Book ${booksPlayed(hand) + 1} of 13`}
            {played.length > 0 && (
              <span className="tv-played">
                {played.map(([seat, card]) => (
                  <span key={seat}><PlayingCard code={card} size="xs" /> {playerName(game, Number(seat))}</span>
                ))}
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="tv-book">{win != null ? `${game.teams[win].name} win!` : `Playing to ${game.target}`}</div>
      )}
    </div>
  );
}
