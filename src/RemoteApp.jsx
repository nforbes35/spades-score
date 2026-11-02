import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { read, write } from './lib/store.js';
import { history, standings, winner, contractBid, isNil, nilLabel } from './lib/scoring.js';
import { SEATS, teamOf, playerName, seatEntry, stageOf, liveOf, leaderOf, remainingCards, booksPlayed, remoteSeats } from './lib/table.js';
import { sortHand } from './lib/cards.js';
import { useRoom, joinLink } from './lib/room.js';
import { useDevice } from './lib/device.js';
import { useCall } from './lib/call.js';
import { useWakeLock, chime, buzz } from './lib/fx.js';
import { recordGame, useStatsSync } from './lib/stats.js';
import { NumberControl, NilPicker, FannedHand, Icon, useToast, StatusDot, Confetti, CardText, Sheet } from './components.jsx';
import { LeftOnTable, TableView } from './LiveHand.jsx';
import { ScoreCard, HandRow } from './Scoreboard.jsx';
import { CallBox, CallButtons, SoundNote } from './Video.jsx';

const STATE_KEY = 'spades-remote-state';
const SEND_TIMEOUT_MS = 6000;

/** Remote mode: a player who isn't at the table. Sees their cards, bids and books live. */
export default function RemoteApp({ code, seat: mySeat, onLeave }) {
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
  const [tvHelp, setTvHelp] = useState(false);
  const toast = useToast();

  const [device, setDevice] = useDevice(code, { role: 'player', name: game ? playerName(game, mySeat) : '', seat: mySeat });
  const room = useRoom(code, device, (m, from) => {
    if (statsSync(m, from)) return;
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
  const call = useCall({ room, me: device, setMe: setDevice, facing: 'user' });
  const statsSync = useStatsSync(room);
  const host = room.peers.find((p) => p.role === 'host');
  const connected = Boolean(host);
  // A TV view at this player's home shows the video, so the phone keeps to the cards.
  const tvHere = room.peers.some((p) => p.role === 'tv' && p.place && p.place === device.place);

  useEffect(() => { if (connected) room.send({ type: 'hello' }); }, [connected, room.send]);
  useWakeLock(true);
  const scoredHands = game ? game.hands.filter((h) => !h.inPlay).length : 0;
  useEffect(() => { if (game) recordGame(game, { mode: 'table' }); }, [scoredHands, game?.id]);

  const hand = game?.hands.find((h) => h.inPlay) ?? null;
  const stage = hand ? stageOf(hand) : null;
  const me = hand && mySeat != null ? seatEntry(hand, mySeat) : null;
  const live = hand ? liveOf(hand) : null;
  const myCards = hand ? sortHand(remainingCards(hand, mySeat) ?? []) : [];
  const myPlayed = live?.played[mySeat] ?? null;
  const notMySeat = game && !remoteSeats(game).includes(mySeat);

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
    if (sending && myPlayed === sending.card) setSending(null);
  }, [myPlayed]);
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
  const play = (card = selected) => {
    if (!card) return;
    room.send({ type: 'play', handId: hand.id, book: live.tricks.length, card });
    setSelected(null);
    setSending({ card });
    buzz(40);
  };

  const canPlay = stage === 'play' && !myPlayed && !sending && connected && booksPlayed(hand) < 13;
  const coverCards = stage === 'bids' && myCards.length > 0 && !revealed[hand.id];
  // Cards sit in a dock at the bottom of the screen, like a hand held at a real table.
  const docked = Boolean(hand) && myCards.length > 0 && !coverCards;

  let status = null;
  if (stage === 'play') {
    const leader = leaderOf(hand);
    if (myPlayed || sending) status = { text: <>You played <CardText code={myPlayed ?? sending.card} />. Waiting for the book.</> };
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
            <button type="button" className="icon-btn round" aria-label="Watch on your TV" onClick={() => setTvHelp(true)}>
              <Icon name="tv" />
            </button>
            {!call.joined && (
              <button type="button" className="icon-btn round" aria-label="Video chat with the table" disabled={!connected} onClick={call.join}>
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
            <StatusDot on={connected} label={connected ? 'Connected to the table' : room.status === 'error' ? 'Connection problem' : 'Connecting…'} />
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
            {notMySeat && (
              <div className="scan-msg">The table hasn't set {playerName(game, mySeat)} as a remote player. Ask the scorekeeper to add you in Invite.</div>
            )}
            {call.joined && tvHere && (
              <div className="card tv-bar">
                <span><Icon name="tv" size={18} /> Video is on your TV</span>
                <CallButtons call={call} showFlip={false} size={18} />
              </div>
            )}
            {call.joined && <SoundNote call={call} />}

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
            {stage === 'play' && !connected && <span>Reconnecting…</span>}
          </div>
          <FannedHand cards={myCards} selected={selected} onSelect={stage === 'play' ? setSelected : undefined} dealKey={hand.id}
            onPlay={canPlay ? (c) => play(c) : undefined} />
          <div className="dock-action">
            {stage !== 'play' ? (
              <p className="dock-hint">Bid above. You'll play from here once the hand starts.</p>
            ) : selected ? (
              <button type="button" className="primary big go" disabled={!canPlay} onClick={() => play()}>
                {canPlay ? <>Play <CardText code={selected} /></> : 'Wait for the book to finish'}
              </button>
            ) : (
              <p className="dock-hint">{myPlayed || sending ? 'Waiting for the book to be taken…' : 'Swipe a card up to play it, or tap it.'}</p>
            )}
          </div>
        </div>
      ) : (
        call.error && <div className="bottom-bar"><p className="scan-msg">{call.error}</p></div>
      )}
      {docked && call.error && <p className="scan-msg">{call.error}</p>}

      {call.joined && !tvHere && (
        <CallBox call={call} emptyText="Waiting for the table’s camera…"
          videos={[...call.videos].sort((a, b) => (a.peer.role === 'host' ? -1 : b.peer.role === 'host' ? 1 : 0))} />
      )}
      {tvHelp && <TvHelp code={code} tvHere={tvHere} onClose={() => setTvHelp(false)} />}
      {win != null && <Confetti />}
      {toast.node}
    </div>
  );
}

/** How to put the table and everyone's faces on a TV: open the TV view on a second device. */
function TvHelp({ code, tvHere, onClose }) {
  const link = joinLink(code, { as: 'tv' });
  const [qr, setQr] = useState(null);
  useEffect(() => { QRCode.toDataURL(link, { margin: 1, width: 300 }).then(setQr).catch(() => {}); }, [link]);
  return (
    <Sheet title="Watch on your TV" onClose={onClose} closeLabel="Done">
      {tvHere && <div className="scan-msg ok">A TV view is connected at your place. Video shows there; this phone keeps your cards.</div>}
      <p className="lead-text">
        Put the table and everyone’s faces on your TV while this phone keeps your cards. Open the TV view on
        something connected to the TV:
      </p>
      <ul className="tv-ways">
        <li><b>A smart TV’s web browser</b>: go to the address below.</li>
        <li><b>A laptop</b> plugged into the TV with an HDMI cable.</li>
        <li><b>An iPad or Mac</b> with an Apple TV: open the TV view, then AirPlay <i>Screen Mirroring</i> to the TV.</li>
      </ul>
      <div className="invite-card card">
        <div className="eyebrow">TV view address</div>
        <div className="tv-link">{link.replace(/^https?:\/\//, '')}</div>
        {qr && <img className="qr" src={qr} alt="QR code for the TV view" />}
        <p className="footnote center">Or open Spades on that device, tap <b>Join a game</b>, type <b>{code}</b> and choose <b>TV view</b>.</p>
      </div>
      <p className="footnote">An iPhone can’t send a separate picture to the TV, only mirror itself, which is why the TV view goes on a second device. Sound stays on this phone so there’s no echo.</p>
    </Sheet>
  );
}
