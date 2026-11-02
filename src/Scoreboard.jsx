import { signed, contractBid, totalBooks, isNil, nilLabel } from './lib/scoring.js';
import { useCountUp } from './components.jsx';

export function ScoreCard({ t, team, standing, target, showBags, isWinner, compact }) {
  const score = useCountUp(standing.score);
  const pct = Math.min(Math.max(standing.score, 0), target) / Math.max(target, 1);
  return (
    <div className={`score-card t${t}${isWinner ? ' won' : ''}${compact ? ' compact' : ''}`}>
      <div className="team-name">{team.name}</div>
      {!compact && <div className="players">{team.players.join(' & ')}</div>}
      <div className={`score${standing.score < 0 ? ' neg' : ''}`}>{score}</div>
      <div className="progress"><div style={{ width: `${pct * 100}%` }} /></div>
      {showBags && <div className="bags">{standing.bags} bag{standing.bags === 1 ? '' : 's'}</div>}
    </div>
  );
}

function handSummary(tr, team) {
  const parts = [`Bid ${contractBid(tr)}, took ${totalBooks(tr)}`];
  tr.players.forEach((p, i) => { if (isNil(p.call)) parts.push(`${team.players[i]}: ${nilLabel(p.call)}${p.books === 0 ? ' ✓' : ' ✗'}`); });
  return parts.join(' · ');
}

export function HandRow({ hand, number, standing, game, onOpen }) {
  const body = (
    <>
      <div className="hand-num">Hand {number}</div>
      <div className="hand-cols">
        {[0, 1].map((t) => (
          <div key={t} className={`hand-col t${t}`}>
            <div className="small muted">{handSummary(hand.teams[t], game.teams[t])}</div>
            <div className="row">
              <span className={`points ${standing[t].points < 0 ? 'neg' : 'pos'}`}>{signed(standing[t].points)}</span>
              <span className="running">→ {standing[t].score}</span>
            </div>
            {standing[t].penalty > 0 && <div className="tiny neg bold">Bag penalty −{standing[t].penalty}</div>}
          </div>
        ))}
      </div>
    </>
  );
  return onOpen
    ? <button type="button" className="card hand-row" onClick={onOpen}>{body}</button>
    : <div className="card hand-row">{body}</div>;
}
