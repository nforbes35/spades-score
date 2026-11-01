import { useEffect, useState } from 'react';
import { read, write } from './lib/store.js';
import { history, standings, winner, contractBid, isNil, nilLabel } from './lib/scoring.js';
import { SEATS, teamOf, playerName, seatEntry, stageOf, liveOf, leaderOf, remainingCards, booksPlayed } from './lib/table.js';
import { sortHand } from './lib/cards.js';
import { useRoom } from './lib/room.js';
import { useVideoCall } from './lib/video.js';
import { useWakeLock, chime, buzz } from './lib/fx.js';
import { NumberControl, NilPicker, FannedHand, Icon, useToast, StatusDot, Confetti, CardText } from './components.jsx';
import { LeftOnTable, TableView } from './LiveHand.jsx';
import { ScoreCard, HandRow } from './Scoreboard.jsx';
import VideoCorner from './VideoCorner.jsx';

const STATE_KEY = 'spades-remote-state';
const SEND_TIMEOUT_MS = 6000;

/** Remote mode: the player who isn't at the table. Sees their cards, bids and books live. */
export default function RemoteApp({ code, onLeave }) {
  const [game, setGame] = useState(() => {
    const saved = read(STATE_KEY);
    return saved?.code === code ? saved.game : null;
  });
  const [ended, setEnded] = useState(false);
  const [pinged, setPinged] = useState(false);
  const [selected, setSelected] = useState(null);
  const [sending, setSending] = useState(null);
  const [revealed, setRevealed] = useState({});
  const [draft, setDraft] = useState(null);
  const toast = useToast();

  const room = useRoom(code, 'remote', (m) => {
    if (m.type === 'state') {
      setGame(m.game);
      setEnded(!m.game?.remote || m.game.remote.code !== code);
      write(STATE_KEY, { code, game: m.game });
    } else if (m.type === 'ended') {
      setEnded(true);
    } else if (m.type === 'ping') {
      setPinged(true);
      chime(true);
      buzz([200, 100, 200]);
      setTimeout(() => setPinged(false), 6000);
    } else if (m.type === 'rtc') {
      call.handle(m);
    }
  });
  const call = useVideoCall(room.send, true);

  useEffect(() => { if (room.peer) room.send({ type: 'hello' }); }, [room.peer, room.send]);
  useWakeLock(true);

  const mySeat = game?.remote?.seat;
  const hand = game?.hands.find((h) => h.inPlay) ?? null;
  const stage = hand ? stageOf(hand) : null;
  const me = hand && mySeat != null ? seatEntry(hand, mySeat) : null;
  const live = hand ? liveOf(hand) : null;
  const myCards = hand ? sortHand(remainingCards(hand) ?? []) : [];

  // My bid while it's on its way to the table, so quick taps don't jump around.
  const shownBid = draft && draft.handId === hand?.id ? draft : me;
  useEffect(() => {
    if (draft && me && me.bid === draft.bid && me.call === draft.call) setDraft(null);
  }, [me?.bid, me?.call]);
  useEffect(() => {
    if (!draft) return undefined;
    const t = setTimeout(() => setDraft(null), 3000);
    return () => clearTimeout(t);
  }, [draft]);

  // A played card is "sending" until the table's state shows it.
  useEffect(() => {
    if (sending && live?.pending === sending.card) setSending(null);
  }, [live?.pending]);
  useEffect(() => {
    if (!sending) return undefined;
    const t = setTimeout(() => {
      setSending(null);
      toast.show('That card didn’t reach the table. Try again.');
    }, SEND_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [sending]);
  useEffect(() => { setSelected(null); }, [hand?.id, live?.tricks.length]);

  const win = game ? winner(game) : null;

  const sendBid = (change) => {
    const next = { bid: shownBid.bid, call: shownBid.call, ...change, handId: hand.id };
    setDraft(next);
    room.send({ type: 'bid', handId: hand.id, bid: next.bid, call: next.call });
  };
  const play = () => {
    if (!selected) return;
    room.send({ type: 'play', handId: hand.id, book: live.tricks.length, card: selected });
    setSending({ card: selected });
    buzz(40);
  };

  const canPlay = stage === 'play' && !live.pending && !sending && room.peer && booksPlayed(hand) < 13;
  const coverCards = stage === 'bids' && myCards.length > 0 && !revealed[hand.id];
  // Cards sit in a dock at the bottom of the screen, like a hand held at a real table.
  const docked = Boolean(hand) && myCards.length > 0 && !coverCards;

  let status = null;
  if (stage === 'play') {
    const leader = leaderOf(hand);
    if (live.pending || sending) status = { text: <>You played <CardText code={live.pending ?? sending.card} />. Waiting for the book.</> };
    else if (booksPlayed(hand) >= 13) status = { text: 'All 13 books played. Waiting for the score.' };
    else if (leader === mySeat) status = { text: 'You lead this book!', hot: true };
    else status = { text: `${playerName(game, leader)} leads this book. Play when it's your turn.` };
  }

  return (
    <div className={`app remote-mode${docked ? ' docked' : ''}`}>
      <header className="hero">
        <div className="wrap hero-row">
          <div className="brand">
            <span className="brand-mark">♠</span>
            <h1>Spades</h1>
            <span className="mode-chip"><Icon name="phone" size={13} /> Remote</span>
          </div>
          <div className="row">
            {!call.active && (
              <button type="button" className="icon-btn round" aria-label="Video chat with the table" disabled={!room.peer} onClick={call.start}>
                <Icon name="video" />
              </button>
            )}
            <button type="button" className="icon-btn" onClick={() => { if (confirm('Leave this game?')) onLeave(); }}>Leave</button>
          </div>
        </div>
        <div className="wrap">
          {game && (
            <div className="scores">
              {[0, 1].map((t) => (
                <ScoreCard key={t} t={t} team={game.teams[t]} standing={standings(game)[t]} target={game.target}
                  showBags={game.rules.bagsEnabled} isWinner={win === t} compact />
              ))}
            </div>
          )}
          <div className="target">
            <StatusDot on={room.peer} label={room.peer ? 'Connected to the table' : room.status === 'error' ? 'Connection problem' : 'Connecting…'} />
          </div>
        </div>
      </header>

      {pinged && (
        <button type="button" className="ping-banner" onClick={() => setPinged(false)}>
          <Icon name="bell" /> It's your turn!
        </button>
      )}

      <main className="wrap">
        {!game && (
          <div className="card waiting-card">
            <span className="spinner" />
            <h2>Joining game {code}</h2>
            <p className="muted">Make sure the scorekeeper has Spades open with you added as the remote player.</p>
          </div>
        )}
        {game && ended && (
          <div className="card waiting-card">
            <h2>The table stopped remote play</h2>
            <p className="muted">Ask the scorekeeper for a new code if you're still playing.</p>
            <button type="button" className="primary big" onClick={onLeave}>OK</button>
          </div>
        )}

        {game && !ended && (
          <>
            {win != null && <div className="winner"><Icon name="trophy" size={26} /> {game.teams[win].name} wins!</div>}
            <p className="you-are">You're playing as <b>{playerName(game, mySeat)}</b> for {game.teams[teamOf(mySeat)].name}</p>

            {!hand && (
              <div className="card waiting-card">
                <h2>Waiting for the next hand</h2>
                <p className="muted">Your cards will show up here after the deal.</p>
              </div>
            )}

            {stage === 'bids' && (
              <section className="live card">
                <div className="live-head">
                  <div>
                    <div className="eyebrow">Hand {game.hands.indexOf(hand) + 1} · Bidding</div>
                    <LeftOnTable hand={hand} />
                  </div>
                  <span className="chip quiet">{playerName(game, hand.dealer ?? 0)} deals</span>
                </div>
                <div className="bid-list">
                  {SEATS.map((_, s) => {
                    const p = seatEntry(hand, s);
                    return (
                      <div key={s} className={`bid-item t${teamOf(s)}${s === mySeat ? ' me' : ''}`}>
                        <span>{s === mySeat ? 'You' : playerName(game, s)}</span>
                        <b>{isNil(p.call) ? nilLabel(p.call) : p.bid}</b>
                      </div>
                    );
                  })}
                </div>
                <div className="team-bids">
                  {[0, 1].map((t) => <span key={t} className={`team-pill t${t}`}>{game.teams[t].name}: bid {contractBid(hand.teams[t])}</span>)}
                </div>
                <div className="my-bid">
                  <div className="row between">
                    <span className="eyebrow">Your bid</span>
                    {isNil(shownBid.call)
                      ? <span className="nil-tag">{nilLabel(shownBid.call)}</span>
                      : <NumberControl label="Your bid" value={shownBid.bid} onChange={(bid) => sendBid({ bid })} />}
                  </div>
                  <NilPicker label="Your nil" value={shownBid.call} onChange={(c) => sendBid({ call: c })} />
                </div>
              </section>
            )}

            {stage === 'play' && (
              <section className="live card">
                <div className="live-head">
                  <div>
                    <div className="eyebrow">Hand {game.hands.indexOf(hand) + 1} · Playing</div>
                    <div className={`live-title${status?.hot ? ' hot' : ''}`}>{status?.text}</div>
                  </div>
                </div>
                <TableView game={game} hand={hand} remoteSeat={mySeat} mySeat={mySeat} />
              </section>
            )}

            {hand && !docked && (
              <section className="my-cards">
                <div className="section-title row between">
                  <span>Your cards</span>
                  {myCards.length > 0 && <span className="count-pill">{myCards.length} left</span>}
                </div>
                {myCards.length === 0 && !live.cards && (
                  <div className="card empty">The scorekeeper will take a photo of your cards and they'll appear here.</div>
                )}
                {coverCards ? (
                  <button type="button" className="card cover-cards" onClick={() => setRevealed((r) => ({ ...r, [hand.id]: true }))}>
                    <div className="cover-stack"><span /><span /><span /></div>
                    <b>Your {myCards.length} cards are here</b>
                    <span className="muted small">Thinking about blind nil? Bid first. Tap to look at your cards.</span>
                  </button>
                ) : null}
              </section>
            )}

            {game.hands.some((h) => !h.inPlay) && (
              <>
                <div className="section-title">Hands</div>
                <div className="stack">
                  {game.hands.map((h, i) => ({ h, i })).filter(({ h }) => !h.inPlay).reverse().map(({ h, i }) => (
                    <HandRow key={h.id} hand={h} number={i + 1} standing={history(game)[i]} game={game} />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </main>

      {docked ? (
        <div className="hand-dock">
          <div className="dock-head">
            <span>Your cards · {myCards.length} left</span>
            {stage === 'play' && !room.peer && <span>Reconnecting…</span>}
          </div>
          <FannedHand cards={myCards} selected={selected} onSelect={stage === 'play' ? setSelected : undefined} />
          <div className="dock-action">
            {stage !== 'play' ? (
              <p className="dock-hint">Bid above. You'll play from here once the hand starts.</p>
            ) : selected ? (
              <button type="button" className="primary big go" disabled={!canPlay} onClick={play}>
                {canPlay ? <>Play <CardText code={selected} /></> : 'Wait for the book to finish'}
              </button>
            ) : (
              <p className="dock-hint">{live.pending || sending ? 'Waiting for the book to be taken…' : 'Tap a card to choose it.'}</p>
            )}
          </div>
        </div>
      ) : (
        call.error && <div className="bottom-bar"><p className="scan-msg">{call.error}</p></div>
      )}
      {docked && call.error && <p className="scan-msg">{call.error}</p>}

      <VideoCorner call={call} peerName="the table" />
      {win != null && <Confetti />}
      {toast.node}
    </div>
  );
}
