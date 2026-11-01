import { useEffect } from 'react';
import { NIL_CALLS } from './lib/scoring.js';

/** − number + with big solid buttons. Tap the number to pick a value directly. */
export function NumberControl({ label, value, onChange, min = 0, max = 13 }) {
  const options = [];
  for (let n = min; n <= max; n++) options.push(n);
  return (
    <div className="number-control">
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

export function Segmented({ options, value, onChange, label }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id}
          className={value === o.id ? 'on' : ''} onClick={() => onChange(o.id)}>{o.label}</button>
      ))}
    </div>
  );
}

export const NilPicker = ({ value, onChange, label }) => (
  <Segmented options={NIL_CALLS} value={value} onChange={onChange} label={label} />
);

/** Full-screen sheet that slides up, with Cancel / action buttons on top. */
export function Sheet({ title, onClose, action, children }) {
  useEffect(() => {
    document.body.classList.add('sheet-open');
    return () => document.body.classList.remove('sheet-open');
  }, []);
  return (
    <div className="sheet-backdrop">
      <div className="sheet" role="dialog" aria-label={title}>
        <header className="sheet-bar">
          <button type="button" className="link" onClick={onClose}>Cancel</button>
          <h2>{title}</h2>
          {action ? <button type="button" className="link bold" onClick={action.onClick}>{action.label}</button> : <span />}
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
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
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
