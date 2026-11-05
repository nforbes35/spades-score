import { useState } from 'react';
import { STANDARD_RULES } from './lib/scoring.js';
import { tr } from './lib/i18n.js';
import { RulesFields, Segmented, Sheet } from './components.jsx';

const PRESETS = [250, 300, 500];

export default function NewGame({ lastSetup, onStart, onCancel, asSheet, onBack }) {
  const [teams, setTeams] = useState(lastSetup?.teams ?? [
    { name: tr('Team {n}', { n: 1 }), players: ['', ''] },
    { name: tr('Team {n}', { n: 2 }), players: ['', ''] },
  ]);
  const [target, setTarget] = useState(lastSetup?.target ?? 500);
  const [rules, setRules] = useState({ ...STANDARD_RULES, ...lastSetup?.rules });

  const setTeam = (t, change) => setTeams((all) => all.map((team, i) => (i === t ? change(team) : team)));

  function start() {
    const cleaned = teams.map((team, t) => ({
      name: team.name.trim() || tr('Team {n}', { n: t + 1 }),
      players: team.players.map((p, i) => p.trim() || tr('Player {n}', { n: t * 2 + i + 1 })),
    }));
    onStart({ id: crypto.randomUUID(), teams: cleaned, target: Math.max(1, target), rules, hands: [], remote: null, startedAt: Date.now() });
  }

  const form = (
    <>
      {[0, 1].map((t) => (
        <div key={t}>
          <div className="section-title">{tr('Team {n}', { n: t + 1 })}</div>
          <div className="card group">
            <input className="text bold" placeholder={tr('Team name')} value={teams[t].name}
              onChange={(e) => setTeam(t, (x) => ({ ...x, name: e.target.value }))} />
            {[0, 1].map((p) => (
              <input key={p} className="text" placeholder={tr('Player {n}', { n: p + 1 })} value={teams[t].players[p]}
                onChange={(e) => setTeam(t, (x) => ({ ...x, players: x.players.map((n, i) => (i === p ? e.target.value : n)) }))} />
            ))}
          </div>
        </div>
      ))}

      <div className="section-title">{tr('Final score')}</div>
      <div className="card group">
        <label className="field">
          <span>{tr('Play to')}</span>
          <input type="number" inputMode="numeric" className="bold" style={{ width: 100 }} value={target || ''}
            onChange={(e) => setTarget(Math.trunc(Number(e.target.value)) || 0)} />
        </label>
        <Segmented label={tr('Quick pick')} value={target}
          options={PRESETS.map((n) => ({ id: n, label: String(n) }))} onChange={setTarget} />
      </div>

      <RulesFields rules={rules} onChange={setRules} />
    </>
  );

  if (asSheet) {
    return <Sheet title={tr('New Game')} onClose={onCancel} action={{ label: tr('Start'), onClick: start }}>{form}</Sheet>;
  }
  return (
    <div className="app">
      <header className="hero">
        <div className="wrap hero-row">
          <div className="brand"><span className="brand-mark">♠</span><h1>{tr('At the table')}</h1></div>
          {onBack && <button type="button" className="icon-btn" onClick={onBack}>{tr('Back')}</button>}
        </div>
        <div className="wrap"><p className="target">{tr('Who’s playing tonight?')}</p></div>
      </header>
      <main className="wrap">{form}</main>
      <div className="bottom-bar">
        <button type="button" className="primary big" disabled={target <= 0} onClick={start}>{tr('Start Game')}</button>
      </div>
    </div>
  );
}
