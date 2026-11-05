import { useEffect, useRef, useState } from 'react';
import { useGame, read, write } from './lib/store.js';
import { history, standings, winner, newHand, signed, tableBid, totalBooks, scoreTeam, NIL_CALLS, STANDARD_RULES } from './lib/scoring.js';
import { playerName, stageOf, liveOf, booksPlayed, updateSeat, awardBook, remainingCards, nextDealer, remoteSeats, gameFor, playedBy } from './lib/table.js';
import { cardLabel } from './lib/cards.js';
import { tr, tx, langMsg, tMsg } from './lib/i18n.js';
import { useRoom } from './lib/room.js';
import { useDevice } from './lib/device.js';
import { useCall } from './lib/call.js';
import { useWakeLock, chime, buzz } from './lib/fx.js';
import { recordGame, useStatsSync } from './lib/stats.js';
import { saveGame, savedGames as allSaved, forgetSaved, savedSummary } from './lib/saved.js';
// Spades' home screen lists Spades games only (dominoes saves go on the Dominoes screen)
const savedGames = () => allSaved().filter((e) => e.kind !== 'dominoes');
import Stats from './Stats.jsx';
import { Sheet, RulesFields, NumberField, Icon, useToast, Confetti, StatusDot, CardText } from './components.jsx';
import { BidsPanel, PlayPanel } from './LiveHand.jsx';
import NewGame from './NewGame.jsx';
import Home from './Home.jsx';
import GameHub from './GameHub.jsx';
import DominoesApp from './dominoes/DominoesApp.jsx';
import DominoOnline from './dominoes/DominoOnline.jsx';
import HandSheet from './HandSheet.jsx';
import ScanCards from './ScanCards.jsx';
import Invite from './Invite.jsx';
import { CallBox, SoundNote } from './Video.jsx';
import RemoteApp from './RemoteApp.jsx';
import GuestApp from './GuestApp.jsx';
import TvApp from './TvApp.jsx';
import CardDisplayApp from './CardDisplayApp.jsx';
import JoinAs from './JoinAs.jsx';
import OnlineApp, { LAST_ONLINE_KEY } from './OnlineApp.jsx';
import { makeCode } from './lib/room.js';
import { ScoreCard, HandRow } from './Scoreboard.jsx';

const JOIN_KEY = 'spades-join';

/**
 * Joining someone else's game: { code, as: 'player' | 'guest' | 'tv' | undefined, seat }. Comes from
 * a link (?join=CODE&as=tv or &seat=3) or from typing the code; remembered on this device.
 */
function initialJoin() {
  const q = new URLSearchParams(location.search);
  const code = q.get('join');
  if (code) {
    const seat = q.get('seat');
    const join = {
      code: code.trim().toUpperCase(),
      as: q.get('as') || (seat != null ? 'player' : undefined),
      seat: seat != null ? Number(seat) : null,
    };
    write(JOIN_KEY, join);
    clearJoinParam();
    return join;
  }
  const saved = read(JOIN_KEY);
  return typeof saved === 'string' ? { code: saved } : saved; // older versions saved just the code
}
const clearJoinParam = () => window.history.replaceState(null, '', location.pathname);

// Family Games: which game this device is in ('spades', 'dominoes'), or null for the game picker.
const GAME_PICK_KEY = 'family-game';

export default function App() {
  const [join, setJoin] = useState(initialJoin);
  const [picked, setPicked] = useState(() => read(GAME_PICK_KEY) ?? null);
  const pick = (g) => { write(GAME_PICK_KEY, g); setPicked(g); };
  const [hubStats, setHubStats] = useState(false);
  const update = (next) => { write(JOIN_KEY, next); setJoin(next); };
  const leave = () => update(null);
  if (join?.as === 'player' && join.seat != null) return <RemoteApp code={join.code} seat={join.seat} onLeave={leave} />;
  if (join?.as === 'guest') return <GuestApp code={join.code} onLeave={leave} />;
  if (join?.as === 'tv') return <TvApp code={join.code} onLeave={leave} />;
  if (join?.as === 'card' && join.seat != null) return <CardDisplayApp code={join.code} seat={join.seat} onLeave={leave} />;
  if (join?.as === 'otv') return <OnlineApp code={join.code} tv onLeave={leave} onPlayHere={() => update({ code: join.code, as: 'online' })} />;
  if (join?.as === 'dtv') return <DominoOnline code={join.code} tv onLeave={leave} />;
  if (join?.as === 'dominoes') return <DominoOnline code={join.code} isHost={Boolean(join.host)} onLeave={leave} />;
  if (join?.as === 'online') return <OnlineApp code={join.code} isHost={Boolean(join.host)} onLeave={leave} onUseAsTv={() => update({ code: join.code, as: 'otv' })} />;
  if (join?.code) return <JoinAs code={join.code} onChoose={(as, seat) => update({ code: join.code, as, seat })} onLeave={leave} />;
  if (!picked) {
    return (
      <>
        <GameHub onPick={pick} onStats={() => setHubStats(true)} />
        {hubStats && <Stats onClose={() => setHubStats(false)} />}
      </>
    );
  }
  if (picked === 'dominoes') {
    return <DominoesApp onAllGames={() => pick(null)} onJoin={(code) => update({ code })}
      onPlayOnline={() => update({ code: makeCode(), as: 'dominoes', host: true })}
      onRejoin={(last) => update({ code: last.code, as: 'dominoes', host: last.host })} />;
  }
  return <HostApp onAllGames={() => pick(null)} onJoin={(code) => update({ code })} onPlayOnline={() => update({ code: makeCode(), as: 'online', host: true })}
    onRejoin={(last) => update({ code: last.code, as: 'online', host: last.host })} />;
}

// An online game played on this device in the last day can be rejoined from the home screen.
const REJOIN_WINDOW_MS = 24 * 60 * 60 * 1000;
function lastOnlineGame() {
  const last = read(LAST_ONLINE_KEY);
  return last?.code && Date.now() - last.at < REJOIN_WINDOW_MS ? last : null;
}

function HostApp({ onJoin, onPlayOnline, onRejoin, onAllGames }) {
  const [lastOnline, setLastOnline] = useState(lastOnlineGame);
  const [saved, setSaved] = useState(savedGames);
  // Pick a saved game back up: an online game is hosted again under its code; a table game opens here.
  const resume = (entry) => {
    forgetSaved(entry.id);
    setSaved(savedGames());
    if (entry.kind === 'online') onRejoin({ code: entry.code, host: true });
    else store.resume(entry.game);
  };
  const store = useGame();
  const [newGameOpen, setNewGameOpen] = useState(false);
  const [setup, setSetup] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const toast = useToast();
  // A game started or closed: next time it's the home screen (with the saved games list up to date).
  useEffect(() => { setSetup(false); if (!store.game) setSaved(savedGames()); }, [Boolean(store.game)]);

  if (!store.game) {
    return (
      <>
        {setup
          ? <NewGame lastSetup={store.lastSetup} onStart={store.start} onBack={() => setSetup(false)} />
          : <Home onAllGames={onAllGames} onPlayOnline={onPlayOnline} onTable={() => setSetup(true)} onJoin={onJoin} onStats={() => setStatsOpen(true)}
              rejoin={lastOnline && !saved.some((e) => e.code === lastOnline.code) ? lastOnline : null}
              onRejoin={() => onRejoin(lastOnline)} onForget={() => { write(LAST_ONLINE_KEY, null); setLastOnline(null); }}
              saved={saved} onResume={resume}
              onForgetSaved={(e) => { if (confirm(tr('Delete this saved game?'))) { forgetSaved(e.id); if (e.kind === 'online') write(`spades-online-table-${e.code}`, null); setSaved(savedGames()); } }} />}
        {statsOpen && <Stats onClose={() => setStatsOpen(false)} />}
        {toast.node}
      </>
    );
  }
  return (
    <>
      <GameScreen store={store} toast={toast} onJoin={onJoin} onPlayOnline={onPlayOnline} onNewGame={() => setNewGameOpen(true)} />
      {newGameOpen && (
        <NewGame asSheet lastSetup={store.lastSetup}
          onStart={(g) => { store.start(g); setNewGameOpen(false); toast.show(tr('New game started'), { onUndo: store.undo }); }}
          onCancel={() => setNewGameOpen(false)} />
      )}
    </>
  );
}

function GameScreen({ store, toast, onNewGame, onJoin, onPlayOnline }) {
  const { game } = store;
  const [editing, setEditing] = useState(null);
  const [sheet, setSheet] = useState(null); // 'menu' | 'rules' | 'invite' | 'scan'
  const [party, setParty] = useState(false);

  const hist = history(game);
  const stand = standings(game);
  const win = winner(game);
  const inPlay = game.hands.find((h) => h.inPlay);
  const inPlayNumber = inPlay ? game.hands.indexOf(inPlay) + 1 : 0;
  const stage = inPlay ? stageOf(inPlay) : null;

  // ----- Remote players, video guests and TV screens -----
  const remote = game.remote ?? null;
  const seats = remoteSeats(game);
  const gameRef = useRef(game);
  gameRef.current = game;
  const [me, setMe] = useDevice(remote?.code, { role: 'host', name: 'Table' });
  const room = useRoom(remote?.code, me, onRoomMessage);
  // The table's phone points its rear camera at the table: that's the big picture on everyone's TV.
  const call = useCall({ room, me, setMe, facing: 'environment' });
  const statsSync = useStatsSync(room);
  const players = room.peers.filter((p) => p.role === 'player');
  const online = (seat) => players.some((p) => p.seat === seat);

  const sendState = (g, to) => {
    const targets = to ? [to] : room.peers;
    for (const p of targets) room.send({ type: 'state', game: gameFor(g, p.role === 'player' ? p.seat : null) }, p.id);
  };

  function onRoomMessage(m, from) {
    const g = gameRef.current;
    if (!g?.remote) return;
    if (statsSync(m, from)) return;
    if (m.type === 'hello') { if (from) sendState(g, from); return; }
    if (m.type === 'rtc') { call.handle(m); return; }
    // Bids and plays only count from a remote player's phone, for their own seat.
    const seat = from?.role === 'player' ? from.seat : null;
    if (seat == null || !remoteSeats(g).includes(seat)) return;
    const name = playerName(g, seat);
    const hand = g.hands.find((h) => h.id === m.handId);
    if (m.type === 'bid' && hand && stageOf(hand) === 'bids') {
      const bid = Math.max(0, Math.min(13, Math.trunc(Number(m.bid)) || 0));
      const nil = NIL_CALLS.some((c) => c.id === m.call) ? m.call : 'none';
      store.updateHand(hand.id, langMsg("{name}'s bid", { name }), (h) => updateSeat(h, seat, { bid, call: nil }));
    } else if (m.type === 'play' && hand && stageOf(hand) === 'play') {
      const live = liveOf(hand);
      if (live.played[seat] || live.tricks.length !== m.book || !remainingCards(hand, seat)?.includes(m.card)) return;
      store.updateHand(hand.id, langMsg('{name} played {card}', { name, card: cardLabel(m.card) }),
        (h) => ({ ...h, live: { ...liveOf(h), played: { ...liveOf(h).played, [seat]: m.card } } }));
      chime(true);
      buzz([80, 60, 80]);
      toast.show(tx('{name} played {card}', { name, card: <CardText code={m.card} /> }), { onUndo: store.undo, ms: 6000 });
    }
  }

  // Keep every connected screen up to date.
  const peerKey = room.peers.map((p) => `${p.id}:${p.role}:${p.seat}`).join(',');
  useEffect(() => { sendState(game); }, [game, peerKey]);

  useWakeLock(true);

  // Keep this game in the stats log as it goes (finished once someone wins).
  const scoredHands = game.hands.filter((h) => !h.inPlay).length;
  useEffect(() => { recordGame(game, { mode: 'table' }); }, [scoredHands, win, game.id]);

  useEffect(() => {
    if (win == null) return undefined;
    setParty(true);
    const t = setTimeout(() => setParty(false), 4500);
    return () => clearTimeout(t);
  }, [win]);

  // ----- Actions -----
  const change = (label, fn) => store.updateHand(inPlay.id, label, fn);
  const undo = () => {
    const label = store.undoLabel;
    store.undo();
    toast.show(tr('Undid: {what}', { what: tMsg(label) }));
  };
  const award = (s) => {
    const n = booksPlayed(inPlay) + 1;
    change(langMsg('Book {n}', { n }), (h) => awardBook(h, s));
    buzz(30);
    toast.show(tr('Book {n} → {name}', { n, name: playerName(game, s) }), { onUndo: store.undo });
  };
  const newHandNow = () => store.addHand(newHand(nextDealer(game)));
  const startPlay = () => {
    if (tableBid(inPlay) === 0 && !confirm(tr('Nobody has bid yet. Start playing anyway?'))) return;
    change('Start playing', (h) => ({ ...h, stage: 'play' }));
  };
  const scoreHand = () => {
    const played = booksPlayed(inPlay);
    const books = inPlay.teams.reduce((n, t) => n + totalBooks(t), 0);
    if (played < 13 && books !== 13 && !confirm(tr('Only {n} of 13 books are counted. Score the hand anyway?', { n: books }))) return;
    change('Score hand', (h) => ({ ...h, inPlay: false, stage: 'done', live: { ...liveOf(h), played: {} } }));
    const pts = [0, 1].map((t) => `${game.teams[t].name} ${signed(scoreTeam(inPlay.teams[t], game.rules).total)}`).join(' · ');
    toast.show(tr('Scored: {pts}', { pts }), { onUndo: store.undo, ms: 5000 });
  };
  const ping = (seat) => {
    for (const p of players.filter((x) => x.seat === seat)) room.send({ type: 'ping' }, p.id);
    toast.show(tr("Told {name} it's their turn", { name: playerName(game, seat) }));
  };
  const [scanSeat, setScanSeat] = useState(null);
  const openScan = (seat) => { setScanSeat(seat); setSheet('scan'); };
  const guests = room.peers.filter((p) => p.role === 'guest');
  const tvs = room.peers.filter((p) => p.role === 'tv');
  const cardShows = room.peers.filter((p) => p.role === 'card');

  const numbered = game.hands.map((h, i) => ({ hand: h, number: i + 1, standing: hist[i] })).reverse();

  return (
    <div className="app">
      <header className="hero">
        <div className="wrap hero-row">
          <div className="brand"><span className="brand-mark">♠</span><h1>Family Spades</h1></div>
          <div className="row">
            <button type="button" className="icon-btn" aria-label={store.undoLabel ? tr('Undo {what}', { what: tMsg(store.undoLabel) }) : tr('Nothing to undo')}
              disabled={!store.undoLabel} onClick={undo}>
              <Icon name="undo" /> <span className="icon-label">{tr('Undo')}</span>
            </button>
            <button type="button" className="icon-btn round" aria-label={tr('Menu')} onClick={() => setSheet('menu')}><Icon name="more" /></button>
          </div>
        </div>
        <div className="wrap">
          <div className="scores">
            {[0, 1].map((t) => (
              <ScoreCard key={t} t={t} team={game.teams[t]} standing={stand[t]} target={game.target}
                showBags={game.rules.bagsEnabled} bagLimit={game.rules.bagsLimit} isWinner={win === t} />
            ))}
          </div>
          <p className="target">{tr('Playing to {n}', { n: game.target })}</p>
        </div>
      </header>

      <main className="wrap">
        {win != null && (
          <div className="winner"><Icon name="trophy" size={26} /> {tr('{name} wins!', { name: game.teams[win].name })}</div>
        )}

        {remote && (
          <div className="remote-bar card">
            <div className="remote-who">
              <Icon name="users" size={18} />
              <div className="who-list">
                {seats.map((s) => <StatusDot key={s} on={online(s)} label={playerName(game, s)} />)}
                {guests.length > 0 && <StatusDot on label={tr('{n} on video', { n: guests.length })} />}
                {tvs.length > 0 && <StatusDot on label={tvs.length > 1 ? tr('{n} TVs', { n: tvs.length }) : tr('{n} TV', { n: tvs.length })} />}
                {cardShows.length > 0 && <StatusDot on label={cardShows.length > 1 ? tr('{n} card displays', { n: cardShows.length }) : tr('{n} card display', { n: cardShows.length })} />}
                {!seats.length && !guests.length && !tvs.length && <span className="muted small">{tr('Nobody has joined yet')}</span>}
                {room.status === 'error' && <span className="neg small">{tr('Connection problem')}</span>}
              </div>
            </div>
            <div className="row">
              {!call.joined && <button type="button" className="soft" onClick={call.join}><Icon name="video" size={18} /> {tr('Table camera')}</button>}
              <button type="button" className="soft" onClick={() => setSheet('invite')}>{tr('Invite')}</button>
            </div>
            {call.joined && <p className="hint">{tr('Point this phone’s back camera at the table: it’s the big picture on everyone’s TV.')}</p>}
            <SoundNote call={call} />
          </div>
        )}
        {call.error && <p className="scan-msg">{call.error}</p>}

        {inPlay && stage === 'bids' && (
          <>
            <BidsPanel game={game} hand={inPlay} number={inPlayNumber} onChange={change}
              remoteSeats={seats} online={online} />
            {seats.map((s) => {
              const cards = liveOf(inPlay).hands[s];
              const name = playerName(game, s);
              return (
                <div key={s} className="remote-strip standalone card">
                  <span>{cards ? tr("{name}'s {n} cards are on their phone.", { name, n: cards.length }) : tr("Deal, then scan {name}'s cards.", { name })}</span>
                  <button type="button" className="soft" onClick={() => openScan(s)}>
                    <Icon name="camera" size={18} /> {cards ? tr('Rescan') : tr('Scan cards')}
                  </button>
                </div>
              );
            })}
          </>
        )}
        {inPlay && stage === 'play' && (
          <PlayPanel game={game} hand={inPlay} number={inPlayNumber} onAward={award}
            remoteSeats={seats} online={online} onPing={ping} onScan={openScan} />
        )}
        {inPlay && (
          <button type="button" className="text-btn" onClick={() => setEditing(inPlay)}>
            <Icon name="edit" size={16} /> {tr('Fix bids or books by hand')}
          </button>
        )}

        {game.hands.some((h) => !h.inPlay) && <div className="section-title">{tr('Hands')}</div>}
        {!game.hands.length && (
          <>
            <div className="section-title">{tr('No hands yet')}</div>
            <p className="empty">{tx("Tap {button} after the deal. Enter everyone's bids, then tap who wins each book.", { button: <b>{tr('New Hand')}</b> })}</p>
          </>
        )}
        <div className="stack">
          {numbered.filter((x) => !x.hand.inPlay).map(({ hand, number, standing }) => (
            <HandRow key={hand.id} hand={hand} number={number} standing={standing} game={game}
              onOpen={() => setEditing(hand)} />
          ))}
        </div>
      </main>

      <div className="bottom-bar">
        {!inPlay && <button type="button" className="primary big" onClick={newHandNow}>+ {tr('New Hand')}</button>}
        {stage === 'bids' && <button type="button" className="primary big" onClick={startPlay}>{tr('Bids are in · Start playing')}</button>}
        {stage === 'play' && (
          <button type="button" className={`primary big${booksPlayed(inPlay) >= 13 ? ' go' : ''}`} onClick={scoreHand}>
            ✓ {tr('Score Hand')}
          </button>
        )}
      </div>

      {editing && (
        <HandSheet game={game} hand={editing}
          onSave={(h) => { store.saveHand(h); setEditing(null); toast.show(tr('Hand saved'), { onUndo: store.undo }); }}
          onDelete={() => { store.deleteHand(editing.id); setEditing(null); toast.show(tr('Hand deleted'), { onUndo: store.undo }); }}
          onClose={() => setEditing(null)} />
      )}
      {sheet === 'menu' && (
        <Sheet title={tr('Menu')} onClose={() => setSheet(null)} closeLabel={tr('Close')} short>
          <div className="menu-list card group">
            <button type="button" onClick={() => setSheet('invite')}><Icon name="users" /> {tr('Remote players, video & TV')}</button>
            <button type="button" onClick={() => { setSheet(null); onPlayOnline(); }}><Icon name="cards" /> {tr('Play Online')}</button>
            <button type="button" onClick={() => setSheet('stats')}><Icon name="trophy" /> {tr('Stats & records')}</button>
            <button type="button" onClick={() => setSheet('rules')}><Icon name="edit" /> {tr('Scoring rules')}</button>
            <button type="button" onClick={() => { setSheet(null); if (confirm(tr('Start a new game? You can undo this.'))) onNewGame(); }}>
              <Icon name="flip" /> {tr('New game')}
            </button>
            <button type="button" onClick={() => {
              const code = prompt(tr("Joining someone else's game? Type the 4-letter code they sent you."));
              const clean = code?.toUpperCase().replace(/[^A-Z]/g, '');
              if (clean?.length === 4) onJoin(clean);
            }}>
              <Icon name="phone" /> {tr("Join someone else's game")}
            </button>
            <button type="button" onClick={() => {
              setSheet(null);
              saveGame({ id: `table-${game.id ?? Date.now()}`, kind: 'table', game, ...savedSummary(game) });
              store.end();
              toast.show(tr('Saved for later: it’s on the home screen'));
            }}>
              <Icon name="home" /> {tr('Save for later')}
            </button>
            <button type="button" onClick={() => {
              if (!confirm(tr('Close this game and go back to the home screen? Finished hands stay in your stats.'))) return;
              setSheet(null);
              store.end();
              toast.show(tr('Game closed'), { onUndo: store.undo });
            }}>
              <Icon name="home" /> {tr('Close game & go home')}
            </button>
            <a href="https://github.com/nforbes35/spades-score" target="_blank" rel="noreferrer">
              <Icon name="share" /> {tr('Source code & licenses')}
            </a>
          </div>
        </Sheet>
      )}
      {sheet === 'stats' && <Stats onClose={() => setSheet(null)} />}
      {sheet === 'rules' && (
        <RulesSheet game={game} onSave={(r, t) => { store.updateSettings(r, t); setSheet(null); }} onClose={() => setSheet(null)} />
      )}
      {sheet === 'invite' && (
        <Invite game={game} peers={room.peers} onClose={() => setSheet(null)}
          onSet={(r) => { if (!r) room.send({ type: 'ended' }); store.setRemote(r); }} />
      )}
      {sheet === 'scan' && inPlay && scanSeat != null && (
        <ScanCards name={playerName(game, scanSeat)} initial={liveOf(inPlay).hands[scanSeat]}
          played={playedBy(inPlay, scanSeat)}
          onClose={() => setSheet(null)}
          onSend={(cards) => {
            const name = playerName(game, scanSeat);
            change(langMsg("Scanned {name}'s cards", { name }), (h) => ({ ...h, live: { ...liveOf(h), hands: { ...liveOf(h).hands, [scanSeat]: cards } } }));
            setSheet(null);
            toast.show(online(scanSeat) ? tr('Sent {n} cards to {name}', { n: cards.length, name }) : tr('Saved. {name} sees them when they join.', { name }));
          }} />
      )}

      {remote && <CallBox call={call} videos={call.videos} emptyText={tr('Waiting for others to turn on video…')} />}
      {party && <Confetti />}
      {toast.node}
    </div>
  );
}

function RulesSheet({ game, onSave, onClose }) {
  const [rules, setRules] = useState({ ...STANDARD_RULES, ...game.rules });
  const [target, setTarget] = useState(game.target);
  return (
    <Sheet title={tr('Scoring Rules')} onClose={onClose} action={{ label: tr('Save'), onClick: () => onSave(rules, Math.max(1, target)) }}>
      <div className="section-title">{tr('Final score')}</div>
      <div className="card group"><NumberField label={tr('Play to')} value={target} onChange={setTarget} width={100} /></div>
      <RulesFields rules={rules} onChange={setRules} />
    </Sheet>
  );
}
