import { useCallback, useEffect, useRef, useState } from 'react';
import { NIL_CALLS } from './lib/scoring.js';
import { parseCard, cardName } from './lib/cards.js';

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
export function Sheet({ title, onClose, action, children, closeLabel = 'Cancel' }) {
  useEffect(() => {
    document.body.classList.add('sheet-open');
    return () => document.body.classList.remove('sheet-open');
  }, []);
  return (
    <div className="sheet-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet" role="dialog" aria-label={title}>
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
};

export function Icon({ name, size = 22 }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[name]}</svg>
  );
}

/** A playing card face. Pass onClick to make it tappable. */
export function PlayingCard({ code, size = 'md', selected, onClick, disabled, className = '' }) {
  const { rank, suit } = parseCard(code);
  const classes = `pcard ${size}${suit.red ? ' red' : ''}${selected ? ' sel' : ''} ${className}`;
  const face = (
    <>
      <span className="pc-corner"><b>{rank}</b><i>{suit.sym}</i></span>
      <span className="pc-pip">{suit.sym}</span>
    </>
  );
  if (!onClick) return <div className={classes} role="img" aria-label={cardName(code)}>{face}</div>;
  return (
    <button type="button" className={classes} onClick={onClick} disabled={disabled}
      aria-label={cardName(code)} aria-pressed={selected}>{face}</button>
  );
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

export function StatusDot({ on, label }) {
  return <span className={`status-dot${on ? ' on' : ''}`}><i />{label}</span>;
}
