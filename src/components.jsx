import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NIL_CALLS } from './lib/scoring.js';
import { parseCard, cardName } from './lib/cards.js';
import { cardAt } from './lib/hand.js';

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

const COURT = { J: 'J', Q: 'Q', K: 'K' };

/** A playing card face. Pass onClick to make it tappable; `style` positions it (e.g. in a fan). */
export function PlayingCard({ code, size = 'md', selected, onClick, disabled, className = '', style }) {
  const { rank, suit } = parseCard(code);
  const classes = `pcard ${size}${suit.red ? ' red' : ''}${selected ? ' sel' : ''}${COURT[rank] ? ' court' : ''} ${className}`;
  const face = (
    <>
      <span className="pc-corner"><b>{rank}</b><i>{suit.sym}</i></span>
      {COURT[rank]
        ? <span className="pc-court"><b>{rank}</b><i>{suit.sym}</i></span>
        : <span className="pc-pip">{suit.sym}</span>}
      <span className="pc-corner flip"><b>{rank}</b><i>{suit.sym}</i></span>
    </>
  );
  if (!onClick) return <div className={classes} style={style} role="img" aria-label={cardName(code)} data-code={code}>{face}</div>;
  return (
    <button type="button" className={classes} style={style} onClick={onClick} disabled={disabled} data-code={code}
      aria-label={cardName(code)} aria-pressed={selected}>{face}</button>
  );
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
  const cardW = Math.round(Math.min(88, Math.max(62, width / 4.8)));
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
    return cardAt(e.clientX - r.left, lefts, cardW);
  };
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
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
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
    const dy = e.clientY - g.y;
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
