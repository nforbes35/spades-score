import { useState } from 'react';
import { Icon, LangToggle } from '../components.jsx';
import LearnApp from '../learn/Learn.jsx';
import { read, write } from '../lib/store.js';
import Domino from './Domino.jsx';
import { savedGames, forgetSaved } from '../lib/saved.js';
import { savedWhen } from '../Home.jsx';
import { AlbumSheet } from './Fun.jsx';
import { tr } from '../lib/i18n.js';

const dominoSaves = () => savedGames().filter((e) => e.kind === 'dominoes');

const LAST_KEY = 'dominoes-last-online';
const REJOIN_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Dominoes' own home screen: play online, join someone's game, or pick up the last one. */
export default function DominoesApp({ onAllGames, onPlayOnline, onJoin, onRejoin }) {
  const [joining, setJoining] = useState(false);
  const [code, setCode] = useState('');
  const clean = code.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
  const [last, setLast] = useState(() => { const l = read(LAST_KEY); return l?.code && Date.now() - l.at < REJOIN_WINDOW_MS ? l : null; });
  const [saved, setSaved] = useState(dominoSaves);
  const [albumOpen, setAlbumOpen] = useState(false);
  const [learnOpen, setLearnOpen] = useState(false);
  const forget = (e) => {
    if (!confirm(tr('Delete this saved game?'))) return;
    forgetSaved(e.id); write(`dominoes-online-table-${e.code}`, null); setSaved(dominoSaves());
  };
  return (
    <div className="home">
      <button type="button" className="all-games" onClick={onAllGames}><Icon name="chevron" size={18} /> {tr('All games')}</button>
      <div className="home-hero">
        <div className="hub-showcase" aria-hidden="true">
          <Domino a={6} b={4} size={110} className="hub-domino tilt-l" />
          <Domino a={12} b={9} size={110} className="hub-domino two" />
        </div>
        <h1 className="home-title">{tr('Dominoes')}</h1>
        <p className="home-king">{tr('Draw · Block · All Fives · Mexican Train · Chicken Foot')}</p>
      </div>
      <div className="home-choices">
        {last && (
          <div className="choice rejoin-choice">
            <button type="button" className="rejoin-go" onClick={() => onRejoin(last)}>
              <span className="choice-icon"><Icon name="users" size={26} /></span>
              <span className="choice-text"><b>{tr('Rejoin game {code}', { code: last.code })}</b><span>{last.host ? tr('You’re the host: pick up where you left off.') : tr('Go back to your seat.')}</span></span>
            </button>
            <button type="button" className="rejoin-forget" aria-label={tr('Forget this game')} onClick={() => { write(LAST_KEY, null); setLast(null); }}><Icon name="close" size={18} /></button>
          </div>
        )}
        {saved.length > 0 && (
          <div className="saved-games">
            <div className="saved-title">{tr('Saved games')}</div>
            {saved.map((e) => (
              <div key={e.id} className="choice saved-choice">
                <button type="button" className="rejoin-go" onClick={() => { forgetSaved(e.id); onRejoin({ code: e.code, host: true }); }}>
                  <span className="choice-icon"><Icon name="users" size={24} /></span>
                  <span className="choice-text">
                    <b>{e.teams.map((t) => `${t.name} ${t.score}`).join(' · ')}</b>
                    <span>{e.hands === 1 ? tr('Code {code} · {n} hand · to {target} · {when}', { code: e.code, n: e.hands, target: e.target, when: savedWhen(e.at) }) : tr('Code {code} · {n} hands · to {target} · {when}', { code: e.code, n: e.hands, target: e.target, when: savedWhen(e.at) })}</span>
                  </span>
                </button>
                <button type="button" className="rejoin-forget" aria-label={tr('Delete this saved game')} onClick={() => forget(e)}><Icon name="close" size={18} /></button>
              </div>
            ))}
          </div>
        )}
        <button type="button" className="choice primary-choice" onClick={onPlayOnline}>
          <span className="choice-icon"><Icon name="users" size={26} /></span>
          <span className="choice-text"><b>{tr('Play Online')}</b><span>{tr('Everyone on their own phone. The app deals the tiles, checks every move and keeps score.')}</span></span>
          <Icon name="chevron" size={20} />
        </button>
        {!joining ? (
          <button type="button" className="choice" onClick={() => setJoining(true)}>
            <span className="choice-icon"><Icon name="phone" size={26} /></span>
            <span className="choice-text"><b>{tr('Join a game')}</b><span>{tr('Got a code from the host? Type it in.')}</span></span>
            <Icon name="chevron" size={20} />
          </button>
        ) : (
          <form className="choice join-open" onSubmit={(e) => { e.preventDefault(); if (clean.length === 4) onJoin(clean); }}>
            <label htmlFor="dom-code"><b>{tr('Game code')}</b></label>
            <input id="dom-code" className="code-input" value={clean} onChange={(e) => setCode(e.target.value)}
              autoCapitalize="characters" autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="go"
              data-1p-ignore data-lpignore="true" placeholder="ABCD" autoFocus />
            <div className="row">
              <button type="button" className="secondary" onClick={() => setJoining(false)}>{tr('Cancel')}</button>
              <button type="submit" className="primary go" disabled={clean.length !== 4}>{tr('Join')}</button>
            </div>
          </form>
        )}
        <LangToggle />
        <button type="button" className="home-stats" onClick={() => setLearnOpen(true)}>🎓 {tr('Learn to play')}</button>
        <button type="button" className="home-stats" onClick={() => setAlbumOpen(true)}>📸 {tr('Family album')}</button>
        <p className="muted-light center small">{tr('Scoring a game at the table is coming next.')}</p>
      </div>
      {learnOpen && <LearnApp onClose={() => setLearnOpen(false)} />}
      {albumOpen && <AlbumSheet onClose={() => setAlbumOpen(false)} />}
    </div>
  );
}
