import { contractBid, isNil, nilLabel, tableBid, totalBooks, scoreTeam, signed } from './lib/scoring.js';
import { tr, tx, langMsg } from './lib/i18n.js';
import { SEATS, teamOf, playerName, seatEntry, liveOf, leaderOf, booksPlayed, updateSeat, seatProgress, remainingCards, teamSeats, setTeamBooks } from './lib/table.js';
import { NumberControl, NilPicker, PlayingCard, Icon, CardText } from './components.jsx';

/** Seats drawn around a table: you (seat 1) at the bottom, partner across the top. */
const AREAS = ['bottom', 'left', 'top', 'right'];

export function LeftOnTable({ hand }) {
  const left = 13 - tableBid(hand);
  return (
    <div className={`left-count${left < 0 ? ' neg' : ''}`}>
      <strong>{Math.abs(left)}</strong>
      <span>{left >= 0 ? tr('left on the table') : tr('over — overbid!')}</span>
    </div>
  );
}

function SeatBadges({ hand, s, remote }) {
  return (
    <>
      {hand.dealer === s && <span className="tag">{tr('deals')}</span>}
      {remote && <span className="tag remote"><Icon name="phone" size={12} /> {tr('remote')}</span>}
    </>
  );
}

/** Stage 1: everyone's bids, with nil / blind nil. `remoteSeats` play from their phones. */
export function BidsPanel({ game, hand, number, onChange, remoteSeats = [], online = () => false }) {
  const cycleDealer = () => onChange('Change dealer', (h) => ({ ...h, dealer: ((h.dealer ?? 0) + 1) % 4 }));
  return (
    <section className="live card">
      <div className="live-head">
        <div>
          <div className="eyebrow">{tr('Hand {n} · Bidding', { n: number })}</div>
          <LeftOnTable hand={hand} />
        </div>
        <button type="button" className="chip" onClick={cycleDealer} title={tr('Change who deals')}>
          {tr('{name} deals', { name: playerName(game, hand.dealer ?? 0) })}
        </button>
      </div>
      <div className="team-bids">
        {[0, 1].map((t) => (
          <span key={t} className={`team-pill t${t}`}>{game.teams[t].name}: {tr('bid {n}', { n: contractBid(hand.teams[t]) })}</span>
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
                  <SeatBadges hand={hand} s={s} remote={remoteSeats.includes(s)} />
                </div>
                {isNil(p.call)
                  ? <span className="nil-tag">{nilLabel(p.call)}</span>
                  : <NumberControl compact label={tr('{name} bid', { name })} value={p.bid}
                      onChange={(bid) => onChange(langMsg("{name}'s bid", { name }), (h) => updateSeat(h, s, { bid }))} />}
              </div>
              <NilPicker small label={tr('{name} nil', { name })} value={p.call}
                onChange={(call) => onChange(langMsg("{name}'s nil", { name }), (h) => updateSeat(h, s, { call }))} />
              {remoteSeats.includes(s) && (
                <div className="hint">{online(s) ? tr('{name} can bid from their phone too.', { name }) : tr('Waiting for {name} to connect.', { name })}</div>
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
export function TableView({ game, hand, onAward, remoteSeats = [], mySeat, centerExtra }) {
  const live = liveOf(hand);
  const played = booksPlayed(hand);
  const leader = leaderOf(hand);
  const done = played >= 13;
  const shown = Object.entries(live.played).filter(([, c]) => c);

  return (
    <div className="table-grid">
      {SEATS.map((_, s) => {
        const p = seatEntry(hand, s);
        const prog = seatProgress(hand, s);
        const name = s === mySeat ? tr('You') : playerName(game, s);
        const content = (
          <>
            <div className="tile-name">
              {name}
              {remoteSeats.includes(s) && s !== mySeat && <Icon name="phone" size={13} />}
            </div>
            <div className="tile-books">{p.books}</div>
            <div className={`tile-sub${prog.good ? ' good' : ''}${prog.bad ? ' bad' : ''}`}>
              {isNil(p.call) ? `${nilLabel(p.call)} · ${prog.text}` : prog.text}{prog.good ? ' ✓' : ''}
            </div>
            {!done && leader === s && <span className="lead-tag">{tr('leads')}</span>}
          </>
        );
        const cls = `seat-tile t${teamOf(s)} ${AREAS[s]}${!done && leader === s ? ' leading' : ''}${s === mySeat ? ' me' : ''}`;
        return onAward
          ? <button key={s} type="button" className={cls} disabled={done} onClick={() => onAward(s)}
              aria-label={tr('Give book to {name}', { name: playerName(game, s) })}>{content}</button>
          : <div key={s} className={cls}>{content}</div>;
      })}
      <div className="table-center">
        <div className="book-count">{done ? tr('All 13 books') : tr('Book {n}', { n: played + 1 })}<small>{done ? tr('played') : tr('of 13')}</small></div>
        {shown.length > 0 && (
          <div className="played-cards">
            {shown.map(([seat, card]) => (
              <div key={seat} className="played-card">
                <PlayingCard code={card} size="sm" />
                <span>{Number(seat) === mySeat ? tr('You') : playerName(game, Number(seat))}</span>
              </div>
            ))}
          </div>
        )}
        {centerExtra}
      </div>
    </div>
  );
}

/** Stage 2 for the scorekeeper: the table, plus each remote player's card and a "your turn" ping. */
export function PlayPanel({ game, hand, number, onAward, remoteSeats = [], online = () => false, onPing, onScan }) {
  const live = liveOf(hand);
  return (
    <section className="live card">
      <div className="live-head">
        <div>
          <div className="eyebrow">{tr('Hand {n} · Playing', { n: number })}</div>
          <div className="live-title">{tr('Tap who won each book')}</div>
        </div>
        <span className="chip quiet">{tr('{name} dealt', { name: playerName(game, hand.dealer ?? 0) })}</span>
      </div>
      <TableView game={game} hand={hand} onAward={onAward} remoteSeats={remoteSeats} />
      {remoteSeats.map((seat) => {
        const name = playerName(game, seat);
        const left = remainingCards(hand, seat);
        const card = live.played[seat];
        return (
          <div key={seat} className="remote-strip">
            {card
              ? <span className="remote-played">{tx('{name} played {card}. Play it for them.', { name: <b>{name}</b>, card: <span className="big-card-text"><CardText code={card} /></span> })}</span>
              : <span>{left
                ? (left.length === 1 ? tr('{name} has {n} card left.', { name, n: left.length }) : tr('{name} has {n} cards left.', { name, n: left.length }))
                : tr("{name}'s cards aren't scanned yet.", { name })}</span>}
            <div className="row">
              {!left && <button type="button" className="soft" onClick={() => onScan(seat)}><Icon name="camera" size={18} /> {tr('Scan cards')}</button>}
              <button type="button" className="soft" disabled={!online(seat)} onClick={() => onPing(seat)}><Icon name="bell" size={18} /> {tr('Your turn')}</button>
            </div>
          </div>
        );
      })}
    </section>
  );
}

/**
 * Scorekeeper: the bids to look at while the hand is played, then how many books each team won, entered at the
 * end. Setting one team's books fills in the other (they add up to 13). Each nil player: made it, or how many
 * books they took. Shows what each team will score before the hand is scored.
 */
export function BooksPanel({ game, hand, number, onChange }) {
  const setBooks = (t, n, nilTook) => onChange(langMsg('{team} books', { team: game.teams[t].name }), (h) => {
    let next = setTeamBooks(h, t, n, nilTook);
    const other = 1 - t;
    const allNil = teamSeats(other).every((s) => isNil(seatEntry(h, s).call));
    if (!allNil) next = setTeamBooks(next, other, 13 - totalBooks(next.teams[t]));
    return next;
  });
  const sum = totalBooks(hand.teams[0]) + totalBooks(hand.teams[1]);
  return (
    <section className="live card keeper">
      <div className="live-head">
        <div>
          <div className="eyebrow">{tr('Hand {n} · Playing', { n: number })}</div>
          <div className="live-title">{tr('After the hand, enter the books each team won')}</div>
        </div>
        <span className="chip quiet">{tr('{name} dealt', { name: playerName(game, hand.dealer ?? 0) })}</span>
      </div>
      {[0, 1].map((t) => {
        const round = hand.teams[t];
        const seats = teamSeats(t);
        const nils = seats.filter((s) => isNil(seatEntry(hand, s).call));
        const allNil = nils.length === 2;
        const books = totalBooks(round);
        const res = scoreTeam(round, game.rules);
        const nilTook = Object.fromEntries(nils.map((s) => [s, seatEntry(hand, s).books]));
        return (
          <div key={t} className={`keeper-team t${t}`}>
            <div className="keeper-name">{game.teams[t].name}</div>
            <div className="keeper-bids">
              {seats.map((s) => {
                const p = seatEntry(hand, s);
                return <span key={s}>{playerName(game, s)}: <b>{isNil(p.call) ? nilLabel(p.call) : p.bid}</b></span>;
              })}
              {!allNil && <span className="keeper-total">{tr('Team bid {n}', { n: contractBid(round) })}</span>}
            </div>
            {!allNil && (
              <div className="keeper-books">
                <span>{tr('Books won')}</span>
                <NumberControl label={tr('{team} books won', { team: game.teams[t].name })} value={books} onChange={(n) => setBooks(t, n, nilTook)} />
              </div>
            )}
            {nils.map((s) => {
              const took = seatEntry(hand, s).books;
              const name = playerName(game, s);
              return (
                <div key={s} className="keeper-nil">
                  <span>{tr('{name} ({nil})', { name, nil: nilLabel(seatEntry(hand, s).call) })}</span>
                  <div className="segmented small" role="radiogroup" aria-label={tr('Did {name} make it?', { name })}>
                    <button type="button" role="radio" aria-checked={took === 0} className={took === 0 ? 'on' : ''}
                      onClick={() => setBooks(t, books, { ...nilTook, [s]: 0 })}>{tr('Made it ✓')}</button>
                    <button type="button" role="radio" aria-checked={took > 0} className={took > 0 ? 'on' : ''}
                      onClick={() => took === 0 && setBooks(t, books, { ...nilTook, [s]: 1 })}>{tr('Got set ✗')}</button>
                  </div>
                  {took > 0 && (
                    <div className="keeper-books">
                      <span>{tr('Books {name} took', { name })}</span>
                      <NumberControl compact min={1} label={tr('Books {name} took', { name })} value={took}
                        onChange={(n) => setBooks(t, books, { ...nilTook, [s]: n })} />
                    </div>
                  )}
                </div>
              );
            })}
            {sum === 13 && (
              <div className={`keeper-score ${res.total < 0 ? 'neg' : 'pos'}`}>
                <b>{signed(res.total)}</b>
                <span>{res.lines.join(' · ')}</span>
              </div>
            )}
          </div>
        );
      })}
      <p className={`keeper-sum${sum === 13 ? '' : ' neg'}`}>{tr('{n} of 13 books', { n: sum })}</p>
    </section>
  );
}
