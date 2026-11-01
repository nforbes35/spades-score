import { useEffect, useRef, useState } from 'react';
import { useGame, read, write } from './lib/store.js';
import { history, standings, winner, newHand, signed, tableBid, totalBooks, scoreTeam, NIL_CALLS, STANDARD_RULES } from './lib/scoring.js';
import { playerName, stageOf, liveOf, booksPlayed, updateSeat, awardBook, remainingCards, nextDealer } from './lib/table.js';
import { cardLabel } from './lib/cards.js';
import { useRoom } from './lib/room.js';
import { useVideoCall } from './lib/video.js';
import { useWakeLock, chime, buzz } from './lib/fx.js';
import { Sheet, RulesFields, NumberField, Icon, useToast, Confetti, StatusDot } from './components.jsx';
import { BidsPanel, PlayPanel } from './LiveHand.jsx';
import NewGame from './NewGame.jsx';
import HandSheet from './HandSheet.jsx';
import ScanCards from './ScanCards.jsx';
import Invite from './Invite.jsx';
import VideoCorner from './VideoCorner.jsx';
import RemoteApp from './RemoteApp.jsx';
import { ScoreCard, HandRow } from './Scoreboard.jsx';

const JOIN_KEY = 'spades-join';

function initialJoin() {
  const fromLink = new URLSearchParams(location.search).get('join');
  if (fromLink) {
    const code = fromLink.trim().toUpperCase();
    write(JOIN_KEY, code);
    clearJoinParam();
    return code;
  }
  return read(JOIN_KEY);
}
const clearJoinParam = () => window.history.replaceState(null, '', location.pathname);

export default function App() {
  const [joinCode, setJoinCode] = useState(initialJoin);
  if (joinCode) {
    return <RemoteApp code={joinCode} onLeave={() => { write(JOIN_KEY, null); setJoinCode(null); }} />;
  }
  return <HostApp onJoin={(code) => { write(JOIN_KEY, code); setJoinCode(code); }} />;
}

function HostApp({ onJoin }) {
  const store = useGame();
  const [newGameOpen, setNewGameOpen] = useState(false);
  const toast = useToast();

  if (!store.game) {
    return (
      <>
        <NewGame lastSetup={store.lastSetup} onStart={store.start} onJoin={onJoin} />
        {toast.node}
      </>
    );
  }
  return (
    <>
      <GameScreen store={store} toast={toast} onJoin={onJoin} onNewGame={() => setNewGameOpen(true)} />
      {newGameOpen && (
        <NewGame asSheet lastSetup={store.lastSetup}
          onStart={(g) => { store.start(g); setNewGameOpen(false); toast.show('New game started', { onUndo: store.undo }); }}
          onCancel={() => setNewGameOpen(false)} />
      )}
    </>
  );
}

function GameScreen({ store, toast, onNewGame, onJoin }) {
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

  // ----- Remote player link -----
  const remote = game.remote ?? null;
  const remoteName = remote ? playerName(game, remote.seat) : '';
  const gameRef = useRef(game);
  gameRef.current = game;
  const room = useRoom(remote?.code, 'host', onRemoteMessage);
  const call = useVideoCall(room.send, false);

  function onRemoteMessage(m) {
    const g = gameRef.current;
    if (!g?.remote) return;
    const seat = g.remote.seat;
    const name = playerName(g, seat);
    const hand = g.hands.find((h) => h.id === m.handId);
    if (m.type === 'hello') room.send({ type: 'state', game: g });
    else if (m.type === 'rtc') call.handle(m);
    else if (m.type === 'bid' && hand && stageOf(hand) === 'bids') {
      const bid = Math.max(0, Math.min(13, Math.trunc(Number(m.bid)) || 0));
      const nil = NIL_CALLS.some((c) => c.id === m.call) ? m.call : 'none';
      store.updateHand(hand.id, `${name}'s bid`, (h) => updateSeat(h, seat, { bid, call: nil }));
    } else if (m.type === 'play' && hand && stageOf(hand) === 'play') {
      const live = liveOf(hand);
      if (live.pending || live.tricks.length !== m.book || !remainingCards(hand)?.includes(m.card)) return;
      store.updateHand(hand.id, `${name} played ${cardLabel(m.card)}`, (h) => ({ ...h, live: { ...liveOf(h), pending: m.card } }));
      chime(true);
      buzz([80, 60, 80]);
      toast.show(`${name} played ${cardLabel(m.card)}`, { onUndo: store.undo, ms: 6000 });
    }
  }

  // Keep the remote player's screen up to date.
  useEffect(() => {
    if (room.peer) room.send({ type: 'state', game });
  }, [game, room.peer, room.send]);

  useWakeLock(true);

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
    toast.show(`Undid: ${label}`);
  };
  const award = (s) => {
    const n = booksPlayed(inPlay) + 1;
    change(`Book ${n}`, (h) => awardBook(h, s));
    buzz(30);
    toast.show(`Book ${n} → ${playerName(game, s)}`, { onUndo: store.undo });
  };
  const newHandNow = () => store.addHand(newHand(nextDealer(game)));
  const startPlay = () => {
    if (tableBid(inPlay) === 0 && !confirm('Nobody has bid yet. Start playing anyway?')) return;
    change('Start playing', (h) => ({ ...h, stage: 'play' }));
  };
  const scoreHand = () => {
    const played = booksPlayed(inPlay);
    const books = inPlay.teams.reduce((n, t) => n + totalBooks(t), 0);
    if (played < 13 && books !== 13 && !confirm(`Only ${books} of 13 books are counted. Score the hand anyway?`)) return;
    change('Score hand', (h) => ({ ...h, inPlay: false, stage: 'done', live: { ...liveOf(h), pending: null } }));
    const pts = [0, 1].map((t) => `${game.teams[t].name} ${signed(scoreTeam(inPlay.teams[t], game.rules).total)}`).join(' · ');
    toast.show(`Scored: ${pts}`, { onUndo: store.undo, ms: 5000 });
  };
  const ping = () => {
    room.send({ type: 'ping' });
    toast.show(`Told ${remoteName} it's their turn`);
  };

  const numbered = game.hands.map((h, i) => ({ hand: h, number: i + 1, standing: hist[i] })).reverse();

  return (
    <div className="app">
      <header className="hero">
        <div className="wrap hero-row">
          <div className="brand"><span className="brand-mark">♠</span><h1>Spades</h1></div>
          <div className="row">
            <button type="button" className="icon-btn" aria-label={store.undoLabel ? `Undo ${store.undoLabel}` : 'Nothing to undo'}
              disabled={!store.undoLabel} onClick={undo}>
              <Icon name="undo" /> <span className="icon-label">Undo</span>
            </button>
            <button type="button" className="icon-btn round" aria-label="Menu" onClick={() => setSheet('menu')}><Icon name="more" /></button>
          </div>
        </div>
        <div className="wrap">
          <div className="scores">
            {[0, 1].map((t) => (
              <ScoreCard key={t} t={t} team={game.teams[t]} standing={stand[t]} target={game.target}
                showBags={game.rules.bagsEnabled} isWinner={win === t} />
            ))}
          </div>
          <p className="target">Playing to {game.target}</p>
        </div>
      </header>

      <main className="wrap">
        {win != null && (
          <div className="winner"><Icon name="trophy" size={26} /> {game.teams[win].name} wins!</div>
        )}

        {remote && (
          <div className="remote-bar card">
            <div className="remote-who">
              <Icon name="phone" size={18} />
              <div>
                <b>{remoteName}</b> is playing remotely
                <StatusDot on={room.peer} label={room.peer ? 'connected' : room.status === 'error' ? 'connection problem' : 'waiting to join'} />
              </div>
            </div>
            <div className="row">
              {!call.active && <button type="button" className="soft" disabled={!room.peer} onClick={call.start}><Icon name="video" size={18} /> Video</button>}
              <button type="button" className="soft" onClick={() => setSheet('invite')}>Invite</button>
            </div>
          </div>
        )}
        {call.error && <p className="scan-msg">{call.error}</p>}

        {inPlay && stage === 'bids' && (
          <>
            <BidsPanel game={game} hand={inPlay} number={inPlayNumber} onChange={change}
              remoteSeat={remote?.seat} remoteName={remoteName} peer={room.peer} />
            {remote && (
              <div className="remote-strip standalone card">
                <span>{liveOf(inPlay).cards ? `${remoteName}'s ${liveOf(inPlay).cards.length} cards are on their phone.` : `Deal, then scan ${remoteName}'s cards.`}</span>
                <button type="button" className="soft" onClick={() => setSheet('scan')}>
                  <Icon name="camera" size={18} /> {liveOf(inPlay).cards ? 'Rescan' : 'Scan cards'}
                </button>
              </div>
            )}
          </>
        )}
        {inPlay && stage === 'play' && (
          <PlayPanel game={game} hand={inPlay} number={inPlayNumber} onAward={award}
            remoteSeat={remote?.seat} peer={room.peer} onPing={ping} onScan={() => setSheet('scan')} />
        )}
        {inPlay && (
          <button type="button" className="text-btn" onClick={() => setEditing(inPlay)}>
            <Icon name="edit" size={16} /> Fix bids or books by hand
          </button>
        )}

        {game.hands.some((h) => !h.inPlay) && <div className="section-title">Hands</div>}
        {!game.hands.length && (
          <>
            <div className="section-title">No hands yet</div>
            <p className="empty">Tap <b>New Hand</b> after the deal. Enter everyone's bids, then tap who wins each book.</p>
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
        {!inPlay && <button type="button" className="primary big" onClick={newHandNow}>+ New Hand</button>}
        {stage === 'bids' && <button type="button" className="primary big" onClick={startPlay}>Bids are in · Start playing</button>}
        {stage === 'play' && (
          <button type="button" className={`primary big${booksPlayed(inPlay) >= 13 ? ' go' : ''}`} onClick={scoreHand}>
            ✓ Score Hand
          </button>
        )}
      </div>

      {editing && (
        <HandSheet game={game} hand={editing}
          onSave={(h) => { store.saveHand(h); setEditing(null); toast.show('Hand saved', { onUndo: store.undo }); }}
          onDelete={() => { store.deleteHand(editing.id); setEditing(null); toast.show('Hand deleted', { onUndo: store.undo }); }}
          onClose={() => setEditing(null)} />
      )}
      {sheet === 'menu' && (
        <Sheet title="Menu" onClose={() => setSheet(null)} closeLabel="Close">
          <div className="menu-list card group">
            <button type="button" onClick={() => setSheet('invite')}><Icon name="phone" /> {remote ? 'Remote player' : 'Add a remote player'}</button>
            <button type="button" onClick={() => setSheet('rules')}><Icon name="edit" /> Scoring rules</button>
            <button type="button" onClick={() => { setSheet(null); if (confirm('Start a new game? You can undo this.')) onNewGame(); }}>
              <Icon name="flip" /> New game
            </button>
            <button type="button" onClick={() => {
              const code = prompt('Joining someone else\'s game? Type the 4-letter code they sent you.');
              const clean = code?.toUpperCase().replace(/[^A-Z]/g, '');
              if (clean?.length === 4) onJoin(clean);
            }}>
              <Icon name="phone" /> Join someone else's game
            </button>
            <a href="https://github.com/nforbes35/spades-score" target="_blank" rel="noreferrer">
              <Icon name="share" /> Source code &amp; licenses
            </a>
          </div>
        </Sheet>
      )}
      {sheet === 'rules' && (
        <RulesSheet game={game} onSave={(r, t) => { store.updateSettings(r, t); setSheet(null); }} onClose={() => setSheet(null)} />
      )}
      {sheet === 'invite' && (
        <Invite game={game} peer={room.peer} onClose={() => setSheet(null)}
          onSet={(r) => { if (!r) room.send({ type: 'ended' }); store.setRemote(r); }} />
      )}
      {sheet === 'scan' && inPlay && remote && (
        <ScanCards name={remoteName} initial={liveOf(inPlay).cards}
          played={liveOf(inPlay).tricks.map((t) => t.card).filter(Boolean)}
          onClose={() => setSheet(null)}
          onSend={(cards) => {
            change(`Scanned ${remoteName}'s cards`, (h) => ({ ...h, live: { ...liveOf(h), cards } }));
            setSheet(null);
            toast.show(room.peer ? `Sent ${cards.length} cards to ${remoteName}` : `Saved. ${remoteName} sees them when they join.`);
          }} />
      )}

      {remote && <VideoCorner call={call} peerName={remoteName} />}
      {party && <Confetti />}
      {toast.node}
    </div>
  );
}

function RulesSheet({ game, onSave, onClose }) {
  const [rules, setRules] = useState({ ...STANDARD_RULES, ...game.rules });
  const [target, setTarget] = useState(game.target);
  return (
    <Sheet title="Scoring Rules" onClose={onClose} action={{ label: 'Save', onClick: () => onSave(rules, Math.max(1, target)) }}>
      <div className="section-title">Final score</div>
      <div className="card group"><NumberField label="Play to" value={target} onChange={setTarget} width={100} /></div>
      <RulesFields rules={rules} onChange={setRules} />
    </Sheet>
  );
}
