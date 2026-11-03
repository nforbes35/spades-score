import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { NIL_CALLS } from './lib/scoring.js';
import { parseCard, cardName } from './lib/cards.js';
import { cardAt } from './lib/hand.js';
import { useDeck } from './lib/decks.js';

/** − number + with big solid buttons. Tap the number to pick a value directly. */
export function NumberControl({ label, value, onChange, min = 0, max = 13, compact }) {
  const options = [];
  for (let n = min; n <= max; n++) options.push(n);
  return (
    <div className={`number-control${compact ? ' compact' : ''}`}>
      <button type="button" className="step minus" aria-label={`${label} minus`}
        disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>−</button>
      <select className="number" aria-label={label} value={value}
        onChange={(e) => onChange(Number(e.target.value))}>
        {options.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
      <button type="button" className="step plus" aria-label={`${label} plus`}
        disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>+</button>
    </div>
  );
}

export function Segmented({ options, value, onChange, label, small }) {
  return (
    <div className={`segmented${small ? ' small' : ''}`} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id}
          className={value === o.id ? 'on' : ''} onClick={() => onChange(o.id)}>{o.label}</button>
      ))}
    </div>
  );
}

export const NilPicker = ({ value, onChange, label, small }) => (
  <Segmented options={NIL_CALLS} value={value} onChange={onChange} label={label} small={small} />
);

/** Full-screen sheet that slides up, with Cancel / action buttons on top. */
export function Sheet({ title, onClose, action, children, closeLabel = 'Cancel', short = false }) {
  useEffect(() => {
    document.body.classList.add('sheet-open');
    return () => document.body.classList.remove('sheet-open');
  }, []);
  return (
    <div className="sheet-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`sheet${short ? ' short' : ''}`} role="dialog" aria-label={title}>
        <header className="sheet-bar">
          <button type="button" className="link" onClick={onClose}>{closeLabel}</button>
          <h2>{title}</h2>
          {action
            ? <button type="button" className="link bold" disabled={action.disabled} onClick={action.onClick}>{action.label}</button>
            : <span />}
        </header>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

export function Toggle({ label, checked, onChange }) {
  return (
    <label className="field toggle">
      <span>{label}</span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export function NumberField({ label, value, onChange, width = 90 }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="number" inputMode="numeric" style={{ width }} value={Number.isFinite(value) ? value : ''}
        onChange={(e) => onChange(e.target.value === '' ? 0 : Math.trunc(Number(e.target.value)))} />
    </label>
  );
}

/** Editable scoring rules, shared by new-game setup and the mid-game rules screen. */
export function RulesFields({ rules, onChange }) {
  const set = (key) => (v) => onChange({ ...rules, [key]: v });
  return (
    <>
      <div className="section-title">Scoring</div>
      <div className="card group">
        <NumberField label="Nil worth" value={rules.nilValue} onChange={set('nilValue')} />
        <NumberField label="Blind nil worth" value={rules.blindNilValue} onChange={set('blindNilValue')} />
        <NumberField label="Big bid bonus" value={rules.bigBidBonus} onChange={set('bigBidBonus')} />
        <NumberField label="Big bid is this many books or more" value={rules.bigBidThreshold} onChange={set('bigBidThreshold')} width={70} />
        <Toggle label="Nil player's books help partner's bid" checked={rules.nilBooksCountTowardBid} onChange={set('nilBooksCountTowardBid')} />
      </div>
      <p className="footnote">Missing a nil or blind nil costs the same amount. A made bid is 10 per book bid plus 1 per extra book.</p>

      <div className="section-title">Bags (extra books)</div>
      <div className="card group">
        <Toggle label="Bag penalty" checked={rules.bagsEnabled} onChange={set('bagsEnabled')} />
        {rules.bagsEnabled && (
          <>
            <NumberField label="Every this many bags" value={rules.bagsLimit} onChange={set('bagsLimit')} width={70} />
            <NumberField label="Penalty" value={rules.bagsPenalty} onChange={set('bagsPenalty')} />
          </>
        )}
      </div>
    </>
  );
}

const ICONS = {
  undo: <><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></>,
  more: <><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></>,
  mic: <><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><path d="M12 19v3" /></>,
  micOff: <><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><path d="M12 19v3" /><path d="M3 3l18 18" /></>,
  video: <><path d="m22 8-6 4 6 4V8Z" /><rect x="2" y="6" width="14" height="12" rx="2" /></>,
  videoOff: <><path d="m22 8-6 4 6 4V8Z" /><rect x="2" y="6" width="14" height="12" rx="2" /><path d="M2 2l20 20" /></>,
  flip: <><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" /></>,
  close: <path d="M18 6 6 18M6 6l12 12" />,
  camera: <><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z" /><circle cx="12" cy="13" r="3" /></>,
  bell: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>,
  phone: <><rect x="5" y="2" width="14" height="20" rx="2" /><path d="M12 18h.01" /></>,
  share: <><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><path d="m16 6-4-4-4 4" /><path d="M12 2v13" /></>,
  shrink: <><path d="M4 14h6v6" /><path d="M20 10h-6V4" /><path d="m14 10 7-7" /><path d="m3 21 7-7" /></>,
  grow: <><path d="M15 3h6v6" /><path d="M9 21H3v-6" /><path d="m21 3-7 7" /><path d="m3 21 7-7" /></>,
  edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></>,
  trophy: <><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z" /><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" /></>,
  chevron: <path d="m9 18 6-6-6-6" />,
  cards: <><rect x="3" y="5" width="11" height="16" rx="2" transform="rotate(-10 8.5 13)" /><rect x="9" y="3" width="11" height="16" rx="2" /></>,
  speaker: <><path d="M11 5 6 9H2v6h4l5 4V5Z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M19 5a10 10 0 0 1 0 14" /></>,
  speakerOff: <><path d="M11 5 6 9H2v6h4l5 4V5Z" /><path d="m22 9-6 6" /><path d="m16 9 6 6" /></>,
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20h5v-6h4v6h5V9.5" /></>,
  tv: <><rect x="2" y="7" width="20" height="13" rx="2" /><path d="m17 2-5 5-5-5" /></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
  expand: <><path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M21 8V5a2 2 0 0 0-2-2h-3" /><path d="M3 16v3a2 2 0 0 0 2 2h3" /><path d="M16 21h3a2 2 0 0 0 2-2v-3" /></>,
};

export function Icon({ name, size = 22 }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[name]}</svg>
  );
}

// Suit shapes drawn as paths (in a 100 × 100 box), so they look the same on every phone and never
// turn into emoji.
const SUIT_PATHS = {
  S: 'M50 4C41 22 8 38 8 61c0 14 11 24 23 24 8 0 14-4 17-9-1 9-5 15-12 20h28c-7-5-11-11-12-20 3 5 9 9 17 9 12 0 23-10 23-24C92 38 59 22 50 4Z',
  H: 'M50 92C22 70 5 53 5 32 5 17 16 7 29 7c9 0 16 5 21 13 5-8 12-13 21-13 13 0 24 10 24 25 0 21-17 38-45 60Z',
  D: 'M50 3c10 17 23 33 38 47-15 14-28 30-38 47C40 80 27 64 12 50 27 36 40 20 50 3Z',
  C: 'M50 6a20 20 0 0 0-17 30 20 20 0 1 0 13 30c-1 11-5 19-12 26h32c-7-7-11-15-12-26a20 20 0 1 0 13-30A20 20 0 0 0 50 6Z',
};

/** A suit symbol. Takes the card's colour (currentColor). */
export function SuitShape({ suit, className = '', style }) {
  return (
    <svg className={`suit-shape ${className}`} style={style} viewBox="0 0 100 100" aria-hidden="true">
      <path d={SUIT_PATHS[suit]} fill="currentColor" />
    </svg>
  );
}

// Court cards: a character portrait in the suit's colours. Kings have a crown and beard, queens a
// tiara and long hair, jacks a feathered cap.
const COURT_HAIR = { K: '#7a4a24', Q: '#e0a03a', J: '#3b2416' };

function CourtPanel({ rank, suit }) {
  const hair = COURT_HAIR[rank];
  return (
    <svg className="pc-court" viewBox="0 0 100 130" aria-hidden="true">
      <defs>
        <linearGradient id={`court-${suit}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="court-top" /><stop offset="1" className="court-bottom" />
        </linearGradient>
        <clipPath id="court-clip"><rect x="0" y="0" width="100" height="130" rx="12" /></clipPath>
      </defs>
      <g clipPath="url(#court-clip)">
        <rect width="100" height="130" fill={`url(#court-${suit})`} />
        <circle cx="50" cy="58" r="40" className="court-glow" />
        {rank === 'Q' && <path d="M27 58c-4 22 0 42 6 52h34c6-10 10-30 6-52-4-18-42-18-46 0Z" fill={hair} />}
        {/* robe and gold collar */}
        <path d="M6 132c2-26 20-40 44-40s42 14 44 40Z" className="court-robe" />
        <path d="M30 96 50 118 70 96" className="court-trim" />
        <g transform="translate(43 106) scale(0.14)"><path d={SUIT_PATHS[suit]} fill="#f5c542" /></g>
        <rect x="44" y="76" width="12" height="18" rx="4" className="court-skin" />
        <ellipse cx="50" cy="62" rx="17" ry="19" className="court-skin" />
        {rank === 'K' && <path d="M33 62c0 20 8 30 17 30s17-10 17-30c-4 9-10 12-17 12s-13-3-17-12Z" fill={hair} />}
        {rank === 'K' && <path d="M42 72q8-5 16 0q-8 3-16 0Z" fill={hair} />}
        {rank === 'J' && <path d="M33 58c0-12 8-18 17-18s17 6 17 18c-4-6-10-8-17-8s-13 2-17 8Z" fill={hair} />}
        {rank === 'Q' && <path d="M33 60c1-14 9-20 17-20s16 6 17 20c-6-8-11-11-17-11s-11 3-17 11Z" fill={hair} />}
        <circle cx="43.5" cy="61" r="2.2" fill="#2a1a12" /><circle cx="56.5" cy="61" r="2.2" fill="#2a1a12" />
        <circle cx="40" cy="68" r="3" fill="#f39a8f" opacity="0.6" /><circle cx="60" cy="68" r="3" fill="#f39a8f" opacity="0.6" />
        {rank !== 'K' && <path d="M45 70q5 4 10 0" stroke="#a5452f" strokeWidth="1.8" fill="none" strokeLinecap="round" />}
        {rank === 'K' && <g className="court-gold"><path d="M31 44 28 22l11 10 11-15 11 15 11-10-3 22Z" /><circle cx="28" cy="21" r="2.5" /><circle cx="50" cy="16" r="2.8" /><circle cx="72" cy="21" r="2.5" /></g>}
        {rank === 'Q' && <g className="court-gold"><path d="M35 45 37 34l6 5 7-10 7 10 6-5 2 11c-5-2-10-3-15-3s-10 1-15 3Z" /><circle cx="50" cy="28" r="2.6" fill="#e3202f" /></g>}
        {rank === 'J' && <g><path d="M27 48c2-14 12-20 24-20 12 0 21 6 23 18-14-6-32-6-47 2Z" className="court-robe" /><path d="M60 32c8-14 20-18 30-14-8 2-16 8-22 18Z" className="court-gold" /></g>}
      </g>
      <rect x="1.5" y="1.5" width="97" height="127" rx="11" className="court-edge" />
    </svg>
  );
}

/** A playing card face. Pass onClick to make it tappable; `style` positions it (e.g. in a fan). */
export function PlayingCard({ code, size = 'md', selected, onClick, disabled, className = '', style, faces }) {
  const { rank, suit } = parseCard(code);
  const court = ['J', 'Q', 'K'].includes(rank);
  const deck = useDeck();
  const look = faces ?? deck.faces;
  const classes = `pcard ${size}${suit.red ? ' red' : ''}${selected ? ' sel' : ''}${court ? ' court' : ''}${rank === 'A' ? ' ace' : ''}${rank === '10' ? ' ten' : ''} ${className}`;
  const face = (
    <>
      <span className="pc-corner"><b>{rank}</b><SuitShape suit={suit.id} /></span>
      {court && look === 'classic' && <img className="pc-court pc-portrait" src={`/faces/${rank}${suit.id}.webp`} alt="" draggable="false" />}
      {court && look !== 'classic' && <CourtPanel rank={rank} suit={suit.id} />}
      {court ? null : <span className="pc-big"><SuitShape suit={suit.id} /></span>}
    </>
  );
  if (!onClick) return <div className={classes} style={style} role="img" aria-label={cardName(code)} data-code={code}>{face}</div>;
  return (
    <button type="button" className={classes} style={style} onClick={onClick} disabled={disabled} data-code={code}
      aria-label={cardName(code)} aria-pressed={selected}>{face}</button>
  );
}

/** The back of a card. */
export function CardBack({ size = 'md', className = '', style }) { // style can set the back's background (deck previews)
  return <div className={`pcard back ${size} ${className}`} style={style} aria-hidden="true"><span className="back-mark"><SuitShape suit="S" /></span></div>;
}

const FAN_SPREAD_DEG = 12;
const FAN_DROP = 9;
const SUIT_GAP = 5;
// Swipe a card this far up (in card heights) to play it; less and it drops back into the hand.
const PLAY_LINE = 0.75;
// How far a finger must move up before a slide along the hand becomes a swipe.
const SWIPE_START = 18;
const STICKY_PX = 5;

/**
 * A hand held in a fan: cards overlap so each corner shows, curve gently, and a small gap separates
 * suits. With `onPlay`, slide a finger along the hand to pick a card (it rises), swipe it up past the
 * line to play it, or tap it to select it. Cards not in `playable` shake and drop back.
 */
export function FannedHand({ cards, selected, onSelect, disabled, dim = [], dealKey, onPlay, playable, onRefuse }) {
  const box = useRef(null);
  const [width, setWidth] = useState(340);
  const short = useShortScreen();
  const [touch, setTouch] = useState(null); // { card, dx, dy, swiping }
  const [refused, setRefused] = useState(null);
  const [flying, setFlying] = useState(null);
  const gesture = useRef(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [dealKey]);

  const n = cards.length;
  // A phone on its side has little height: smaller cards, so the table still fits above them.
  const cardW = short ? 58 : Math.round(Math.min(88, Math.max(62, width / 4.8)));
  const cardH = Math.round(cardW * 1.4);
  const suitOf = (c) => c.slice(-1);
  const gapsBefore = cards.map((c, i) => cards.slice(0, i + 1).filter((x, j) => j > 0 && suitOf(x) !== suitOf(cards[j - 1])).length);
  const gaps = gapsBefore[n - 1] ?? 0;
  const step = n > 1 ? Math.min(cardW * 0.6, (width - cardW - gaps * SUIT_GAP - 8) / (n - 1)) : 0;
  const total = cardW + step * Math.max(0, n - 1) + gaps * SUIT_GAP;
  const left0 = (width - total) / 2;
  const mid = (n - 1) / 2;
  const lefts = cards.map((_, i) => left0 + i * step + gapsBefore[i] * SUIT_GAP);
  const swipeable = Boolean(onPlay) && !disabled;
  const canPlay = (c) => !playable || playable.includes(c);

  // The card drawn under the finger, exactly as it looks (tilted cards included); if the finger is just
  // off the cards, the card whose strip it's beside.
  const pointAt = (e) => {
    const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.pcard[data-code]');
    if (hit && box.current.contains(hit)) {
      const i = cards.indexOf(hit.dataset.code);
      if (i >= 0) return i;
    }
    const r = box.current.getBoundingClientRect();
    return cardAt((e.clientX - r.left) / zoomOf(), lefts, cardW);
  };
  // On a big screen the table is drawn zoomed (useTableFit): finger movements are in screen pixels, the
  // hand's own sizes aren't.
  const zoomOf = () => (box.current ? box.current.getBoundingClientRect().width / box.current.offsetWidth || 1 : 1);
  const buzzOnce = (ms) => { try { navigator.vibrate?.(ms); } catch { /* not supported */ } };

  const down = (e) => {
    if (!swipeable || e.button > 0) return;
    const i = pointAt(e);
    if (i < 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current = { x: e.clientX, y: e.clientY, card: cards[i], swiping: false };
    setTouch({ card: cards[i], dx: 0, dy: 0, swiping: false });
  };
  const move = (e) => {
    const g = gesture.current;
    if (!g) return;
    const z = zoomOf();
    const dx = (e.clientX - g.x) / z;
    const dy = (e.clientY - g.y) / z;
    if (!g.swiping && -dy > SWIPE_START && Math.abs(dy) > Math.abs(dx) * 0.8) g.swiping = true;
    if (g.swiping) {
      setTouch({ card: g.card, dx, dy: Math.min(dy, 0), swiping: true });
    } else {
      // Sliding along the hand: the card under the finger rises, a small tick when it changes. It only
      // changes once the finger has moved a few pixels, so resting on a border doesn't flicker.
      const c = cards[pointAt(e)];
      if (c && c !== g.card && Math.abs(e.clientX - (g.switchX ?? g.x)) >= STICKY_PX) {
        g.card = c;
        g.switchX = e.clientX;
        buzzOnce(8);
      }
      setTouch({ card: g.card, dx: 0, dy: 0, swiping: false });
    }
  };
  const up = (e) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    const dy = (e.clientY - g.y) / zoomOf();
    setTouch(null);
    if (g.swiping && -dy > cardH * PLAY_LINE) {
      if (canPlay(g.card)) {
        setFlying(g.card);
        buzzOnce(25);
        setTimeout(() => setFlying(null), 400);
        onPlay(g.card);
      } else {
        setRefused(g.card);
        buzzOnce([40, 40, 40]);
        setTimeout(() => setRefused(null), 450);
        onRefuse?.(g.card);
      }
    } else if (!g.swiping) {
      onSelect?.(selected === g.card ? null : g.card);
    }
  };
  const cancel = () => { gesture.current = null; setTouch(null); };

  const pastLine = touch?.swiping && -touch.dy > cardH * PLAY_LINE;
  return (
    <div ref={box} key={dealKey} className={`fan${dealKey != null ? ' dealing' : ''}${swipeable ? ' swipeable' : ''}`}
      style={{ height: cardH + FAN_DROP + 26 }}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel}>
      {swipeable && touch?.swiping && (
        <div className={`play-line${pastLine ? ' ready' : ''}`} style={{ top: 18 - cardH * PLAY_LINE + cardH * 0.25 }}>
          {pastLine ? (canPlay(touch.card) ? 'Let go to play' : 'Can’t play that card') : 'Swipe up to play'}
        </div>
      )}
      {cards.map((c, i) => {
        const off = n > 1 ? (i - mid) / mid || 0 : 0;
        const held = touch?.card === c;
        const lift = selected === c || (held && !touch.swiping) ? -22 : 0;
        const drag = held && touch.swiping;
        const rot = off * (FAN_SPREAD_DEG / 2);
        return (
          <PlayingCard key={c} code={c} size="held" selected={selected === c || held} disabled={disabled}
            className={`${dim.includes(c) ? 'dim' : ''}${drag ? ' dragging' : ''}${refused === c ? ' refused' : ''}${flying === c ? ' flying' : ''}`}
            // With swiping on, the hand handles touches; clicks only come from the keyboard.
            onClick={onSelect ? (e) => { if (!swipeable || e.detail === 0) onSelect(selected === c ? null : c); } : undefined}
            style={{
              '--w': `${cardW}px`,
              '--k': i,
              left: lefts[i],
              top: 18 + off * off * FAN_DROP + lift,
              transform: drag
                ? `translate(${touch.dx}px, ${touch.dy}px) rotate(${rot * 0.3}deg) scale(1.08)`
                : `rotate(${rot}deg)`,
              zIndex: drag ? 100 : i + 1,
            }} />
        );
      })}
    </div>
  );
}

/** A number that rolls to its new value instead of jumping (scores). */
export function useCountUp(value, ms = 700) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    if (a === value) return undefined;
    let frame;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / ms);
      const eased = 1 - (1 - t) ** 3;
      setShown(Math.round(a + (value - a) * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
      else from.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); from.current = value; };
  }, [value, ms]);
  return shown;
}

/** One message at a time at the bottom of the screen, optionally with an Undo button. */
export function useToast() {
  const [toast, setToast] = useState(null);
  const timer = useRef();
  const show = useCallback((text, opts = {}) => {
    clearTimeout(timer.current);
    setToast({ text, ...opts, key: Date.now() });
    timer.current = setTimeout(() => setToast(null), opts.ms ?? 3500);
  }, []);
  const node = toast && (
    <div className="toast" key={toast.key} role="status">
      <span>{toast.text}</span>
      {toast.onUndo && (
        <button type="button" onClick={() => { toast.onUndo(); setToast(null); }}>
          <Icon name="undo" size={18} /> Undo
        </button>
      )}
    </div>
  );
  return { show, node };
}

/** Falling confetti, shown once when a game is won. */
export function Confetti() {
  const colors = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#a855f7', '#ffffff'];
  const bits = Array.from({ length: 70 }, (_, i) => ({
    left: Math.random() * 100,
    delay: Math.random() * 0.8,
    dur: 2.2 + Math.random() * 1.6,
    color: colors[i % colors.length],
    rot: Math.random() * 360,
  }));
  return (
    <div className="confetti" aria-hidden="true">
      {bits.map((b, i) => (
        <span key={i} style={{ left: `${b.left}%`, background: b.color, animationDelay: `${b.delay}s`, animationDuration: `${b.dur}s`, transform: `rotate(${b.rot}deg)` }} />
      ))}
    </div>
  );
}

/** A card written inline in a sentence or button, as a little white chip in the card's color. */
export function CardText({ code }) {
  const { rank, suit } = parseCard(code);
  return <span className={`card-chip${suit.red ? ' red' : ''}`}>{rank}{suit.sym}</span>;
}

export function StatusDot({ on, label }) {
  return <span className={`status-dot${on ? ' on' : ''}`}><i />{label}</span>;
}

/**
 * The online table's layout for this screen, kept on <html data-layout> for the CSS:
 *  'wide': a phone turned sideways, or a laptop / desktop / tablet held sideways. The table goes across the
 *  screen with your hand in a strip along the bottom; on a big screen it's all drawn bigger (`zoom`).
 *  'tall': a phone or tablet held upright (a tablet's drawn like a big phone, zoomed).
 */
function measureLayout() {
  if (typeof window === 'undefined') return { layout: 'tall', zoom: 1 };
  const w = window.innerWidth, h = window.innerHeight;
  const phoneSideways = w > h && h <= 520;
  const bigSideways = w >= 900 && h > 520 && w > h * 1.15;
  const bigUpright = !phoneSideways && !bigSideways && w >= 600;
  // Big screens: lay out as on a phone (sideways ~900 wide, upright ~430 wide), then scale up to fill the window.
  const zoom = bigSideways ? Math.max(1, Math.min(h / 440, w / 900))
    : bigUpright ? Math.max(1, Math.min(w / 430, h / 932)) : 1;
  return { layout: phoneSideways || bigSideways ? 'wide' : 'tall', zoom };
}
let current = measureLayout();
const layoutListeners = new Set();
if (typeof window !== 'undefined') {
  document.documentElement.dataset.layout = current.layout;
  addEventListener('resize', () => {
    const next = measureLayout();
    if (next.layout === current.layout && next.zoom === current.zoom) return;
    current = next;
    document.documentElement.dataset.layout = next.layout;
    layoutListeners.forEach((fn) => fn());
  });
}
export function useTableLayout() {
  return useSyncExternalStore((fn) => { layoutListeners.add(fn); return () => layoutListeners.delete(fn); }, () => current);
}

/** True when the hand should use small cards (the wide layout). */
export function useShortScreen() {
  return useTableLayout().layout === 'wide';
}
