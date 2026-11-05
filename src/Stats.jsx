import { useMemo, useState } from 'react';
import { loadLog, computeStats, forgetGame } from './lib/stats.js';
import { history } from './lib/scoring.js';
import { Sheet, Segmented, Icon } from './components.jsx';
import { DomStatsList } from './dominoes/Fun.jsx';

const MEDALS = ['🥇', '🥈', '🥉'];
const fmtPct = (n) => (n == null ? '—' : `${n}%`);
const streakText = (s) => (s > 0 ? `W${s}` : s < 0 ? `L${-s}` : '—');

/** Stats & records: a leaderboard, each player's numbers, and the games they come from. */
export default function Stats({ onClose }) {
  const [log, setLog] = useState(loadLog);
  const [tab, setTab] = useState('players');
  const [who, setWho] = useState(null);
  const players = useMemo(() => computeStats(log), [log]);
  const player = who ? players.find((p) => p.key === who) : null;
  const finished = log.filter((g) => g.finished).length;

  return (
    <Sheet title={player ? player.name : 'Stats & records'} onClose={player ? () => setWho(null) : onClose}
      closeLabel={player ? 'Back' : 'Done'}>
      {player ? <PlayerDetail p={player} onPick={setWho} players={players} /> : (
        <>
          <div className="stats-summary">
            <div><b>{finished}</b><span>games</span></div>
            <div><b>{log.reduce((n, g) => n + g.hands.length, 0)}</b><span>hands</span></div>
            <div><b>{players.length}</b><span>players</span></div>
          </div>
          <Segmented options={[{ id: 'players', label: 'Spades' }, { id: 'games', label: 'Games' }, { id: 'dominoes', label: 'Dominoes' }]} value={tab} onChange={setTab} label="Show" />
          {!log.length && tab !== 'dominoes' && (
            <div className="card empty stats-empty">
              <Icon name="trophy" size={34} />
              <p>Finish a game and everyone’s stats show up here. Phones in the same game share their history, so stats fill in for everybody.</p>
            </div>
          )}
          {tab === 'dominoes' ? <DomStatsList /> : tab === 'players' ? (
            <div className="leaderboard">
              {players.map((p, i) => (
                <button key={p.key} type="button" className="card lb-row" onClick={() => setWho(p.key)}>
                  <span className="lb-rank">{p.games ? (MEDALS[i] ?? i + 1) : '·'}</span>
                  <span className="lb-main">
                    <b>{p.name}</b>
                    <span className="muted small">{p.games ? `${p.wins}–${p.losses}` : 'No finished games'}{p.bestPartner ? ` · best with ${p.bestPartner.name}` : ''}</span>
                    {p.games > 0 && <span className="lb-bar"><i style={{ width: `${p.winPct}%` }} /></span>}
                  </span>
                  <span className="lb-pct">{fmtPct(p.winPct)}<small>{p.recent.slice(-5).map((r, k) => <i key={k} className={r === 'W' ? 'w' : 'l'} />)}</small></span>
                </button>
              ))}
            </div>
          ) : (
            <GameList log={log} onDelete={(id) => { forgetGame(id); setLog(loadLog()); }} />
          )}
          <p className="footnote">Stats come from games played on this phone or with it. People are matched by name, so use the same name each time. Computer players aren’t ranked.</p>
        </>
      )}
    </Sheet>
  );
}

function Tile({ label, value, sub, good }) {
  return (
    <div className={`stat-tile${good ? ' good' : ''}`}>
      <b>{value}</b>
      <span>{label}</span>
      {sub && <small>{sub}</small>}
    </div>
  );
}

function PlayerDetail({ p, onPick, players }) {
  const known = new Set(players.map((x) => x.key));
  return (
    <div className="player-detail">
      <div className="pd-head">
        <div className="win-ring" style={{ '--pct': p.winPct ?? 0 }}>
          <div><b>{fmtPct(p.winPct)}</b><span>wins</span></div>
        </div>
        <div className="pd-record">
          <b>{p.wins}–{p.losses}</b>
          <span>{p.games} game{p.games === 1 ? '' : 's'}{p.unfinished ? ` · ${p.unfinished} unfinished` : ''}</span>
          <span className="form">{p.recent.map((r, i) => <i key={i} className={r === 'W' ? 'w' : 'l'}>{r}</i>)}</span>
        </div>
      </div>

      <div className="section-title">Nil &amp; blind nil</div>
      <div className="stat-grid">
        <Tile label="Nil made" value={p.nil ? `${p.nilMade}/${p.nil}` : 'None yet'} sub={p.nil ? fmtPct(p.nilPct) : 'never tried'} good={p.nilPct >= 70} />
        <Tile label="Blind nil made" value={p.blind ? `${p.blindMade}/${p.blind}` : 'None yet'} sub={p.blind ? fmtPct(p.blindPct) : 'never tried'} good={p.blindPct >= 60} />
      </div>

      <div className="section-title">Bidding</div>
      <div className="stat-grid">
        <Tile label="Average bid" value={p.avgBid ?? '—'} />
        <Tile label="Made own bid" value={fmtPct(p.ownBidPct)} sub={`${p.ownBidMade}/${p.bidHands} hands`} />
        <Tile label="Team made its bid" value={fmtPct(p.teamMadePct)} sub={`${p.teamMade} made · ${p.teamSet} set`} />
        <Tile label="10+ bids made" value={`${p.bigBidsMade}/${p.bigBids}`} />
        <Tile label="Books per hand" value={p.avgBooks ?? '—'} sub={`${p.books} in ${p.hands} hands`} />
        <Tile label="Best final score" value={p.bestScore ?? '—'} />
      </div>

      <div className="section-title">Streaks</div>
      <div className="stat-grid">
        <Tile label="Right now" value={streakText(p.streak)} good={p.streak >= 2} />
        <Tile label="Longest win streak" value={p.longestStreak || '—'} />
      </div>

      <div className="section-title">Partners</div>
      <div className="card group partners">
        {p.partners.length ? p.partners.map((x) => (
          <button key={x.name} type="button" className="partner-row" disabled={x.bot || !known.has(x.name.trim().toLowerCase())}
            onClick={() => onPick(x.name.trim().replace(/\s+/g, ' ').toLowerCase())}>
            <span>{x === p.bestPartner && <span className="best">★ </span>}{x.name}{x.bot ? ' 🤖' : ''}</span>
            <span className="muted">{x.wins}–{x.games - x.wins}</span>
            <b>{fmtPct(x.games ? Math.round((100 * x.wins) / x.games) : null)}</b>
          </button>
        )) : <p className="muted">No partners yet.</p>}
      </div>
      {(p.beatsMost || p.losesToMost) && (
        <>
          <div className="section-title">Rivals</div>
          <div className="stat-grid">
            {p.beatsMost && p.beatsMost.wins > 0 && <Tile label="Beats most" value={p.beatsMost.name} sub={`${p.beatsMost.wins} wins against`} good />}
            {p.losesToMost && p.losesToMost.games - p.losesToMost.wins > 0 && <Tile label="Loses to most" value={p.losesToMost.name} sub={`${p.losesToMost.games - p.losesToMost.wins} losses against`} />}
          </div>
        </>
      )}
    </div>
  );
}

function GameList({ log, onDelete }) {
  if (!log.length) return null;
  return (
    <div className="stack game-list">
      {[...log].reverse().map((g) => {
        const hist = history(g);
        const final = hist[hist.length - 1];
        return (
          <div key={g.id} className="card game-row">
            <div className="row between">
              <span className="eyebrow">{new Date(g.finishedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · {g.mode === 'online' ? 'Online' : 'At the table'}{g.finished ? '' : ' · unfinished'}</span>
              <button type="button" className="text-btn small" onClick={() => { if (confirm('Remove this game from the stats on this phone?')) onDelete(g.id); }}>Remove</button>
            </div>
            {g.teams.map((t, i) => (
              <div key={i} className={`game-team t${i}${g.winner === i ? ' won' : ''}`}>
                <span>{g.winner === i ? '🏆 ' : ''}{t.players.join(' & ')}</span>
                <b>{final ? final[i].score : 0}</b>
              </div>
            ))}
            <span className="muted small">{g.hands.length} hand{g.hands.length === 1 ? '' : 's'} · to {g.target}</span>
          </div>
        );
      })}
    </div>
  );
}
