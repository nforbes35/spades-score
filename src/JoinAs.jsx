import { useEffect, useState } from 'react';
import { playerName, remoteSeats } from './lib/table.js';
import { useRoom } from './lib/room.js';
import { useDevice, isTvScreen, rememberTvScreen, rememberedAsPlayer } from './lib/device.js';
import { Icon } from './components.jsx';

/** After typing a game code: play as one of the remote seats, join the video, or be the TV. */
export default function JoinAs({ code, onChoose: choose, onLeave }) {
  // Picking TV (or not) is remembered, so a TV goes straight to the table next time.
  const onChoose = (as, seat) => {
    if (['otv', 'tv', 'dtv'].includes(as)) rememberTvScreen(true);
    else if (['online', 'player', 'card', 'dominoes'].includes(as)) rememberTvScreen(false);
    choose(as, seat);
  };
  const [tvScreen] = useState(isTvScreen);
  const [playerScreen] = useState(rememberedAsPlayer);
  const [game, setGame] = useState(null);
  const [device] = useDevice(code, { role: 'lobby' });
  const room = useRoom(code, device, (m) => { if (m.type === 'state') setGame(m.game); });
  const host = room.peers.find((p) => p.role === 'host');
  const onlineHost = room.peers.find((p) => p.role === 'ohost');
  // A dominoes game: a TV (remembered) goes straight to the TV view; otherwise ask, as for Spades
  const dominoHost = room.peers.find((p) => p.role === 'dhost');
  useEffect(() => {
    if (!dominoHost) return;
    if (tvScreen) choose('dtv', null);
    else if (playerScreen) choose('dominoes', null);
  }, [Boolean(dominoHost)]);
  useEffect(() => { if (host) room.send({ type: 'hello' }, host.id); }, [host?.id, room.send]);
  const seats = game ? remoteSeats(game) : [];
  // The last choice is remembered: a TV goes straight to the table view, a phone that last played goes
  // straight into an online game. (Each view has a button to switch.)
  useEffect(() => {
    if (tvScreen) {
      if (onlineHost) choose('otv', null);
      else if (game) choose('tv', null);
    } else if (playerScreen && onlineHost) choose('online', null);
  }, [tvScreen, playerScreen, Boolean(onlineHost), Boolean(game)]);
  // Nobody answers after a while: probably an old code for a game that's over.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (game || onlineHost || dominoHost) return undefined;
    const t = setTimeout(() => setSlow(true), 15000);
    return () => clearTimeout(t);
  }, [Boolean(game || onlineHost)]);

  // An online game: play on this phone, or show the table on a TV.
  if (onlineHost || dominoHost) {
    const dom = !onlineHost;
    return (
      <div className="app">
        <header className="hero">
          <div className="wrap hero-row">
            <div className="brand"><span className="brand-mark">{dom ? '🁫' : '♠'}</span><h1>Join game {code}</h1></div>
            <button type="button" className="icon-btn" onClick={onLeave}>Cancel</button>
          </div>
        </header>
        <main className="wrap">
          <div className="section-title">How are you joining?</div>
          <div className="stack">
            <button type="button" className="card join-choice" onClick={() => onChoose(dom ? 'dominoes' : 'online', null)}>
              <Icon name="phone" />
              <span><b>Play on this phone</b><br /><span className="muted small">{dom ? 'Your tiles' : 'Your cards, bids'} and video chat.</span></span>
            </button>
            <button type="button" className="card join-choice" onClick={() => onChoose(dom ? 'dtv' : 'otv', null)}>
              <Icon name="tv" />
              <span><b>Show the table on this TV</b><br /><span className="muted small">The table big in the middle, everyone’s video and sound. Players keep their {dom ? 'tiles' : 'cards'} on their phones.</span></span>
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
            {slow && (
              <>
                <p><b>Still can’t find game {code}.</b> Check the code. The game may have ended, or the host’s phone has the app closed.</p>
                <button type="button" className="secondary" onClick={onLeave}>Back to home</button>
              </>
            )}
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
