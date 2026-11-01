import { useState } from 'react';
import { useGame } from './lib/store.js';
import { history, standings, winner, newHand, signed, tableBid, contractBid, totalBooks, isNil, nilLabel, STANDARD_RULES } from './lib/scoring.js';
import { Sheet, RulesFields, NumberField } from './components.jsx';
import NewGame from './NewGame.jsx';
import HandSheet from './HandSheet.jsx';

export default function App() {
  const store = useGame();
  const [newGameOpen, setNewGameOpen] = useState(false);

  if (!store.game) return <NewGame lastSetup={store.lastSetup} onStart={store.start} />;
  return (
    <>
      <GameScreen store={store} onNewGame={() => setNewGameOpen(true)} />
      {newGameOpen && (
        <NewGame asSheet lastSetup={store.lastSetup}
          onStart={(g) => { store.start(g); setNewGameOpen(false); }}
          onCancel={() => setNewGameOpen(false)} />
      )}
    </>
  );
}

function GameScreen({ store, onNewGame }) {
  const { game } = store;
  const [editing, setEditing] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);

  const hist = history(game);
  const stand = standings(game);
  const win = winner(game);
  const inPlay = game.hands.find((h) => h.inPlay);
  const numbered = game.hands.map((h, i) => ({ hand: h, number: i + 1, standing: hist[i] })).reverse();

  return (
    <div className="app">
      <header className="hero">
        <div className="wrap row between">
          <h1>♠︎ Spades</h1>
          <div className="menu-wrap">
            <button type="button" className="icon-btn" aria-label="Menu" onClick={() => setMenuOpen((o) => !o)}>•••</button>
            {menuOpen && (
              <div className="menu" onClick={() => setMenuOpen(false)}>
                <button type="button" onClick={() => {
                  if (confirm('Start a new game? This one will be cleared.')) onNewGame();
                }}>New Game</button>
                <button type="button" onClick={() => setRulesOpen(true)}>Scoring Rules</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="wrap">
        <div className="scores">
          {[0, 1].map((t) => (
            <ScoreCard key={t} team={game.teams[t]} standing={stand[t]} target={game.target}
              showBags={game.rules.bagsEnabled} isWinner={win === t} />
          ))}
        </div>
        {win != null && <div className="winner">🏆 {game.teams[win].name} wins!</div>}
        <p className="footnote center">Playing to {game.target}</p>

        <div className="section-title">{game.hands.length ? 'Hands' : 'No hands yet'}</div>
        <div className="stack">
          {numbered.map(({ hand, number, standing }) => (
            <HandRow key={hand.id} hand={hand} number={number} standing={standing} game={game}
              onOpen={() => setEditing(hand)} />
          ))}
        </div>
      </main>

      <div className="bottom-bar">
        <button type="button" className="primary big" onClick={() => setEditing(inPlay ?? newHand())}>
          {inPlay ? '✓ Enter Books' : '+ New Hand'}
        </button>
      </div>

      {editing && (
        <HandSheet game={game} hand={editing}
          onSave={(h) => { store.saveHand(h); setEditing(null); }}
          onDelete={game.hands.some((h) => h.id === editing.id)
            ? () => { store.deleteHand(editing.id); setEditing(null); } : null}
          onClose={() => setEditing(null)} />
      )}
      {rulesOpen && <RulesSheet game={game} onSave={(r, t) => { store.updateSettings(r, t); setRulesOpen(false); }} onClose={() => setRulesOpen(false)} />}
    </div>
  );
}

function ScoreCard({ team, standing, target, showBags, isWinner }) {
  const pct = Math.min(Math.max(standing.score, 0), target) / Math.max(target, 1);
  return (
    <div className={`card score-card${isWinner ? ' won' : ''}`}>
      <div className="team-name">{team.name}</div>
      <div className="players">{team.players.join(' & ')}</div>
      <div className={`score${standing.score < 0 ? ' neg' : ''}`}>{standing.score}</div>
      <div className="progress"><div style={{ width: `${pct * 100}%` }} /></div>
      {showBags && <div className="bags">Bags: {standing.bags}</div>}
    </div>
  );
}

function handSummary(tr, team, showBooks) {
  const parts = [showBooks ? `Bid ${contractBid(tr)}, took ${totalBooks(tr)}` : `${team.name} bid ${contractBid(tr)}`];
  tr.players.forEach((p, i) => { if (isNil(p.call)) parts.push(`${team.players[i]}: ${nilLabel(p.call)}`); });
  return parts.join(' · ');
}

function HandRow({ hand, number, standing, game, onOpen }) {
  return (
    <button type="button" className="card hand-row" onClick={onOpen}>
      <div className="row between">
        <span className="hand-num">Hand {number}</span>
        {hand.inPlay && <span className="badge">IN PLAY</span>}
      </div>
      <div className="hand-cols">
        {[0, 1].map((t) => (
          <div key={t}>
            <div className="small muted">{handSummary(hand.teams[t], game.teams[t], !hand.inPlay)}</div>
            {!hand.inPlay && (
              <>
                <div className="row">
                  <span className={`points ${standing[t].points < 0 ? 'neg' : 'pos'}`}>{signed(standing[t].points)}</span>
                  <span className="running">→ {standing[t].score}</span>
                </div>
                {standing[t].penalty > 0 && <div className="tiny neg bold">Bag penalty −{standing[t].penalty}</div>}
              </>
            )}
          </div>
        ))}
      </div>
      {hand.inPlay && <div className="small muted">{13 - tableBid(hand)} left on the table · tap Enter Books after the hand</div>}
    </button>
  );
}

function RulesSheet({ game, onSave, onClose }) {
  const [rules, setRules] = useState({ ...STANDARD_RULES, ...game.rules });
  const [target, setTarget] = useState(game.target);
  return (
    <Sheet title="Scoring Rules" onClose={onClose} action={{ label: 'Save', onClick: () => onSave(rules, Math.max(1, target)) }}>
      <div className="section-title">Final score</div>
      <div className="card group"><NumberField label="Play to" value={target} onChange={setTarget} width={100} /></div>
      <RulesFields rules={rules} onChange={setRules} />
    </Sheet>
  );
}
