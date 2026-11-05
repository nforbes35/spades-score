import { useEffect, useState } from 'react';
import { read, write } from './lib/store.js';
import { isNil, nilLabel } from './lib/scoring.js';
import { playerName, seatEntry, stageOf, liveOf, booksPlayed, remoteSeats } from './lib/table.js';
import { parseCard, cardName } from './lib/cards.js';
import { useRoom } from './lib/room.js';
import { useDevice } from './lib/device.js';
import { useWakeLock } from './lib/fx.js';
import { tr } from './lib/i18n.js';

const TURN_KEY = 'spades-card-display-turn';

// Where the suit symbols go on number cards, as [x, y] across the card's middle area (0 to 1).
// Symbols in the lower half are drawn upside down, like a printed card.
const L = 0.22;
const C = 0.5;
const R = 0.78;
const PIPS = {
  A: [[C, 0.5]],
  2: [[C, 0.12], [C, 0.88]],
  3: [[C, 0.12], [C, 0.5], [C, 0.88]],
  4: [[L, 0.12], [R, 0.12], [L, 0.88], [R, 0.88]],
  5: [[L, 0.12], [R, 0.12], [C, 0.5], [L, 0.88], [R, 0.88]],
  6: [[L, 0.12], [R, 0.12], [L, 0.5], [R, 0.5], [L, 0.88], [R, 0.88]],
  7: [[L, 0.12], [R, 0.12], [C, 0.31], [L, 0.5], [R, 0.5], [L, 0.88], [R, 0.88]],
  8: [[L, 0.12], [R, 0.12], [C, 0.31], [L, 0.5], [R, 0.5], [C, 0.69], [L, 0.88], [R, 0.88]],
  9: [[L, 0.12], [R, 0.12], [L, 0.37], [R, 0.37], [C, 0.5], [L, 0.63], [R, 0.63], [L, 0.88], [R, 0.88]],
  10: [[L, 0.12], [R, 0.12], [C, 0.25], [L, 0.37], [R, 0.37], [L, 0.63], [R, 0.63], [C, 0.75], [L, 0.88], [R, 0.88]],
};

/** A full-size card face, laid out like a printed one. */
export function BigCard({ code }) {
  const { rank, suit } = parseCard(code);
  const court = ['J', 'Q', 'K'].includes(rank);
  return (
    <div className={`big-card${suit.red ? ' red' : ''}`} role="img" aria-label={cardName(code)}>
      <span className="bc-corner"><b>{rank}</b><i>{suit.sym}</i></span>
      <span className="bc-corner flip"><b>{rank}</b><i>{suit.sym}</i></span>
      {court ? (
        <div className="bc-court">
          <b>{rank}</b>
          <i>{suit.sym}</i>
          <b className="flip">{rank}</b>
        </div>
      ) : (
        <div className={`bc-pips${rank === 'A' ? ' ace' : ''}`}>
          {PIPS[rank].map(([x, y], i) => (
            <span key={i} style={{ left: `${x * 100}%`, top: `${y * 100}%` }} className={y > 0.55 ? 'down' : ''}>{suit.sym}</span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Card display: a phone or tablet laid on the table in a remote player's spot. When they play, their
 * card fills the screen, as if they'd tossed it in; it stays until the book is taken. Tap to turn it
 * round so it faces the right way across the table.
 */
export default function CardDisplayApp({ code, seat, onLeave }) {
  const [game, setGame] = useState(null);
  const [turn, setTurn] = useState(() => read(TURN_KEY) ?? 0);
  const [device] = useDevice(code, { role: 'card', name: '', seat });
  const room = useRoom(code, device, (m) => { if (m.type === 'state') setGame(m.game); });
  const host = room.peers.find((p) => p.role === 'host');
  useEffect(() => { if (host) room.send({ type: 'hello' }, host.id); }, [host?.id, room.send]);
  useWakeLock(true);

  const rotate = () => {
    const next = (turn + 90) % 360;
    setTurn(next);
    write(TURN_KEY, next);
    document.documentElement.requestFullscreen?.().catch(() => {});
  };

  const name = game ? playerName(game, seat) : '';
  const hand = game?.hands.find((h) => h.inPlay) ?? null;
  const stage = hand ? stageOf(hand) : null;
  const card = hand ? liveOf(hand).played[seat] ?? null : null;
  const entry = hand ? seatEntry(hand, seat) : null;
  const notRemote = game && !remoteSeats(game).includes(seat);

  let caption = tr('Waiting for game {code}…', { code });
  if (game && notRemote) caption = tr("{name} isn't playing remotely", { name });
  else if (game && !hand) caption = tr("{name}'s card shows here", { name });
  else if (stage === 'bids') caption = entry && isNil(entry.call) ? tr('{name} went {nil}', { name, nil: nilLabel(entry.call) }) : tr('{name} bid {n}', { name, n: entry?.bid ?? 0 });
  else if (stage === 'play' && !card) caption = tr('Book {n}: waiting for {name}', { n: Math.min(13, booksPlayed(hand) + 1), name });

  return (
    <div className="card-display" onClick={rotate}>
      <div className={`cd-turn${turn % 180 ? ' sideways' : ''}`} style={{ transform: `rotate(${turn}deg)` }}>
        {card
          ? <div className="cd-card" key={card}><BigCard code={card} /></div>
          : <div className="cd-back"><div className="cd-back-inner"><span className="brand-mark">♠</span></div></div>}
        <div className="cd-caption">
          <span className={`tv-dot${host ? ' on' : ''}`} />
          {card ? name : caption}
        </div>
      </div>
      <button type="button" className="cd-leave" onClick={(e) => { e.stopPropagation(); if (confirm(tr('Stop showing cards on this device?'))) onLeave(); }}>
        {tr('Leave')}
      </button>
    </div>
  );
}
