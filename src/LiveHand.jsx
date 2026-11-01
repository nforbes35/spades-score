import { contractBid, isNil, nilLabel, tableBid } from './lib/scoring.js';
import { SEATS, teamOf, playerName, seatEntry, liveOf, leaderOf, booksPlayed, updateSeat, seatProgress } from './lib/table.js';
import { cardLabel } from './lib/cards.js';
import { NumberControl, NilPicker, PlayingCard, Icon } from './components.jsx';

/** Seats drawn around a table: you (seat 1) at the bottom, partner across the top. */
const AREAS = ['bottom', 'left', 'top', 'right'];

export function LeftOnTable({ hand }) {
  const left = 13 - tableBid(hand);
  return (
    <div className={`left-count${left < 0 ? ' neg' : ''}`}>
      <strong>{Math.abs(left)}</strong>
      <span>{left >= 0 ? 'left on the table' : 'over — overbid!'}</span>
    </div>
  );
}

function SeatBadges({ game, hand, s, remoteSeat }) {
  return (
    <>
      {hand.dealer === s && <span className="tag">deals</span>}
      {remoteSeat === s && <span className="tag remote"><Icon name="phone" size={12} /> remote</span>}
    </>
  );
}

/** Stage 1: everyone's bids, with nil / blind nil. */
export function BidsPanel({ game, hand, number, onChange, remoteSeat, remoteName, peer }) {
  const cycleDealer = () => onChange('Change dealer', (h) => ({ ...h, dealer: ((h.dealer ?? 0) + 1) % 4 }));
  return (
    <section className="live card">
      <div className="live-head">
        <div>
          <div className="eyebrow">Hand {number} · Bidding</div>
          <LeftOnTable hand={hand} />
        </div>
        <button type="button" className="chip" onClick={cycleDealer} title="Change who deals">
          {playerName(game, hand.dealer ?? 0)} deals
        </button>
      </div>
      <div className="team-bids">
        {[0, 1].map((t) => (
          <span key={t} className={`team-pill t${t}`}>{game.teams[t].name}: bid {contractBid(hand.teams[t])}</span>
        ))}
      </div>
      <div className="bid-rows">
        {SEATS.map((_, s) => {
          const p = seatEntry(hand, s);
          const name = playerName(game, s);
          return (
            <div key={s} className={`bid-row t${teamOf(s)}`}>
              <div className="bid-top">
                <div className="who">
                  <span className="name">{name}</span>
                  <SeatBadges game={game} hand={hand} s={s} remoteSeat={remoteSeat} />
                </div>
                {isNil(p.call)
                  ? <span className="nil-tag">{nilLabel(p.call)}</span>
                  : <NumberControl compact label={`${name} bid`} value={p.bid}
                      onChange={(bid) => onChange(`${name}'s bid`, (h) => updateSeat(h, s, { bid }))} />}
              </div>
              <NilPicker small label={`${name} nil`} value={p.call}
                onChange={(call) => onChange(`${name}'s nil`, (h) => updateSeat(h, s, { call }))} />
              {remoteSeat === s && (
                <div className="hint">{peer ? `${remoteName} can bid from their phone too.` : `Waiting for ${remoteName} to connect.`}</div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Stage 2: the table. Tap whoever won each book. Read-only when onAward is missing
 * (the remote player's view).
 */
export function TableView({ game, hand, onAward, remoteSeat, mySeat, centerExtra }) {
  const live = liveOf(hand);
  const played = booksPlayed(hand);
  const leader = leaderOf(hand);
  const done = played >= 13;
  const remoteName = remoteSeat != null ? playerName(game, remoteSeat) : null;

  return (
    <div className="table-grid">
      {SEATS.map((_, s) => {
        const p = seatEntry(hand, s);
        const prog = seatProgress(hand, s);
        const name = s === mySeat ? 'You' : playerName(game, s);
        const content = (
          <>
            <div className="tile-name">
              {name}
              {remoteSeat === s && s !== mySeat && <Icon name="phone" size={13} />}
            </div>
            <div className="tile-books">{p.books}</div>
            <div className={`tile-sub${prog.good ? ' good' : ''}${prog.bad ? ' bad' : ''}`}>
              {isNil(p.call) ? `${nilLabel(p.call)} · ${prog.text}` : prog.text}{prog.good ? ' ✓' : ''}
            </div>
            {!done && leader === s && <span className="lead-tag">leads</span>}
          </>
        );
        const cls = `seat-tile t${teamOf(s)} ${AREAS[s]}${!done && leader === s ? ' leading' : ''}${s === mySeat ? ' me' : ''}`;
        return onAward
          ? <button key={s} type="button" className={cls} disabled={done} onClick={() => onAward(s)}
              aria-label={`Give book to ${playerName(game, s)}`}>{content}</button>
          : <div key={s} className={cls}>{content}</div>;
      })}
      <div className="table-center">
        <div className="book-count">{done ? 'All 13 books' : `Book ${played + 1}`}<small>{done ? 'played' : 'of 13'}</small></div>
        {live.pending && (
          <div className="played-card">
            <PlayingCard code={live.pending} size="sm" />
            <span>{mySeat === remoteSeat ? 'You played' : `${remoteName} played`}</span>
          </div>
        )}
        {centerExtra}
      </div>
    </div>
  );
}

/** Stage 2 for the scorekeeper, with the remote player's card and a "your turn" ping. */
export function PlayPanel({ game, hand, number, onAward, remoteSeat, peer, onPing, onScan }) {
  const live = liveOf(hand);
  const remoteName = remoteSeat != null ? playerName(game, remoteSeat) : null;
  const remaining = live.cards ? live.cards.length - booksPlayed(hand) - (live.pending ? 1 : 0) : null;
  return (
    <section className="live card">
      <div className="live-head">
        <div>
          <div className="eyebrow">Hand {number} · Playing</div>
          <div className="live-title">Tap who won each book</div>
        </div>
        <span className="chip quiet">{playerName(game, hand.dealer ?? 0)} dealt</span>
      </div>
      <TableView game={game} hand={hand} onAward={onAward} remoteSeat={remoteSeat} />
      {remoteSeat != null && (
        <div className="remote-strip">
          {live.pending
            ? <span className="remote-played"><b>{remoteName}</b> played <b className="big-card-text">{cardLabel(live.pending)}</b>. Play it for them.</span>
            : <span>{live.cards ? `${remoteName} has ${remaining} card${remaining === 1 ? '' : 's'} left.` : `${remoteName}'s cards aren't scanned yet.`}</span>}
          <div className="row">
            {!live.cards && <button type="button" className="soft" onClick={onScan}><Icon name="camera" size={18} /> Scan cards</button>}
            <button type="button" className="soft" disabled={!peer} onClick={onPing}><Icon name="bell" size={18} /> Your turn</button>
          </div>
        </div>
      )}
    </section>
  );
}
