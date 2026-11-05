import { useState } from 'react';
import { contractBid, totalBooks, tableBid, isNil, nilLabel, scoreTeam, signed } from './lib/scoring.js';
import { stageOf } from './lib/table.js';
import { tr, tx } from './lib/i18n.js';
import { NumberControl, NilPicker, Segmented, Sheet } from './components.jsx';

const PHASES = [{ id: 'bids', label: 'Bids' }, { id: 'books', label: 'Books' }];

/**
 * Enter a hand in two steps: everyone's bids before play, then everyone's
 * books after. Players are entered one by one but scored as a team.
 */
export default function HandSheet({ game, hand: initial, onSave, onDelete, onClose }) {
  const [hand, setHand] = useState(initial);
  const index = game.hands.findIndex((h) => h.id === initial.id);
  const number = (index < 0 ? game.hands.length : index) + 1;
  // A hand still being bid opens at bids; one being played or already scored opens at books.
  const [phase, setPhase] = useState(stageOf(initial) === 'bids' ? 'bids' : 'books');

  const setPlayer = (t, p, change) => setHand((h) => ({
    ...h,
    teams: h.teams.map((round, ti) => (ti !== t ? round : {
      ...round, players: round.players.map((pl, pi) => (pi === p ? { ...pl, ...change } : pl)),
    })),
  }));


  const left = 13 - tableBid(hand);
  const tableBooks = hand.teams.reduce((s, t) => s + totalBooks(t), 0);

  return (
    <Sheet title={tr('Hand {n}', { n: number })} onClose={onClose} action={{ label: tr('Save'), onClick: () => onSave(hand) }}>
      <div className="hand-banner">
        <Segmented options={PHASES.map((x) => ({ ...x, label: tr(x.label) }))} value={phase} onChange={setPhase} label={tr('Step')} />
        {phase === 'bids' ? (
          <>
            <div className={`big-count${left < 0 ? ' neg' : ''}`}>
              <strong>{Math.abs(left)}</strong> {left >= 0 ? tr('left on the table') : tr('over — overbid!')}
            </div>
            <TeamTotals game={game} text={(t) => tr('bid {n}', { n: contractBid(hand.teams[t]) })} />
          </>
        ) : (
          <>
            <div className="big-count">
              {tx('{n} of 13 books', { n: <strong>{tableBooks}</strong> })}
              <span className={`check ${tableBooks === 13 ? 'ok' : 'warn'}`}>{tableBooks === 13 ? '✓' : '!'}</span>
            </div>
            <TeamTotals game={game} text={(t) => tr('bid {bid}, took {took}', { bid: contractBid(hand.teams[t]), took: totalBooks(hand.teams[t]) })} />
          </>
        )}
      </div>

      {[0, 1].map((t) => phase === 'bids'
        ? <BidsSection key={t} team={game.teams[t]} entry={hand.teams[t]} setPlayer={(p, c) => setPlayer(t, p, c)} />
        : <BooksSection key={t} team={game.teams[t]} entry={hand.teams[t]} rules={game.rules} setPlayer={(p, c) => setPlayer(t, p, c)} />)}

      {onDelete && (
        <button type="button" className="danger-link" onClick={() => { if (confirm(tr('Delete hand {n}?', { n: number }))) onDelete(); }}>
          {tr('Delete this hand')}
        </button>
      )}
    </Sheet>
  );
}

function TeamTotals({ game, text }) {
  return (
    <div className="team-totals">
      {[0, 1].map((t) => <span key={t}>{game.teams[t].name}: {text(t)}</span>)}
    </div>
  );
}

function BidsSection({ team, entry, setPlayer }) {
  return (
    <>
      <div className="section-title">{team.name} — {tr('bid {n}', { n: contractBid(entry) })}</div>
      <div className="card group">
        {entry.players.map((pl, p) => (
          <div key={p} className="player">
            <div className="row between">
              <span className="player-name">{team.players[p]}</span>
              {isNil(pl.call)
                ? <span className="nil-tag">{nilLabel(pl.call)}</span>
                : <NumberControl label={tr('{name} bid', { name: team.players[p] })} value={pl.bid} onChange={(bid) => setPlayer(p, { bid })} />}
            </div>
            <NilPicker label={tr('{name} nil', { name: team.players[p] })} value={pl.call} onChange={(call) => setPlayer(p, { call })} />
          </div>
        ))}
      </div>
    </>
  );
}

function BooksSection({ team, entry, rules, setPlayer }) {
  const result = scoreTeam(entry, rules);
  return (
    <>
      <div className="section-title">{team.name}</div>
      <div className="card group">
        {entry.players.map((pl, p) => (
          <div key={p} className="player row between">
            <div>
              <div className="player-name">{team.players[p]}</div>
              <div className={`small bold ${isNil(pl.call) ? 'nil-text' : 'muted'}`}>
                {isNil(pl.call) ? nilLabel(pl.call) : tr('Bid {n}', { n: pl.bid })}
              </div>
            </div>
            <NumberControl label={tr('{name} books', { name: team.players[p] })} value={pl.books} onChange={(books) => setPlayer(p, { books })} />
          </div>
        ))}
        <div className="player">
          <div className="row between">
            <span className="bold">{tr('Team: bid {bid}, took {took}', { bid: result.contractBid, took: result.contractBooks })}</span>
            <span className={`team-total ${result.total < 0 ? 'neg' : 'pos'}`}>{signed(result.total)}</span>
          </div>
          {result.lines.map((line) => <div key={line} className="small muted">{line}</div>)}
        </div>
      </div>
    </>
  );
}
