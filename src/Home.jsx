import { useState } from 'react';
import { PlayingCard, Icon } from './components.jsx';
import DeckPicker from './DeckPicker.jsx';

const SHOWCASE = ['10S', 'JD', 'QC', 'KH', 'AS'];

/** The first screen: pick how you're playing tonight. */
export default function Home({ onPlayOnline, onTable, onJoin, onStats }) {
  const [joining, setJoining] = useState(false);
  const [decksOpen, setDecksOpen] = useState(false);
  const [code, setCode] = useState('');
  const clean = code.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);

  return (
    <div className="home">
      <div className="home-hero">
        <div className="home-fan" aria-hidden="true">
          {SHOWCASE.map((c, i) => (
            <PlayingCard key={c} code={c} size="lg" className="home-card" style={{ '--i': i - 2 }} />
          ))}
        </div>
        <h1 className="home-title"><span className="brand-mark">♠</span> Spades</h1>
        <p className="home-tagline">Family game night, scored for you.</p>
      </div>

      <div className="home-choices">
        <button type="button" className="choice primary-choice" onClick={onPlayOnline}>
          <span className="choice-icon"><Icon name="users" size={26} /></span>
          <span className="choice-text">
            <b>Play online</b>
            <span>Everyone on their own phone. The app deals, checks the rules and keeps score, with video chat.</span>
          </span>
          <Icon name="chevron" size={20} />
        </button>

        <button type="button" className="choice" onClick={onTable}>
          <span className="choice-icon"><Icon name="cards" size={26} /></span>
          <span className="choice-text">
            <b>Score a game at the table</b>
            <span>Play with real cards. Enter bids, tap who wins each book. Remote players welcome.</span>
          </span>
          <Icon name="chevron" size={20} />
        </button>

        {!joining ? (
          <button type="button" className="choice" onClick={() => setJoining(true)}>
            <span className="choice-icon"><Icon name="phone" size={26} /></span>
            <span className="choice-text">
              <b>Join a game</b>
              <span>Got a code from the host? Join as a player, video chat or TV.</span>
            </span>
            <Icon name="chevron" size={20} />
          </button>
        ) : (
          <form className="choice join-open" onSubmit={(e) => { e.preventDefault(); if (clean.length === 4) onJoin(clean); }}>
            <label htmlFor="home-code"><b>Game code</b></label>
            <input id="home-code" className="code-input" value={clean} onChange={(e) => setCode(e.target.value)}
              autoCapitalize="characters" autoComplete="off" placeholder="ABCD" autoFocus />
            <div className="row">
              <button type="button" className="secondary" onClick={() => setJoining(false)}>Cancel</button>
              <button type="submit" className="primary go" disabled={clean.length !== 4}>Join</button>
            </div>
          </form>
        )}
        <button type="button" className="home-stats" onClick={onStats}>
          <Icon name="trophy" size={20} /> Stats &amp; records
        </button>
        <button type="button" className="home-stats" onClick={() => setDecksOpen(true)}>
          <Icon name="cards" size={20} /> Cards &amp; table
        </button>
      </div>
      {decksOpen && <DeckPicker onClose={() => setDecksOpen(false)} />}
    </div>
  );
}
