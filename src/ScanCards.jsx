import { useEffect, useState } from 'react';
import { SUITS, RANKS, sortHand, cardLabel } from './lib/cards.js';
import { readCards, loadCardReader } from './lib/cardVision.js';
import { learnedModel, pickCards, mergeScores, rememberHand, forgetLearning } from './lib/learning.js';
import { Sheet, Icon, PlayingCard, CardText } from './components.jsx';

const STEPS = {
  loading: 'Getting the card reader ready (first time only)…',
  reading: 'Reading the cards…',
};

/** Photograph the remote player's dealt cards, check them, and send them to their phone. */
export default function ScanCards({ name, initial, played = [], onSend, onClose }) {
  const [cards, setCards] = useState(initial ?? []);
  const [unsure, setUnsure] = useState([]);
  const [guessed, setGuessed] = useState([]);
  const [photo, setPhoto] = useState(null);
  const [step, setStep] = useState(null);
  const [msg, setMsg] = useState(null);
  const [mixups, setMixups] = useState([]);
  // Every photo's scores this time. Photos add up (a card hidden in one may show in another), and the
  // combined scores are remembered with the final checked hand so the reader learns.
  const [scans, setScans] = useState([]);
  const [shadowed, setShadowed] = useState([]);
  const [learned, setLearned] = useState(() => learnedModel().count);
  const busy = Boolean(step);

  // Start the one-time model download while they deal and lay out the cards.
  useEffect(() => { loadCardReader().catch(() => {}); }, []);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo); }, [photo]);

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhoto(URL.createObjectURL(file));
    setMsg(null);
    const started = Date.now();
    try {
      const read = await readCards(file, setStep);
      const all = [...scans, read.scores];
      const noGuess = [...new Set([...shadowed, ...read.shadowed])];
      const found = pickCards(mergeScores(all), learnedModel().model, { noGuess });
      setScans(all);
      setShadowed(noGuess);
      setCards(sortHand(found.cards));
      setGuessed(found.guessed);
      setUnsure(found.unsure);
      setMixups(found.mixups);
      const secs = Math.round((Date.now() - started) / 1000);
      const sure = found.cards.length - found.guessed.length;
      const combined = all.length > 1 ? ` (combining your ${all.length} photos)` : '';
      const guessNote = found.guessed.length
        ? ` Found ${sure} for sure${combined}; the card${found.guessed.length > 1 ? 's' : ''} with a dotted outline ${found.guessed.length > 1 ? 'are best guesses' : 'is a best guess'}. Check, then send.`
        : '';
      setMsg(found.cards.length === 13 && !found.guessed.length
        ? { ok: true, text: `Found all 13 in ${secs} seconds${combined}. Check they match, then send.` }
        : found.cards.length === 13
          ? { text: guessNote.trim() }
          : { text: `Found ${found.cards.length}${combined}. Take another photo, or tap cards below until there are 13.` });
    } catch (err) {
      console.warn('card reading failed', err);
      setMsg({ text: `Couldn’t read the photo on this phone. Tap ${name}'s cards in below instead.` });
    } finally {
      setStep(null);
    }
  }

  const toggle = (code) => {
    setGuessed((g) => g.filter((c) => c !== code));
    setCards((cs) => (cs.includes(code) ? cs.filter((c) => c !== code) : sortHand([...cs, code])));
  };
  const send = () => {
    if (cards.length !== 13 && !confirm(`That's ${cards.length} cards, not 13. Send anyway?`)) return;
    if (cards.length === 13 && scans.length) rememberHand(mergeScores(scans), cards);
    onSend(cards);
  };
  const startOver = () => {
    if (!confirm('Forget everything the card reader has learned on this phone?')) return;
    forgetLearning();
    setLearned(0);
  };

  return (
    <Sheet title={`${name}'s cards`} onClose={onClose} action={{ label: 'Send', onClick: send, disabled: !cards.length }}>
      <p className="lead-text">Fan {name}'s cards so every top-left corner shows, hold the phone upright, and take a photo.</p>
      <div className="scan-buttons">
        <label className={`primary big file-btn${busy ? ' disabled' : ''}`}>
          <Icon name="camera" /> {photo ? 'Take another photo' : 'Take a photo'}
          <input type="file" accept="image/*" capture="environment" onChange={onFile} disabled={busy} hidden />
        </label>
        <label className="soft file-btn">
          Choose from photos
          <input type="file" accept="image/*" onChange={onFile} disabled={busy} hidden />
        </label>
      </div>

      {photo && <img className="scan-photo" src={photo} alt={`Photo of ${name}'s cards`} />}
      {busy && <div className="reading"><span className="spinner" /> {STEPS[step]}</div>}
      {msg && <div className={`scan-msg${msg.ok ? ' ok' : ''}`}>{msg.text}</div>}
      {mixups.length > 0 && (
        <div className="scan-msg">
          This phone often mixes up {mixups.map(([x, y], i) => <span key={x + y}>{i > 0 && ', '}<CardText code={x} /> and <CardText code={y} /></span>)}. Check which one it is.
        </div>
      )}

      <div className="section-title row between">
        <span>{name}'s hand</span>
        <span className={`count-pill${cards.length === 13 ? ' ok' : ''}`}>{cards.length} of 13</span>
      </div>
      {cards.length > 0 && (
        <div className="hand-preview">
          {cards.map((c) => <PlayingCard key={c} code={c} size="xs" className={guessed.includes(c) ? 'guess' : ''} />)}
        </div>
      )}

      <div className="card group picker">
        {SUITS.map((suit) => (
          <div key={suit.id} className="picker-suit">
            <span className={`picker-sym${suit.red ? ' red' : ''}`} aria-label={suit.name}>{suit.sym}</span>
            <div className="picker-ranks">
              {RANKS.map((rank) => {
                const code = rank + suit.id;
                const on = cards.includes(code);
                const used = played.includes(code);
                return (
                  <button key={code} type="button" className={`rank-btn${on ? ' on' : ''}${suit.red ? ' red' : ''}${(!on && unsure.includes(code)) || guessed.includes(code) ? ' maybe' : ''}`}
                    aria-pressed={on} aria-label={cardLabel(code)} disabled={used} onClick={() => toggle(code)}>{rank}</button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <p className="footnote">
        Tap a card to add or remove it. Missed one? Take another photo: photos add up. The photo is read on
        this phone and isn't sent or saved anywhere. Works best upright, with no glare on the corners.
      </p>
      <p className="footnote">
        <b>It learns from your fixes.</b> Each time you send a checked hand of 13, it remembers what it got
        wrong with your cards and lighting.{' '}
        {learned > 0
          ? <>Learned from {learned} hand{learned === 1 ? '' : 's'} so far. <button type="button" className="inline-link" onClick={startOver}>Start over</button></>
          : 'Nothing learned yet.'}
      </p>
    </Sheet>
  );
}
