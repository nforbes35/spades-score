import { useEffect, useState } from 'react';
import { SUITS, RANKS, sortHand, cardLabel } from './lib/cards.js';
import { readCards, loadCardReader } from './lib/cardVision.js';
import { learnedModel, pickCards, rememberHand, forgetLearning } from './lib/learning.js';
import { Sheet, Icon, PlayingCard } from './components.jsx';

const STEPS = {
  loading: 'Getting the card reader ready (first time only)…',
  reading: 'Reading the cards…',
};

/** Photograph the remote player's dealt cards, check them, and send them to their phone. */
export default function ScanCards({ name, initial, played = [], onSend, onClose }) {
  const [cards, setCards] = useState(initial ?? []);
  const [unsure, setUnsure] = useState([]);
  const [photo, setPhoto] = useState(null);
  const [step, setStep] = useState(null);
  const [msg, setMsg] = useState(null);
  const [mixups, setMixups] = useState([]);
  // Every photo's scores this time, remembered with the final checked hand so the reader learns.
  const [scans, setScans] = useState([]);
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
    setUnsure([]);
    const started = Date.now();
    try {
      const { scores } = await readCards(file, setStep);
      const found = pickCards(scores, learnedModel().model);
      setScans((all) => [...all, scores]);
      setCards(sortHand(found.cards));
      setUnsure(found.unsure);
      setMixups(found.mixups);
      const secs = Math.round((Date.now() - started) / 1000);
      const check = found.unsure.length ? ' Cards with a dotted outline might be in the hand too: tap to add them.' : '';
      setMsg(found.cards.length === 13
        ? { ok: true, text: `Found all 13 in ${secs} seconds. Check they match, then send.` }
        : { text: `Found ${found.cards.length}. Tap cards below to add or remove until there are 13.${check}` });
    } catch (err) {
      console.warn('card reading failed', err);
      setMsg({ text: `Couldn’t read the photo on this phone. Tap ${name}'s cards in below instead.` });
    } finally {
      setStep(null);
    }
  }

  const toggle = (code) => setCards((cs) => (cs.includes(code) ? cs.filter((c) => c !== code) : sortHand([...cs, code])));
  const send = () => {
    if (cards.length !== 13 && !confirm(`That's ${cards.length} cards, not 13. Send anyway?`)) return;
    if (cards.length === 13) scans.forEach((scores) => rememberHand(scores, cards));
    onSend(cards);
  };
  const startOver = () => {
    if (!confirm('Forget everything the card reader has learned on this phone?')) return;
    forgetLearning();
    setLearned(0);
  };

  return (
    <Sheet title={`${name}'s cards`} onClose={onClose} action={{ label: 'Send', onClick: send, disabled: !cards.length }}>
      <p className="lead-text">Lay {name}'s cards out face up, spread so every corner shows, and take a photo.</p>
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
          This phone often mixes up {mixups.map(([x, y]) => `${cardLabel(x)} and ${cardLabel(y)}`).join(', ')}. Check which one it is.
        </div>
      )}

      <div className="section-title row between">
        <span>{name}'s hand</span>
        <span className={`count-pill${cards.length === 13 ? ' ok' : ''}`}>{cards.length} of 13</span>
      </div>
      {cards.length > 0 && (
        <div className="hand-preview">
          {cards.map((c) => <PlayingCard key={c} code={c} size="xs" />)}
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
                  <button key={code} type="button" className={`rank-btn${on ? ' on' : ''}${suit.red ? ' red' : ''}${!on && unsure.includes(code) ? ' maybe' : ''}`}
                    aria-pressed={on} aria-label={cardLabel(code)} disabled={used} onClick={() => toggle(code)}>{rank}</button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <p className="footnote">
        Tap a card to add or remove it. The photo is read on this phone and isn't sent or saved anywhere.
        Works best with cards spread flat in good light.
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
