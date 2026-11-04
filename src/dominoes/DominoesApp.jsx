import { useState } from 'react';
import { Icon } from '../components.jsx';
import { read, write } from '../lib/store.js';
import Domino from './Domino.jsx';

const LAST_KEY = 'dominoes-last-online';
const REJOIN_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Dominoes' own home screen: play online, join someone's game, or pick up the last one. */
export default function DominoesApp({ onAllGames, onPlayOnline, onJoin, onRejoin }) {
  const [joining, setJoining] = useState(false);
  const [code, setCode] = useState('');
  const clean = code.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
  const [last, setLast] = useState(() => { const l = read(LAST_KEY); return l?.code && Date.now() - l.at < REJOIN_WINDOW_MS ? l : null; });
  return (
    <div className="home">
      <button type="button" className="all-games" onClick={onAllGames}><Icon name="chevron" size={18} /> All games</button>
      <div className="home-hero">
        <div className="hub-showcase" aria-hidden="true">
          <Domino a={6} b={4} size={110} className="hub-domino tilt-l" />
          <Domino a={12} b={9} size={110} className="hub-domino two" />
        </div>
        <h1 className="home-title">Dominoes</h1>
        <p className="home-king">Draw · Block · All Fives</p>
      </div>
      <div className="home-choices">
        {last && (
          <div className="choice rejoin-choice">
            <button type="button" className="rejoin-go" onClick={() => onRejoin(last)}>
              <span className="choice-icon"><Icon name="users" size={26} /></span>
              <span className="choice-text"><b>Rejoin game {last.code}</b><span>{last.host ? 'You’re the host: pick up where you left off.' : 'Go back to your seat.'}</span></span>
            </button>
            <button type="button" className="rejoin-forget" aria-label="Forget this game" onClick={() => { write(LAST_KEY, null); setLast(null); }}><Icon name="close" size={18} /></button>
          </div>
        )}
        <button type="button" className="choice primary-choice" onClick={onPlayOnline}>
          <span className="choice-icon"><Icon name="users" size={26} /></span>
          <span className="choice-text"><b>Play Online</b><span>Everyone on their own phone. The app deals the tiles, checks every move and keeps score.</span></span>
          <Icon name="chevron" size={20} />
        </button>
        {!joining ? (
          <button type="button" className="choice" onClick={() => setJoining(true)}>
            <span className="choice-icon"><Icon name="phone" size={26} /></span>
            <span className="choice-text"><b>Join a game</b><span>Got a code from the host? Type it in.</span></span>
            <Icon name="chevron" size={20} />
          </button>
        ) : (
          <form className="choice join-open" onSubmit={(e) => { e.preventDefault(); if (clean.length === 4) onJoin(clean); }}>
            <label htmlFor="dom-code"><b>Game code</b></label>
            <input id="dom-code" className="code-input" value={clean} onChange={(e) => setCode(e.target.value)}
              autoCapitalize="characters" autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="go"
              data-1p-ignore data-lpignore="true" placeholder="ABCD" autoFocus />
            <div className="row">
              <button type="button" className="secondary" onClick={() => setJoining(false)}>Cancel</button>
              <button type="submit" className="primary go" disabled={clean.length !== 4}>Join</button>
            </div>
          </form>
        )}
        <p className="muted-light center small">Scoring a game at the table is coming next.</p>
      </div>
    </div>
  );
}
