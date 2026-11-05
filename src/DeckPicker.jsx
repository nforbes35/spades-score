import { DECKS, setDeck, useDeck } from './lib/decks.js';
import { Sheet, PlayingCard, CardBack } from './components.jsx';
import { tr } from './lib/i18n.js';

/** Pick the deck this device plays with: card backs, face cards and the table. */
export default function DeckPicker({ onClose }) {
  const deck = useDeck();
  const groups = [...new Set(DECKS.map((d) => d.group))];
  return (
    <Sheet title={tr('Cards & table')} onClose={onClose} closeLabel={tr('Done')}>
      <p className="muted">{tr('Just for this phone: everyone can pick their own deck.')}</p>
      {groups.map((g) => (
        <div key={g} className="deck-group">
          <div className="section-title">{tr(g)}</div>
          <div className="deck-grid">
            {DECKS.filter((d) => d.group === g).map((d) => (
              <button key={d.id} type="button" className={`deck-tile${deck.id === d.id ? ' on' : ''}`} onClick={() => setDeck(d.id)} aria-pressed={deck.id === d.id}>
                <span className="deck-preview">
                  <span className="felt-swatch" style={{ background: d.table ?? 'radial-gradient(70% 60% at 50% 42%, #2a9a5e, #17713f 55%, #0d4a28 100%)' }} />
                  <CardBack size="sm" className={d.back ? 'themed' : ''} style={d.back ? { background: d.back } : undefined} />
                  <PlayingCard code="KH" size="sm" className="face" faces={d.faces} />
                </span>
                {tr(d.name)}
                {d.season && <span className="deck-sub">{tr('Now: {season}', { season: tr(d.season) })}</span>}
              </button>
            ))}
          </div>
        </div>
      ))}
      <p className="footnote">{tr('Face cards: public-domain artwork by Byron Knoll. Photos: NASA, U.S. National Park Service, NOAA and Wikimedia Commons (public domain / CC0); season and holiday photos from Unsplash. Verses: King James Version. Team decks use team colours only.')}</p>
    </Sheet>
  );
}
