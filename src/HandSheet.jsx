import { useState } from 'react';
import { contractBid, totalBooks, tableBid, isNil, nilLabel, scoreTeam, signed } from './lib/scoring.js';
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
  // A brand-new hand starts at bids; one already in play or scored opens at books.
  const [phase, setPhase] = useState(index < 0 ? 'bids' : 'books');

  const setPlayer = (t, p, change) => setHand((h) => ({
    ...h,
    teams: h.teams.map((tr, ti) => (ti !== t ? tr : {
      ...tr, players: tr.players.map((pl, pi) => (pi === p ? { ...pl, ...change } : pl)),
    })),
  }));

  const saveLabel = phase === 'bids' ? (hand.inPlay ? 'Start Hand' : 'Save') : (hand.inPlay ? 'Score Hand' : 'Save');
  const save = () => onSave(phase === 'books' ? { ...hand, inPlay: false } : hand);

  const left = 13 - tableBid(hand);
  const tableBooks = hand.teams.reduce((s, t) => s + totalBooks(t), 0);

  return (
    <Sheet title={`Hand ${number}`} onClose={onClose} action={{ label: saveLabel, onClick: save }}>
      <div className="hand-banner">
        <Segmented options={PHASES} value={phase} onChange={setPhase} label="Step" />
        {phase === 'bids' ? (
          <>
            <div className={`big-count${left < 0 ? ' neg' : ''}`}>
              <strong>{Math.abs(left)}</strong> {left >= 0 ? 'left on the table' : 'over — overbid!'}
            </div>
            <TeamTotals game={game} text={(t) => `bid ${contractBid(hand.teams[t])}`} />
          </>
        ) : (
          <>
            <div className="big-count">
              <strong>{tableBooks}</strong> of 13 books
              <span className={`check ${tableBooks === 13 ? 'ok' : 'warn'}`}>{tableBooks === 13 ? '✓' : '!'}</span>
            </div>
            <TeamTotals game={game} text={(t) => `bid ${contractBid(hand.teams[t])}, took ${totalBooks(hand.teams[t])}`} />
          </>
        )}
      </div>

      {[0, 1].map((t) => phase === 'bids'
        ? <BidsSection key={t} team={game.teams[t]} entry={hand.teams[t]} setPlayer={(p, c) => setPlayer(t, p, c)} />
        : <BooksSection key={t} team={game.teams[t]} entry={hand.teams[t]} rules={game.rules} setPlayer={(p, c) => setPlayer(t, p, c)} />)}

      {onDelete && (
        <button type="button" className="danger-link" onClick={() => { if (confirm(`Delete hand ${number}?`)) onDelete(); }}>
          Delete this hand
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
      <div className="section-title">{team.name} — bid {contractBid(entry)}</div>
      <div className="card group">
        {entry.players.map((pl, p) => (
          <div key={p} className="player">
            <div className="row between">
              <span className="player-name">{team.players[p]}</span>
              {isNil(pl.call)
                ? <span className="nil-tag">{nilLabel(pl.call)}</span>
                : <NumberControl label={`${team.players[p]} bid`} value={pl.bid} onChange={(bid) => setPlayer(p, { bid })} />}
            </div>
            <NilPicker label={`${team.players[p]} nil`} value={pl.call} onChange={(call) => setPlayer(p, { call })} />
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
                {isNil(pl.call) ? nilLabel(pl.call) : `Bid ${pl.bid}`}
              </div>
            </div>
            <NumberControl label={`${team.players[p]} books`} value={pl.books} onChange={(books) => setPlayer(p, { books })} />
          </div>
        ))}
        <div className="player">
          <div className="row between">
            <span className="bold">Team: bid {result.contractBid}, took {result.contractBooks}</span>
            <span className={`team-total ${result.total < 0 ? 'neg' : 'pos'}`}>{signed(result.total)}</span>
          </div>
          {result.lines.map((line) => <div key={line} className="small muted">{line}</div>)}
        </div>
      </div>
    </>
  );
}
