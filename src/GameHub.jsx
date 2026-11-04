import { useState } from 'react';
import { PlayingCard, Icon } from './components.jsx';
import Domino from './dominoes/Domino.jsx';
import DeckPicker from './DeckPicker.jsx';
import { useDeck } from './lib/decks.js';

/** The first screen of Family Games: pick a game. */
export default function GameHub({ onPick, onStats }) {
  const [decksOpen, setDecksOpen] = useState(false);
  const deck = useDeck();
  return (
    <div className="home hub">
      <div className="home-hero">
        <div className="hub-showcase" aria-hidden="true">
          <PlayingCard code="AS" size="lg" className="hub-card" />
          <Domino a={6} b={6} size={124} className="hub-domino" />
          <PlayingCard code="KH" size="lg" className="hub-card two" />
        </div>
        <h1 className="home-title">Family Games</h1>
        <p className="home-tagline">Made Especially for <span className="papi">👑 Papi</span></p>
        {deck.season && <button type="button" className="home-season" onClick={() => setDecksOpen(true)}>{deck.season} theme</button>}
      </div>

      <div className="home-choices">
        <button type="button" className="choice game-choice" onClick={() => onPick('spades')}>
          <span className="choice-icon game-icon">♠</span>
          <span className="choice-text">
            <b>Spades</b>
            <span>The King of Spades! Online with video chat, or keep score at the table.</span>
          </span>
          <Icon name="chevron" size={20} />
        </button>
        <button type="button" className="choice game-choice" onClick={() => onPick('dominoes')}>
          <span className="choice-icon game-icon"><Domino a={5} b={3} vertical size={40} /></span>
          <span className="choice-text">
            <b>Dominoes</b>
            <span>Draw, Block, All Fives, Mexican Train and Chicken Foot. Double 6, 9 or 12.</span>
          </span>
          <Icon name="chevron" size={20} />
        </button>
        <button type="button" className="home-stats" onClick={onStats}>
          <Icon name="trophy" size={20} /> Stats &amp; records
        </button>
      </div>
      {decksOpen && <DeckPicker onClose={() => setDecksOpen(false)} />}
    </div>
  );
}
