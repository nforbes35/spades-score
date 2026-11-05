import { signed, contractBid, totalBooks, isNil, nilLabel } from './lib/scoring.js';
import { tr } from './lib/i18n.js';
import { useCountUp, BagMeter } from './components.jsx';

export function ScoreCard({ t, team, standing, target, showBags, bagLimit = 10, isWinner, compact }) {
  const score = useCountUp(standing.score);
  const pct = Math.min(Math.max(standing.score, 0), target) / Math.max(target, 1);
  return (
    <div className={`score-card t${t}${isWinner ? ' won' : ''}${compact ? ' compact' : ''}`}>
      <div className="team-name">{team.name}</div>
      {!compact && <div className="players">{team.players.join(' & ')}</div>}
      {/* the score, with the team's bags as dots beside it */}
      <div className="score-row">
        <div className={`score${standing.score < 0 ? ' neg' : ''}`}>{score}</div>
        {showBags && <BagMeter bags={standing.bags} limit={bagLimit} />}
      </div>
      <div className="progress"><div style={{ width: `${pct * 100}%` }} /></div>
    </div>
  );
}

function handSummary(round, team) {
  const parts = [tr('Bid {bid}, took {took}', { bid: contractBid(round), took: totalBooks(round) })];
  round.players.forEach((p, i) => { if (isNil(p.call)) parts.push(`${team.players[i]}: ${nilLabel(p.call)}${p.books === 0 ? ' ✓' : ' ✗'}`); });
  return parts.join(' · ');
}

export function HandRow({ hand, number, standing, game, onOpen }) {
  const body = (
    <>
      <div className="hand-num">{tr('Hand {n}', { n: number })}</div>
      <div className="hand-cols">
        {[0, 1].map((t) => (
          <div key={t} className={`hand-col t${t}`}>
            <div className="small muted">{handSummary(hand.teams[t], game.teams[t])}</div>
            <div className="row">
              <span className={`points ${standing[t].points < 0 ? 'neg' : 'pos'}`}>{signed(standing[t].points)}</span>
              <span className="running">→ {standing[t].score}</span>
            </div>
            {standing[t].penalty > 0 && <div className="tiny neg bold">{tr('Bag penalty −{n}', { n: standing[t].penalty })}</div>}
          </div>
        ))}
      </div>
    </>
  );
  return onOpen
    ? <button type="button" className="card hand-row" onClick={onOpen}>{body}</button>
    : <div className="card hand-row">{body}</div>;
}
