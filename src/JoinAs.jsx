import { useEffect, useState } from 'react';
import { playerName, remoteSeats } from './lib/table.js';
import { useRoom } from './lib/room.js';
import { useDevice } from './lib/device.js';
import { Icon } from './components.jsx';

/** After typing a game code: play as one of the remote seats, join the video, or be the TV. */
export default function JoinAs({ code, onChoose, onLeave }) {
  const [game, setGame] = useState(null);
  const [device] = useDevice(code, { role: 'lobby' });
  const room = useRoom(code, device, (m) => { if (m.type === 'state') setGame(m.game); });
  const host = room.peers.find((p) => p.role === 'host');
  const onlineHost = room.peers.find((p) => p.role === 'ohost');
  useEffect(() => { if (host) room.send({ type: 'hello' }, host.id); }, [host?.id, room.send]);
  const seats = game ? remoteSeats(game) : [];

  // An online game: play on this phone, or show the table on a TV.
  if (onlineHost) {
    return (
      <div className="app">
        <header className="hero">
          <div className="wrap hero-row">
            <div className="brand"><span className="brand-mark">♠</span><h1>Join game {code}</h1></div>
            <button type="button" className="icon-btn" onClick={onLeave}>Cancel</button>
          </div>
        </header>
        <main className="wrap">
          <div className="section-title">How are you joining?</div>
          <div className="stack">
            <button type="button" className="card join-choice" onClick={() => onChoose('online', null)}>
              <Icon name="phone" />
              <span><b>Play on this phone</b><br /><span className="muted small">Your cards, bids and video chat.</span></span>
            </button>
            <button type="button" className="card join-choice" onClick={() => onChoose('otv', null)}>
              <Icon name="tv" />
              <span><b>Show the table on this TV</b><br /><span className="muted small">The table big in the middle, everyone’s video and sound. Players keep their cards on their phones.</span></span>
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="hero">
        <div className="wrap hero-row">
          <div className="brand"><span className="brand-mark">♠</span><h1>Join game {code}</h1></div>
          <button type="button" className="icon-btn" onClick={onLeave}>Cancel</button>
        </div>
      </header>
      <main className="wrap">
        {!game && (
          <div className="card waiting-card">
            <span className="spinner" />
            <h2>Finding the table…</h2>
            <p className="muted">Make sure the scorekeeper has Spades open and invited you.</p>
          </div>
        )}
        {game && (
          <>
            <div className="section-title">How are you joining?</div>
            <div className="stack">
              {seats.map((s) => (
                <button key={s} type="button" className="card join-choice" onClick={() => onChoose('player', s)}>
                  <Icon name="phone" />
                  <span><b>I’m {playerName(game, s)}</b><br /><span className="muted small">Play from this phone: your cards, bids and books.</span></span>
                </button>
              ))}
              {seats.map((s) => (
                <button key={`card${s}`} type="button" className="card join-choice" onClick={() => onChoose('card', s)}>
                  <Icon name="cards" />
                  <span><b>Show {playerName(game, s)}’s card</b><br /><span className="muted small">Lay this device on the table in {playerName(game, s)}’s spot. Their card fills the screen.</span></span>
                </button>
              ))}
              <button type="button" className="card join-choice" onClick={() => onChoose('guest', null)}>
                <Icon name="video" />
                <span><b>Video chat</b><br /><span className="muted small">Add your face, at the table or from home. No cards.</span></span>
              </button>
              <button type="button" className="card join-choice" onClick={() => onChoose('tv', null)}>
                <Icon name="tv" />
                <span><b>TV view</b><br /><span className="muted small">On a TV browser, laptop or iPad: the table big, everyone’s faces around it.</span></span>
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
