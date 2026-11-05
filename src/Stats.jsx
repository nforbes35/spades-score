import { useMemo, useState } from 'react';
import { loadLog, computeStats, forgetGame } from './lib/stats.js';
import { history } from './lib/scoring.js';
import { tr, getLang } from './lib/i18n.js';
import { Sheet, Segmented, Icon } from './components.jsx';
import { DomStatsList } from './dominoes/Fun.jsx';

const MEDALS = ['🥇', '🥈', '🥉'];
const fmtPct = (n) => (n == null ? '—' : `${n}%`);
const streakText = (s) => (s > 0 ? tr('W{n}', { n: s }) : s < 0 ? tr('L{n}', { n: -s }) : '—');

/** Stats & records: a leaderboard, each player's numbers, and the games they come from. */
export default function Stats({ onClose }) {
  const [log, setLog] = useState(loadLog);
  const [tab, setTab] = useState('players');
  const [who, setWho] = useState(null);
  const players = useMemo(() => computeStats(log), [log]);
  const player = who ? players.find((p) => p.key === who) : null;
  const finished = log.filter((g) => g.finished).length;

  return (
    <Sheet title={player ? player.name : tr('Stats & records')} onClose={player ? () => setWho(null) : onClose}
      closeLabel={player ? tr('Back') : tr('Done')}>
      {player ? <PlayerDetail p={player} onPick={setWho} players={players} /> : (
        <>
          <div className="stats-summary">
            <div><b>{finished}</b><span>{tr('games')}</span></div>
            <div><b>{log.reduce((n, g) => n + g.hands.length, 0)}</b><span>{tr('hands')}</span></div>
            <div><b>{players.length}</b><span>{tr('players')}</span></div>
          </div>
          <Segmented options={[{ id: 'players', label: 'Spades' }, { id: 'games', label: tr('Games') }, { id: 'dominoes', label: tr('Dominoes') }]} value={tab} onChange={setTab} label={tr('Show')} />
          {!log.length && tab !== 'dominoes' && (
            <div className="card empty stats-empty">
              <Icon name="trophy" size={34} />
              <p>{tr('Finish a game and everyone’s stats show up here. Phones in the same game share their history, so stats fill in for everybody.')}</p>
            </div>
          )}
          {tab === 'dominoes' ? <DomStatsList /> : tab === 'players' ? (
            <div className="leaderboard">
              {players.map((p, i) => (
                <button key={p.key} type="button" className="card lb-row" onClick={() => setWho(p.key)}>
                  <span className="lb-rank">{p.games ? (MEDALS[i] ?? i + 1) : '·'}</span>
                  <span className="lb-main">
                    <b>{p.name}</b>
                    <span className="muted small">{p.games ? `${p.wins}–${p.losses}` : tr('No finished games')}{p.bestPartner ? ` · ${tr('best with {name}', { name: p.bestPartner.name })}` : ''}</span>
                    {p.games > 0 && <span className="lb-bar"><i style={{ width: `${p.winPct}%` }} /></span>}
                  </span>
                  <span className="lb-pct">{fmtPct(p.winPct)}<small>{p.recent.slice(-5).map((r, k) => <i key={k} className={r === 'W' ? 'w' : 'l'} />)}</small></span>
                </button>
              ))}
            </div>
          ) : (
            <GameList log={log} onDelete={(id) => { forgetGame(id); setLog(loadLog()); }} />
          )}
          <p className="footnote">{tr('Stats come from games played on this phone or with it. People are matched by name, so use the same name each time. Computer players aren’t ranked.')}</p>
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
          <div><b>{fmtPct(p.winPct)}</b><span>{tr('wins')}</span></div>
        </div>
        <div className="pd-record">
          <b>{p.wins}–{p.losses}</b>
          <span>{p.games === 1 ? tr('{n} game', { n: p.games }) : tr('{n} games', { n: p.games })}{p.unfinished ? ` · ${tr('{n} unfinished', { n: p.unfinished })}` : ''}</span>
          <span className="form">{p.recent.map((r, i) => <i key={i} className={r === 'W' ? 'w' : 'l'}>{r === 'W' ? tr('W') : tr('L')}</i>)}</span>
        </div>
      </div>

      <div className="section-title">{tr('Nil & blind nil')}</div>
      <div className="stat-grid">
        <Tile label={tr('Nil made')} value={p.nil ? `${p.nilMade}/${p.nil}` : tr('None yet')} sub={p.nil ? fmtPct(p.nilPct) : tr('never tried')} good={p.nilPct >= 70} />
        <Tile label={tr('Blind nil made')} value={p.blind ? `${p.blindMade}/${p.blind}` : tr('None yet')} sub={p.blind ? fmtPct(p.blindPct) : tr('never tried')} good={p.blindPct >= 60} />
      </div>

      <div className="section-title">{tr('Bidding')}</div>
      <div className="stat-grid">
        <Tile label={tr('Average bid')} value={p.avgBid ?? '—'} />
        <Tile label={tr('Made own bid')} value={fmtPct(p.ownBidPct)} sub={tr('{made}/{n} hands', { made: p.ownBidMade, n: p.bidHands })} />
        <Tile label={tr('Team made its bid')} value={fmtPct(p.teamMadePct)} sub={tr('{made} made · {set} set', { made: p.teamMade, set: p.teamSet })} />
        <Tile label={tr('10+ bids made')} value={`${p.bigBidsMade}/${p.bigBids}`} />
        <Tile label={tr('Books per hand')} value={p.avgBooks ?? '—'} sub={tr('{n} in {hands} hands', { n: p.books, hands: p.hands })} />
        <Tile label={tr('Best final score')} value={p.bestScore ?? '—'} />
      </div>

      <div className="section-title">{tr('Streaks')}</div>
      <div className="stat-grid">
        <Tile label={tr('Right now')} value={streakText(p.streak)} good={p.streak >= 2} />
        <Tile label={tr('Longest win streak')} value={p.longestStreak || '—'} />
      </div>

      <div className="section-title">{tr('Partners')}</div>
      <div className="card group partners">
        {p.partners.length ? p.partners.map((x) => (
          <button key={x.name} type="button" className="partner-row" disabled={x.bot || !known.has(x.name.trim().toLowerCase())}
            onClick={() => onPick(x.name.trim().replace(/\s+/g, ' ').toLowerCase())}>
            <span>{x === p.bestPartner && <span className="best">★ </span>}{x.name}{x.bot ? ' 🤖' : ''}</span>
            <span className="muted">{x.wins}–{x.games - x.wins}</span>
            <b>{fmtPct(x.games ? Math.round((100 * x.wins) / x.games) : null)}</b>
          </button>
        )) : <p className="muted">{tr('No partners yet.')}</p>}
      </div>
      {(p.beatsMost || p.losesToMost) && (
        <>
          <div className="section-title">{tr('Rivals')}</div>
          <div className="stat-grid">
            {p.beatsMost && p.beatsMost.wins > 0 && <Tile label={tr('Beats most')} value={p.beatsMost.name} sub={tr('{n} wins against', { n: p.beatsMost.wins })} good />}
            {p.losesToMost && p.losesToMost.games - p.losesToMost.wins > 0 && <Tile label={tr('Loses to most')} value={p.losesToMost.name} sub={tr('{n} losses against', { n: p.losesToMost.games - p.losesToMost.wins })} />}
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
              <span className="eyebrow">{new Date(g.finishedAt).toLocaleDateString(getLang(), { month: 'short', day: 'numeric' })} · {g.mode === 'online' ? tr('Online') : tr('At the table')}{g.finished ? '' : ` · ${tr('unfinished')}`}</span>
              <button type="button" className="text-btn small" onClick={() => { if (confirm(tr('Remove this game from the stats on this phone?'))) onDelete(g.id); }}>{tr('Remove')}</button>
            </div>
            {g.teams.map((t, i) => (
              <div key={i} className={`game-team t${i}${g.winner === i ? ' won' : ''}`}>
                <span>{g.winner === i ? '🏆 ' : ''}{t.players.join(' & ')}</span>
                <b>{final ? final[i].score : 0}</b>
              </div>
            ))}
            <span className="muted small">{g.hands.length === 1 ? tr('{n} hand · to {target}', { n: g.hands.length, target: g.target }) : tr('{n} hands · to {target}', { n: g.hands.length, target: g.target })}</span>
          </div>
        );
      })}
    </div>
  );
}
