import { useState } from 'react';
import { SUITS, RANKS, isCard, sortHand, cardLabel } from './lib/cards.js';
import { Sheet, Icon, PlayingCard } from './components.jsx';

const MAX_SIDE = 1568;

/** Shrink a phone photo before sending it (faster, and well under upload limits). */
async function shrink(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  return { dataUrl, base64: dataUrl.split(',')[1] };
}

/** Photograph the remote player's dealt cards, check them, and send them to their phone. */
export default function ScanCards({ name, initial, played = [], onSend, onClose }) {
  const [cards, setCards] = useState(initial ?? []);
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setMsg(null);
    try {
      const { dataUrl, base64 } = await shrink(file);
      setPhoto(dataUrl);
      const res = await fetch('/api/read-cards', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ image: base64, mediaType: 'image/jpeg' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Couldn’t read the photo.');
      const found = sortHand((data.cards ?? []).filter(isCard));
      setCards(found);
      setMsg(found.length === 13
        ? { ok: true, text: 'Found all 13. Check they match, then send.' }
        : { text: `Found ${found.length}. Tap cards below to add or remove until there are 13.` });
    } catch (err) {
      setMsg({ text: `${err.message} You can tap ${name}'s cards in below instead.` });
    } finally {
      setBusy(false);
    }
  }

  const toggle = (code) => setCards((cs) => (cs.includes(code) ? cs.filter((c) => c !== code) : sortHand([...cs, code])));
  const send = () => {
    if (cards.length !== 13 && !confirm(`That's ${cards.length} cards, not 13. Send anyway?`)) return;
    onSend(cards);
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
      {busy && <div className="reading"><span className="spinner" /> Reading the cards…</div>}
      {msg && <div className={`scan-msg${msg.ok ? ' ok' : ''}`}>{msg.text}</div>}

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
                  <button key={code} type="button" className={`rank-btn${on ? ' on' : ''}${suit.red ? ' red' : ''}`}
                    aria-pressed={on} aria-label={cardLabel(code)} disabled={used} onClick={() => toggle(code)}>{rank}</button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <p className="footnote">Tap a card to add or remove it. Photo reading uses Claude; the photo isn't saved.</p>
    </Sheet>
  );
}
