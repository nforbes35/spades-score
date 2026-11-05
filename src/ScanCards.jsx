import { useEffect, useState } from 'react';
import { SUITS, RANKS, sortHand, cardLabel, suitName } from './lib/cards.js';
import { tr, tx } from './lib/i18n.js';
import { readCards, loadCardReader, READERS, readerDeck, setReaderDeck } from './lib/cardVision.js';
import { learnedModel, pickCards, mergeScores, rememberHand, forgetLearning } from './lib/learning.js';
import { Sheet, Icon, PlayingCard, CardText, Segmented } from './components.jsx';

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

  const [deck, setDeck] = useState(readerDeck);
  // Start the one-time model download while they deal and lay out the cards.
  useEffect(() => { loadCardReader(deck).catch(() => {}); }, [deck]);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo); }, [photo]);

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhoto(URL.createObjectURL(file));
    setMsg(null);
    const started = Date.now();
    try {
      const read = await readCards(file, setStep, deck);
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
      const combined = all.length > 1 ? ` ${tr('(combining your {n} photos)', { n: all.length })}` : '';
      const guessNote = found.guessed.length > 1
        ? tr('Found {n} for sure{combined}; the cards with a dotted outline are best guesses. Check, then send.', { n: sure, combined })
        : tr('Found {n} for sure{combined}; the card with a dotted outline is a best guess. Check, then send.', { n: sure, combined });
      setMsg(found.cards.length === 13 && !found.guessed.length
        ? { ok: true, text: tr('Found all 13 in {secs} seconds{combined}. Check they match, then send.', { secs, combined }) }
        : found.cards.length === 13
          ? { text: guessNote }
          : { text: tr('Found {n}{combined}. Take another photo, or tap cards below until there are 13.', { n: found.cards.length, combined }) });
    } catch (err) {
      console.warn('card reading failed', err);
      setMsg({ text: tr("Couldn’t read the photo on this phone. Tap {name}'s cards in below instead.", { name }) });
    } finally {
      setStep(null);
    }
  }

  const toggle = (code) => {
    setGuessed((g) => g.filter((c) => c !== code));
    setCards((cs) => (cs.includes(code) ? cs.filter((c) => c !== code) : sortHand([...cs, code])));
  };
  const send = () => {
    if (cards.length !== 13 && !confirm(tr("That's {n} cards, not 13. Send anyway?", { n: cards.length }))) return;
    if (cards.length === 13 && scans.length) rememberHand(mergeScores(scans), cards);
    onSend(cards);
  };
  const startOver = () => {
    if (!confirm(tr('Forget everything the card reader has learned on this phone?'))) return;
    forgetLearning();
    setLearned(0);
  };

  return (
    <Sheet title={tr("{name}'s cards", { name })} onClose={onClose} action={{ label: tr('Send'), onClick: send, disabled: !cards.length }}>
      <p className="lead-text">{tr("Fan {name}'s cards so every top-left corner shows, hold the phone upright, and take a photo.", { name })}</p>
      <div className="deck-pick">
        <span className="eyebrow">{tr('Cards being scanned')}</span>
        <Segmented small label={tr('Deck')} value={deck} onChange={(d) => { setDeck(d); setReaderDeck(d); }}
          options={Object.entries(READERS).map(([id, r]) => ({ id, label: tr(r.label) }))} />
      </div>
      <div className="scan-buttons">
        <label className={`primary big file-btn${busy ? ' disabled' : ''}`}>
          <Icon name="camera" /> {photo ? tr('Take another photo') : tr('Take a photo')}
          <input type="file" accept="image/*" capture="environment" onChange={onFile} disabled={busy} hidden />
        </label>
        <label className="soft file-btn">
          {tr('Choose from photos')}
          <input type="file" accept="image/*" onChange={onFile} disabled={busy} hidden />
        </label>
      </div>

      {photo && <img className="scan-photo" src={photo} alt={tr("Photo of {name}'s cards", { name })} />}
      {busy && <div className="reading"><span className="spinner" /> {tr(STEPS[step])}</div>}
      {msg && <div className={`scan-msg${msg.ok ? ' ok' : ''}`}>{msg.text}</div>}
      {mixups.length > 0 && (
        <div className="scan-msg">
          {tx('This phone often mixes up {cards}. Check which one it is.', {
            cards: mixups.map(([x, y], i) => <span key={x + y}>{i > 0 && ', '}{tx('{a} and {b}', { a: <CardText code={x} />, b: <CardText code={y} /> })}</span>),
          })}
        </div>
      )}

      <div className="section-title row between">
        <span>{tr("{name}'s hand", { name })}</span>
        <span className={`count-pill${cards.length === 13 ? ' ok' : ''}`}>{tr('{n} of 13', { n: cards.length })}</span>
      </div>
      {cards.length > 0 && (
        <div className="hand-preview">
          {cards.map((c) => <PlayingCard key={c} code={c} size="xs" className={guessed.includes(c) ? 'guess' : ''} />)}
        </div>
      )}

      <div className="card group picker">
        {SUITS.map((suit) => (
          <div key={suit.id} className="picker-suit">
            <span className={`picker-sym${suit.red ? ' red' : ''}`} aria-label={suitName(suit)}>{suit.sym}</span>
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
        {tr("Tap a card to add or remove it. Missed one? Take another photo: photos add up. The photo is read on this phone and isn't sent or saved anywhere. Works best upright, with no glare on the corners.")}
      </p>
      <p className="footnote">
        <b>{tr('It learns from your fixes.')}</b> {tr('Each time you send a checked hand of 13, it remembers what it got wrong with your cards and lighting.')}{' '}
        {learned > 0
          ? <>{learned === 1 ? tr('Learned from {n} hand so far.', { n: learned }) : tr('Learned from {n} hands so far.', { n: learned })} <button type="button" className="inline-link" onClick={startOver}>{tr('Start over')}</button></>
          : tr('Nothing learned yet.')}
      </p>
    </Sheet>
  );
}
