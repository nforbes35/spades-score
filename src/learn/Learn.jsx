// How to play: pick a game, read the rules and how to win, or play a practice game with the coach.
import { lazy, Suspense, useState } from 'react';
import { Sheet, Icon, LangToggle } from '../components.jsx';
import { getLang, tr } from '../lib/i18n.js';
import { GAMES, gameById } from './rules.js';

const Practice = lazy(() => import('./Practice.jsx'));

const RulesBody = ({ game }) => {
  const lang = getLang();
  return (
    <>
      <p className="learn-short">{game.short[lang]}</p>
      {game.sections.map((s) => (
        <section key={s.title.en} className={`card learn-section${s.tips ? ' tips' : ''}`}>
          <h3>{s.tips ? '🏆 ' : ''}{s.title[lang]}</h3>
          <ul>{s.points.map((p) => <li key={p.en}>{p[lang]}</li>)}</ul>
        </section>
      ))}
    </>
  );
};

/** Just the rules of one game, for the menu in the middle of a game. */
export function RulesSheet({ gameId, onClose }) {
  const game = gameById(gameId);
  return <Sheet title={game.name[getLang()]} onClose={onClose} closeLabel={tr('Done')}><RulesBody game={game} /></Sheet>;
}

/** The whole Learn to play screen. `start`: open on one game. */
export default function LearnApp({ start = null, onClose }) {
  const [gameId, setGameId] = useState(start);
  const [playing, setPlaying] = useState(false);
  const lang = getLang();
  const game = gameId && gameById(gameId);
  if (playing) return <Suspense fallback={<div className="learn-wait">{tr('Dealing…')}</div>}><Practice gameId={gameId} onExit={() => setPlaying(false)} /></Suspense>;
  if (game) {
    return (
      <Sheet title={game.name[lang]} onClose={() => (start ? onClose() : setGameId(null))} closeLabel={start ? tr('Done') : tr('Back')}>
        <button type="button" className="primary learn-practice" onClick={() => setPlaying(true)}>🎓 {tr('Play a practice game')}</button>
        <p className="muted small center">{tr('Play against the computer while a coach teaches you the rules and how to win.')}</p>
        <RulesBody game={game} />
        <button type="button" className="primary learn-practice" onClick={() => setPlaying(true)}>🎓 {tr('Play a practice game')}</button>
      </Sheet>
    );
  }
  return (
    <Sheet title={tr('Learn to play')} onClose={onClose} closeLabel={tr('Done')}>
      <LangToggle />
      <p className="muted small center">{tr('Pick a game to read its rules or practice with a coach.')}</p>
      <div className="learn-list">
        {GAMES.map((g) => (
          <button key={g.id} type="button" className="card learn-game" onClick={() => setGameId(g.id)}>
            <span className="learn-icon">{g.icon}</span>
            <span className="learn-text"><b>{g.name[lang]}</b><span>{g.short[lang]}</span></span>
            <Icon name="chevron" size={18} />
          </button>
        ))}
      </div>
    </Sheet>
  );
}
