import { Icon } from '../components.jsx';
import Domino from './Domino.jsx';

/** Dominoes: the game's own home screen (play online, score at the table). Being built. */
export default function DominoesApp({ onAllGames }) {
  return (
    <div className="home">
      <button type="button" className="all-games" onClick={onAllGames}><Icon name="chevron" size={18} /> All games</button>
      <div className="home-hero">
        <div className="hub-showcase" aria-hidden="true">
          <Domino a={6} b={4} size={96} className="hub-domino" />
          <Domino a={12} b={9} size={96} className="hub-domino two" />
        </div>
        <h1 className="home-title">Dominoes</h1>
        <p className="home-tagline">Coming soon: online play and table scoring.</p>
      </div>
    </div>
  );
}
