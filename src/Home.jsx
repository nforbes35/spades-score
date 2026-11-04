import { useState } from 'react';
import { PlayingCard, Icon } from './components.jsx';
import DeckPicker from './DeckPicker.jsx';
import { useDeck } from './lib/decks.js';

const SHOWCASE = ['10S', 'JD', 'QC', 'KH', 'AS'];

/** "Today 7:42 PM", "Yesterday", or a date. */
export function savedWhen(at) {
  const d = new Date(at), now = new Date();
  const days = Math.round((new Date(now.toDateString()) - new Date(d.toDateString())) / 86400000);
  if (days === 0) return `Today ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  if (days === 1) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/** The first screen: pick how you're playing tonight. */
export default function Home({ onAllGames, onPlayOnline, onTable, onJoin, onStats, rejoin, onRejoin, onForget, saved = [], onResume, onForgetSaved }) {
  const [joining, setJoining] = useState(false);
  const [decksOpen, setDecksOpen] = useState(false);
  const [code, setCode] = useState('');
  const deck = useDeck();
  const clean = code.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);

  return (
    <div className="home">
      {onAllGames && <button type="button" className="all-games" onClick={onAllGames}><Icon name="chevron" size={18} /> All games</button>}
      <div className="home-hero">
        <div className="home-fan" aria-hidden="true">
          {SHOWCASE.map((c, i) => (
            <PlayingCard key={c} code={c} size="lg" className="home-card" style={{ '--i': i - 2 }} />
          ))}
        </div>
        <h1 className="home-title"><span className="brand-mark">♠</span> Family Spades</h1>
        <p className="home-tagline">Made Especially for <span className="papi">👑 Papi</span></p>
        <p className="home-king">The King of Spades!</p>
        {deck.season && <button type="button" className="home-season" onClick={() => setDecksOpen(true)}>{deck.season} theme</button>}
      </div>

      <div className="home-choices">
        {rejoin && (
          <div className="choice rejoin-choice">
            <button type="button" className="rejoin-go" onClick={onRejoin}>
              <span className="choice-icon"><Icon name="users" size={26} /></span>
              <span className="choice-text">
                <b>Rejoin game {rejoin.code}</b>
                <span>{rejoin.host ? 'You’re the host: pick up where you left off.' : 'Go back to your seat.'}</span>
              </span>
            </button>
            <button type="button" className="rejoin-forget" aria-label="Forget this game" onClick={onForget}><Icon name="close" size={18} /></button>
          </div>
        )}
        {saved.length > 0 && (
          <div className="saved-games">
            <div className="saved-title">Saved games</div>
            {saved.map((e) => (
              <div key={e.id} className="choice saved-choice">
                <button type="button" className="rejoin-go" onClick={() => onResume(e)}>
                  <span className="choice-icon"><Icon name={e.kind === 'online' ? 'users' : 'cards'} size={24} /></span>
                  <span className="choice-text">
                    <b>{e.teams.map((t) => `${t.name} ${t.score}`).join(' · ')}</b>
                    <span>
                      {e.kind === 'online' ? `Online · code ${e.code}` : 'At the table'}
                      {` · ${e.hands} hand${e.hands === 1 ? '' : 's'} · ${savedWhen(e.at)}`}
                    </span>
                    {e.teams.some((t) => t.players?.length && t.players.join(' & ') !== t.name) && <span className="saved-players">{e.teams.map((t) => t.players.join(' & ')).join('  vs  ')}</span>}
                  </span>
                </button>
                <button type="button" className="rejoin-forget" aria-label="Delete this saved game" onClick={() => onForgetSaved(e)}><Icon name="close" size={18} /></button>
              </div>
            ))}
          </div>
        )}
        <button type="button" className="choice primary-choice" onClick={onPlayOnline}>
          <span className="choice-icon"><Icon name="users" size={26} /></span>
          <span className="choice-text">
            <b>Play Online</b>
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
              autoCapitalize="characters" autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="go"
              data-1p-ignore data-lpignore="true" placeholder="ABCD" autoFocus />
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
