import { useState } from 'react';
import { STANDARD_RULES } from './lib/scoring.js';
import { RulesFields, Segmented, Sheet, Icon } from './components.jsx';

const PRESETS = [250, 300, 500];

export default function NewGame({ lastSetup, onStart, onCancel, asSheet, onJoin }) {
  const [teams, setTeams] = useState(lastSetup?.teams ?? [
    { name: 'Team 1', players: ['', ''] },
    { name: 'Team 2', players: ['', ''] },
  ]);
  const [target, setTarget] = useState(lastSetup?.target ?? 500);
  const [rules, setRules] = useState({ ...STANDARD_RULES, ...lastSetup?.rules });

  const setTeam = (t, change) => setTeams((all) => all.map((team, i) => (i === t ? change(team) : team)));

  function start() {
    const cleaned = teams.map((team, t) => ({
      name: team.name.trim() || `Team ${t + 1}`,
      players: team.players.map((p, i) => p.trim() || `Player ${t * 2 + i + 1}`),
    }));
    onStart({ id: crypto.randomUUID(), teams: cleaned, target: Math.max(1, target), rules, hands: [], remote: null, startedAt: Date.now() });
  }

  const form = (
    <>
      {[0, 1].map((t) => (
        <div key={t}>
          <div className="section-title">Team {t + 1}</div>
          <div className="card group">
            <input className="text bold" placeholder="Team name" value={teams[t].name}
              onChange={(e) => setTeam(t, (x) => ({ ...x, name: e.target.value }))} />
            {[0, 1].map((p) => (
              <input key={p} className="text" placeholder={`Player ${p + 1}`} value={teams[t].players[p]}
                onChange={(e) => setTeam(t, (x) => ({ ...x, players: x.players.map((n, i) => (i === p ? e.target.value : n)) }))} />
            ))}
          </div>
        </div>
      ))}

      <div className="section-title">Final score</div>
      <div className="card group">
        <label className="field">
          <span>Play to</span>
          <input type="number" inputMode="numeric" className="bold" style={{ width: 100 }} value={target || ''}
            onChange={(e) => setTarget(Math.trunc(Number(e.target.value)) || 0)} />
        </label>
        <Segmented label="Quick pick" value={target}
          options={PRESETS.map((n) => ({ id: n, label: String(n) }))} onChange={setTarget} />
      </div>

      <RulesFields rules={rules} onChange={setRules} />
    </>
  );

  if (asSheet) {
    return <Sheet title="New Game" onClose={onCancel} action={{ label: 'Start', onClick: start }}>{form}</Sheet>;
  }
  return (
    <div className="app">
      <header className="hero">
        <div className="wrap hero-row"><div className="brand"><span className="brand-mark">♠</span><h1>New Game</h1></div></div>
      </header>
      <main className="wrap">
        {onJoin && <JoinCard onJoin={onJoin} />}
        {form}
      </main>
      <div className="bottom-bar">
        <button type="button" className="primary big" disabled={target <= 0} onClick={start}>Start Game</button>
      </div>
    </div>
  );
}

/** For the remote player: type the code the table sent you. */
function JoinCard({ onJoin }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const clean = code.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
  if (!open) {
    return (
      <button type="button" className="card join-card" onClick={() => setOpen(true)}>
        <Icon name="phone" />
        <span><b>Playing from somewhere else?</b><br /><span className="muted small">Join a game with a code</span></span>
      </button>
    );
  }
  return (
    <form className="card join-card open" onSubmit={(e) => { e.preventDefault(); if (clean.length === 4) onJoin(clean); }}>
      <label className="eyebrow" htmlFor="join-code">Code from the table</label>
      <input id="join-code" className="code-input" value={clean} onChange={(e) => setCode(e.target.value)}
        autoCapitalize="characters" autoComplete="off" placeholder="ABCD" autoFocus inputMode="text" />
      <button type="submit" className="primary big" disabled={clean.length !== 4}>Join game</button>
    </form>
  );
}
