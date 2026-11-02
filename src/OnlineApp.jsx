import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { read, write } from './lib/store.js';
import { standings, winner, signed, scoreTeam, isNil, nilLabel, STANDARD_RULES } from './lib/scoring.js';
import { SEATS, teamOf, seatEntry } from './lib/table.js';
import { sortHand } from './lib/cards.js';
import { newTable, startGame, deal, placeBid, playCard, legalCards, backToLobby, publicTable, currentHand, ONLINE_RULES } from './lib/online.js';
import { botBid, botPlay, botNames } from './lib/bots.js';
import { useRoom, joinLink } from './lib/room.js';
import { useDevice } from './lib/device.js';
import { useCall } from './lib/call.js';
import { useKeys, seal, unseal } from './lib/secret.js';
import { useWakeLock, chime, buzz } from './lib/fx.js';
import { Icon, FannedHand, PlayingCard, Sheet, RulesFields, Toggle, Segmented, useToast, Confetti, StatusDot, CardText } from './components.jsx';
import { VideoTile, CallButtons, SoundNote } from './Video.jsx';
import { HandRow } from './Scoreboard.jsx';
import { history } from './lib/scoring.js';

const NAME_KEY = 'spades-online-name';
const ID_KEY = 'spades-device-id';
const BOT_DELAY_MS = 900;
const RESEND_MS = 2500;
const RESYNC_MS = 5000;
const NEXT_HAND_MS = 9000;
const TRICK_SHOW_MS = 1600;
const AREAS = ['bottom', 'left', 'top', 'right'];

// Per-tab first (two tabs on one device are two players), then the device's saved value, so a reload or
// reopening the app rejoins the same seat.
function tabRead(key) {
  try { const v = sessionStorage.getItem(key); if (v) return JSON.parse(v); } catch { /* no session storage */ }
  return read(key);
}
function tabWrite(key, value) {
  try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* no session storage */ }
  write(key, value);
}

/** This device's id, kept so a reload rejoins the same seat. */
function stableId() {
  let id = tabRead(ID_KEY);
  if (!id) id = Math.random().toString(36).slice(2, 10);
  tabWrite(ID_KEY, id);
  return id;
}

/** Online mode: everyone plays on their own device, the app deals, checks the rules and keeps score. */
export default function OnlineApp({ code, isHost, onLeave }) {
  const [name, setName] = useState(() => tabRead(NAME_KEY) ?? '');
  const [named, setNamed] = useState(() => Boolean(tabRead(NAME_KEY)));
  if (!named) {
    return (
      <div className="app">
        <header className="hero"><div className="wrap hero-row"><div className="brand"><span className="brand-mark">♠</span><h1>Play online</h1></div></div></header>
        <main className="wrap">
          <form className="card waiting-card" onSubmit={(e) => { e.preventDefault(); if (name.trim()) { tabWrite(NAME_KEY, name.trim()); setNamed(true); } }}>
            <h2>What’s your name?</h2>
            <p className="muted">Everyone at the table sees it.</p>
            <input className="code-input name-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" autoFocus maxLength={14} />
            <button type="submit" className="primary big" disabled={!name.trim()}>Continue</button>
            <button type="button" className="text-btn" onClick={onLeave}>Cancel</button>
          </form>
        </main>
      </div>
    );
  }
  return <OnlineRoom code={code} isHost={isHost} name={name.trim()} onLeave={onLeave} />;
}

function OnlineRoom({ code, isHost, name, onLeave }) {
  const keys = useKeys();
  const [deviceId] = useState(stableId);
  const [me, setMe] = useDevice(code, { role: isHost ? 'ohost' : 'oplayer', name, id: deviceId, pub: keys?.pub ?? null });
  const toast = useToast();
  const [view, setView] = useState(null); // the public table as this device sees it
  const [myHand, setMyHand] = useState(null); // { hand: game hand number, cards }
  const hostRef = useRef(null);

  // ----- Host: runs the game -----
  const tableKey = `spades-online-table-${code}`;
  const [table, setTable] = useState(() => (isHost ? read(tableKey) ?? newTable() : null));
  useEffect(() => { if (isHost) write(tableKey, table); }, [isHost, table]);

  const room = useRoom(code, me, onMessage);
  const call = useCall({ room, me, setMe, facing: 'user' });
  const hostPeer = isHost ? null : room.peers.find((p) => p.role === 'ohost');
  hostRef.current = hostPeer;

  const tableRef = useRef(table);
  tableRef.current = table;

  /** Host only: apply a move, or return why it isn't allowed. */
  const act = useCallback((fn) => {
    try {
      const next = fn(tableRef.current);
      tableRef.current = next;
      setTable(next);
      return null;
    } catch (err) {
      return err.message;
    }
  }, []);

  const seatOf = (t, id) => (t?.seats ?? []).findIndex((s) => s && !s.bot && s.id === id);

  function onMessage(m, from) {
    if (m.type === 'rtc') { call.handle(m); return; }
    if (isHost) {
      if (!from) return;
      const t = tableRef.current;
      const seat = seatOf(t, from.id);
      let error = null;
      if (m.type === 'o-hello') sendAll(t, from);
      else if (m.type === 'o-sit') {
        error = act((x) => sit(x, m.seat, { id: from.id, name: from.name }));
      } else if (m.type === 'o-stand') {
        error = act((x) => ({ ...x, seats: x.seats.map((s) => (s?.id === from.id ? null : s)) }));
      } else if (m.type === 'o-bid' && seat >= 0) {
        if (alreadyBid(t, seat, m.hand)) return; // a resend of a bid that arrived
        error = act((x) => placeBid(x, seat, m));
      } else if (m.type === 'o-play' && seat >= 0) {
        if (alreadyPlayed(t, seat, m.card)) return; // a resend of a card that arrived
        error = act((x) => playCard(x, seat, m.card));
      }
      if (error) room.send({ type: 'o-error', text: error }, from.id);
      return;
    }
    if (m.type === 'o-table') setView(m.table);
    else if (m.type === 'o-hand' && keys && hostRef.current?.pub) {
      unseal(keys, hostRef.current.pub, m.box).then((cards) => setMyHand({ hand: m.hand, cards })).catch(() => {});
    } else if (m.type === 'o-error') toast.show(m.text);
    else if (m.type === 'o-ping') { chime(true); buzz([200, 100, 200]); }
  }

  /** Host: send the table to everyone, each seated player their own (locked) cards. */
  const sendAll = useCallback(async (t, only) => {
    if (!t) return;
    const pub = publicTable(t);
    const targets = only ? [only] : room.peers;
    for (const p of targets) {
      if (p.role === 'tv' || p.role === 'guest') { if (t.game) room.send({ type: 'state', game: t.game }, p.id); continue; }
      room.send({ type: 'o-table', table: pub }, p.id);
      const seat = seatOf(t, p.id);
      if (seat >= 0 && t.round?.hands && keys && p.pub) {
        const box = await seal(keys, p.pub, t.round.hands[seat]);
        room.send({ type: 'o-hand', hand: t.game.hands.length, box }, p.id);
      }
    }
  }, [room.peers, keys]);

  const peerKey = room.peers.map((p) => `${p.id}:${p.pub ?? ''}:${p.role}`).join(',');
  useEffect(() => { if (isHost) sendAll(table); }, [isHost, table, peerKey, keys]);
  useEffect(() => {
    if (!isHost) return undefined;
    const timer = setInterval(() => sendAll(tableRef.current), RESYNC_MS);
    return () => clearInterval(timer);
  }, [isHost, sendAll]);
  useEffect(() => { if (!isHost && hostPeer) room.send({ type: 'o-hello' }, hostPeer.id); }, [isHost, hostPeer?.id, hostPeer?.pub, me.pub]);

  // Host: computer players (and stand-ins for someone who dropped out) take their turns.
  const present = new Set([me.id, ...room.peers.map((p) => p.id)]);
  const autoSeat = (t, s) => t.seats[s]?.bot || (t.seats[s] && !present.has(t.seats[s].id) && t.seats[s].standIn);
  useEffect(() => {
    if (!isHost || !table || !['bidding', 'playing'].includes(table.phase)) return undefined;
    const s = table.round.turn;
    if (!autoSeat(table, s)) return undefined;
    const wait = table.round.trick.length === 0 && table.round.lastTrick && Date.now() - table.round.lastTrick.at < TRICK_SHOW_MS ? TRICK_SHOW_MS : BOT_DELAY_MS;
    const timer = setTimeout(() => {
      act((x) => (x.phase === 'bidding' ? placeBid(x, s, botBid(x.round.hands[s])) : playCard(x, s, botPlay(x, s))));
    }, wait);
    return () => clearTimeout(timer);
  }, [isHost, table, peerKey]);

  // Host: deal the next hand a few seconds after one is scored.
  useEffect(() => {
    if (!isHost || table?.phase !== 'scored') return undefined;
    const timer = setTimeout(() => act((x) => (x.phase === 'scored' ? deal(x) : x)), NEXT_HAND_MS);
    return () => clearTimeout(timer);
  }, [isHost, table?.phase, table?.game?.hands.length]);

  // ----- What this device shows -----
  const shown = isHost ? (table ? publicTable(table) : null) : view;
  const mySeat = shown ? seatOf(shown, me.id) : -1;
  const handNo = shown?.game?.hands.length ?? 0;
  const cards = isHost
    ? (mySeat >= 0 && table?.round?.hands ? table.round.hands[mySeat] : null)
    : (myHand && myHand.hand === handNo ? myHand.cards : null);
  useWakeLock(true);

  // Moves from this device. A player's move is resent until the table shows it (a phone that locks for a
  // moment or a weak signal can drop a message); the host ignores repeats.
  const [pending, setPending] = useState(null);
  const send = (type, body) => {
    if (isHost) {
      const err = act((x) => (type === 'o-bid' ? placeBid(x, mySeat, body) : type === 'o-play' ? playCard(x, mySeat, body.card) : x));
      if (err) toast.show(err);
      return;
    }
    const move = { type, ...body, hand: handNo };
    setPending(move);
    if (hostRef.current) room.send(move, hostRef.current.id);
  };
  const turnKey = shown ? `${shown.phase}:${shown.round?.turn}:${shown.round?.tricks.length}:${shown.round?.trick.length}:${shown.round?.bidsIn}` : '';
  useEffect(() => { setPending(null); }, [turnKey]);
  useEffect(() => {
    if (!pending) return undefined;
    const timer = setInterval(() => { if (hostRef.current) room.send(pending, hostRef.current.id); }, RESEND_MS);
    return () => clearInterval(timer);
  }, [pending, room.send]);

  const people = [
    { id: me.id, name: me.name, role: me.role, here: true },
    ...room.peers.filter((p) => p.role === 'ohost' || p.role === 'oplayer').map((p) => ({ ...p, here: true })),
  ];

  if (!shown) {
    return (
      <div className="app">
        <header className="hero"><div className="wrap hero-row"><div className="brand"><span className="brand-mark">♠</span><h1>Game {code}</h1></div>
          <button type="button" className="icon-btn" onClick={onLeave}>Leave</button></div></header>
        <main className="wrap">
          <div className="card waiting-card"><span className="spinner" /><h2>Finding the host…</h2>
            <p className="muted">Make sure whoever sent the link has the game open.</p></div>
        </main>
      </div>
    );
  }

  const leave = () => {
    if (!confirm(isHost ? 'Close this game for everyone?' : 'Leave this game?')) return;
    if (!isHost) room.send({ type: 'o-stand' }, hostPeer?.id);
    call.leave();
    if (isHost) write(tableKey, null);
    onLeave();
  };

  return (
    <div className={`app online${shown.phase === 'lobby' ? '' : ' at-table'}`}>
      {shown.phase === 'lobby'
        ? <Lobby code={code} table={shown} isHost={isHost} me={me} people={people} call={call}
            onSit={(seat) => (isHost ? toastErr(toast, act((x) => sit(x, seat, { id: me.id, name: me.name }))) : room.send({ type: 'o-sit', seat }, hostPeer?.id))}
            onStand={() => (isHost ? act((x) => ({ ...x, seats: x.seats.map((s) => (s?.id === me.id ? null : s)) })) : room.send({ type: 'o-stand' }, hostPeer?.id))}
            hostActions={isHost ? hostLobbyActions(act, toast) : null}
            onLeave={leave} />
        : <OnlineTable table={shown} mySeat={mySeat} cards={cards} me={me} isHost={isHost} call={call} room={room}
            present={present} send={send} toast={toast} waiting={Boolean(pending)}
            hostActions={isHost ? hostGameActions(act) : null} onLeave={leave} />}
      {toast.node}
    </div>
  );
}

const toastErr = (toast, err) => { if (err) toast.show(err); };

/** Sit `who` in `seat` (moving them from any other seat). */
function sit(t, seat, who) {
  if (t.phase !== 'lobby') throw new Error('Seats are set while the game is on.');
  if (t.seats[seat] && t.seats[seat].id !== who.id && !t.seats[seat].bot) throw new Error('Someone is sitting there.');
  const seats = t.seats.map((s) => (s?.id === who.id ? null : s));
  seats[seat] = { id: who.id, name: who.name };
  return { ...t, seats };
}

function hostLobbyActions(act, toast) {
  return {
    addBot: (seat) => act((t) => {
      const used = new Set(t.seats.filter(Boolean).map((s) => s.name));
      const botName = botNames.find((n) => !used.has(n)) ?? 'Computer';
      const seats = [...t.seats];
      seats[seat] = { id: `bot-${seat}-${Date.now()}`, name: botName, bot: true };
      return { ...t, seats };
    }),
    fillBots: () => act((t) => {
      const used = new Set(t.seats.filter(Boolean).map((s) => s.name));
      const free = botNames.filter((n) => !used.has(n));
      return { ...t, seats: t.seats.map((s, i) => s ?? { id: `bot-${i}-${Date.now()}`, name: free.shift() ?? 'Computer', bot: true }) };
    }),
    clearSeat: (seat) => act((t) => ({ ...t, seats: t.seats.map((s, i) => (i === seat ? null : s)) })),
    swapTeams: () => act((t) => ({ ...t, seats: [t.seats[0], t.seats[2], t.seats[1], t.seats[3]] })),
    settings: (settings) => act((t) => ({ ...t, settings: { ...t.settings, ...settings } })),
    start: () => toastErr(toast, act((t) => startGame(t))),
  };
}

function hostGameActions(act) {
  return {
    nextHand: () => act((t) => (t.phase === 'scored' ? deal(t) : t)),
    playAgain: () => act((t) => startGame(t)),
    toLobby: () => act((t) => backToLobby(t)),
    standIn: (seat, on) => act((t) => ({ ...t, seats: t.seats.map((s, i) => (i === seat && s ? { ...s, standIn: on } : s)) })),
  };
}

// ---------------------------------------------------------------------------------------------
// Lobby: invite people, pick seats, set the rules, start.

function Lobby({ code, table, isHost, me, people, call, onSit, onStand, hostActions, onLeave }) {
  const [qr, setQr] = useState(null);
  const [copied, setCopied] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const link = joinLink(code, { as: 'online' });
  useEffect(() => { QRCode.toDataURL(link, { margin: 1, width: 320 }).then(setQr).catch(() => {}); }, [link]);
  const mySeat = table.seats.findIndex((s) => s?.id === me.id);
  const full = table.seats.every(Boolean);
  const seatedIds = new Set(table.seats.filter(Boolean).map((s) => s.id));
  const watching = people.filter((p) => !seatedIds.has(p.id));
  const host = people.find((p) => p.role === 'ohost');

  async function share() {
    try {
      if (navigator.share) await navigator.share({ title: 'Spades', text: `Play spades with us! Game ${code}.`, url: link });
      else { await navigator.clipboard.writeText(link); setCopied(true); }
    } catch { /* closed */ }
  }

  const seatCard = (s) => {
    const who = table.seats[s];
    const mine = who?.id === me.id;
    return (
      <div key={s} className={`lobby-seat t${teamOf(s)}${mine ? ' me' : ''}`}>
        {who ? (
          <>
            <b>{who.name}{who.bot ? ' 🤖' : ''}</b>
            <span className="muted small">{mine ? 'You' : who.bot ? 'Computer' : 'Seated'}</span>
            {mine && <button type="button" className="text-btn small" onClick={onStand}>Stand up</button>}
            {isHost && !mine && <button type="button" className="text-btn small" onClick={() => hostActions.clearSeat(s)}>Remove</button>}
          </>
        ) : (
          <>
            <span className="muted">Empty</span>
            <button type="button" className="soft" onClick={() => onSit(s)}>Sit here</button>
            {isHost && <button type="button" className="text-btn small" onClick={() => hostActions.addBot(s)}>Add computer</button>}
          </>
        )}
      </div>
    );
  };

  return (
    <>
      <header className="hero">
        <div className="wrap hero-row">
          <div className="brand"><span className="brand-mark">♠</span><h1>{table.gamesPlayed ? 'Next game' : 'Online game'}</h1></div>
          <button type="button" className="icon-btn" onClick={onLeave}>{isHost ? 'Close' : 'Leave'}</button>
        </div>
        <div className="wrap"><p className="target">Game {code} · {isHost ? 'You’re the host' : `Host: ${host?.name ?? '…'}`}</p></div>
      </header>
      <main className="wrap">
        {table.game && (
          <div className="card last-game">
            <div className="eyebrow">Last game</div>
            {(() => {
              const st = standings(table.game);
              const w = winner(table.game);
              const wi = w ?? 0;
              return <p><b>{table.game.teams[wi].name}</b> won, {st[wi].score} to {st[1 - wi].score}.</p>;
            })()}
          </div>
        )}

        <div className="section-title">Seats</div>
        <div className="lobby-teams">
          {[0, 1].map((t) => (
            <div key={t} className={`lobby-team t${t}`}>
              <div className="eyebrow">Team {t + 1}</div>
              {SEATS.map((_, s) => s).filter((s) => teamOf(s) === t).map(seatCard)}
            </div>
          ))}
        </div>
        <p className="footnote">Partners sit across from each other. {isHost && <button type="button" className="inline-link" onClick={hostActions.swapTeams}>Switch partners</button>}</p>

        {watching.length > 0 && (
          <p className="footnote">Not seated yet: {watching.map((p) => p.name).join(', ')}</p>
        )}

        <div className="section-title">Invite</div>
        <div className="invite-card card">
          <div className="code">{code.split('').map((c, i) => <span key={i}>{c}</span>)}</div>
          {qr && <img className="qr" src={qr} alt="QR code to join this game" />}
          <button type="button" className="primary big" onClick={share}><Icon name="share" /> {copied ? 'Link copied' : 'Send invite link'}</button>
          <p className="footnote center">Or open Spades, tap <b>Join a game</b> and type the code.</p>
        </div>

        <div className="section-title">Video &amp; audio</div>
        <div className="card guest-controls">
          {call.joined ? <CallButtons call={call} /> : (
            <div className="row" style={{ justifyContent: 'center' }}>
              <button type="button" className="soft" onClick={() => call.join()}><Icon name="video" size={18} /> Video</button>
              <button type="button" className="soft" onClick={() => call.join({ audioOnly: true })}><Icon name="mic" size={18} /> Audio only</button>
            </div>
          )}
          {call.error && <p className="scan-msg">{call.error}</p>}
          <SoundNote call={call} />
        </div>

        {isHost ? (
          <>
            <div className="section-title">Settings</div>
            <div className="card group">
              <div className="field"><span>Play to</span>
                <Segmented small label="Play to" value={table.settings.target}
                  options={[250, 300, 500].map((n) => ({ id: n, label: String(n) }))}
                  onChange={(target) => hostActions.settings({ target })} />
              </div>
              <Toggle label="Blind nil allowed" checked={table.settings.rules.blindNilAllowed !== false}
                onChange={(v) => hostActions.settings({ rules: { ...table.settings.rules, blindNilAllowed: v } })} />
              <button type="button" className="text-btn" onClick={() => setRulesOpen(true)}><Icon name="edit" size={16} /> More scoring rules</button>
            </div>
          </>
        ) : (
          <p className="footnote center">The host picks the rules and starts the game. Playing to {table.settings.target}.</p>
        )}
      </main>
      <div className="bottom-bar">
        {isHost ? (
          full
            ? <button type="button" className="primary big go" onClick={hostActions.start}>{table.gamesPlayed ? 'Start the next game' : 'Start game'}</button>
            : <button type="button" className="primary big" onClick={hostActions.fillBots}>Fill empty seats with computer players</button>
        ) : (
          <p className="dock-hint dark">{mySeat >= 0 ? `Waiting for ${host?.name ?? 'the host'} to start…` : 'Tap “Sit here” to take a seat.'}</p>
        )}
      </div>
      {rulesOpen && (
        <RulesSheetOnline rules={table.settings.rules} onClose={() => setRulesOpen(false)}
          onSave={(rules) => { hostActions.settings({ rules: { ...rules, blindNilAllowed: table.settings.rules.blindNilAllowed } }); setRulesOpen(false); }} />
      )}
    </>
  );
}

function RulesSheetOnline({ rules, onSave, onClose }) {
  const [r, setR] = useState({ ...STANDARD_RULES, ...rules });
  return (
    <Sheet title="Scoring rules" onClose={onClose} action={{ label: 'Save', onClick: () => onSave(r) }}>
      <RulesFields rules={r} onChange={setR} />
    </Sheet>
  );
}

// ---------------------------------------------------------------------------------------------
// The card table.

function OnlineTable({ table, mySeat, cards, me, isHost, call, room, present, send, toast, waiting, hostActions, onLeave }) {
  const r = table.round;
  const game = table.game;
  const hand = currentHand(table);
  const base = mySeat >= 0 ? mySeat : 0;
  const posOf = (s) => AREAS[(s - base + 4) % 4];
  const myTurn = mySeat >= 0 && r?.turn === mySeat && ['bidding', 'playing'].includes(table.phase);
  const [selected, setSelected] = useState(null);
  const [sending, setSending] = useState(false);
  const [peeked, setPeeked] = useState(null); // hand number whose cards I've looked at
  const [now, setNow] = useState(Date.now());
  const st = standings(game);

  // Let the finished book sit on the table for a moment.
  const showingLast = r?.lastTrick && r.trick.length === 0 && now - r.lastTrick.at < TRICK_SHOW_MS;
  useEffect(() => {
    if (!r?.lastTrick) return undefined;
    const t = setTimeout(() => setNow(Date.now()), Math.max(0, TRICK_SHOW_MS - (Date.now() - r.lastTrick.at)) + 30);
    return () => clearTimeout(t);
  }, [r?.lastTrick?.at]);

  useEffect(() => { setSelected(null); setSending(false); }, [r?.trick.length, r?.tricks.length, table.phase]);
  // If a move hasn't gone through and nothing is being resent, let them try again.
  useEffect(() => { if (!waiting) setSending(false); }, [waiting]);
  useEffect(() => { if (myTurn) { buzz(60); } }, [myTurn, r?.tricks.length, table.phase]);

  const handNo = game.hands.length;
  const blindOk = table.settings.rules.blindNilAllowed !== false;
  // Blind nil must be decided before looking, so a new hand starts face down until you choose.
  const coverCards = table.phase === 'bidding' && blindOk && mySeat >= 0 && !hasBid(table, mySeat) && peeked !== handNo;
  const legal = cards && table.phase === 'playing' && myTurn
    ? legalCards({ ...table, round: { ...r, hands: { [mySeat]: cards } } }, mySeat)
    : [];
  const sorted = cards ? sortHand(cards) : [];

  const play = () => {
    if (!selected || !legal.includes(selected)) return;
    setSending(true);
    send('o-play', { card: selected });
  };
  const videoOf = (id) => (id === me.id ? call.local : call.videos.find((v) => v.peer.id === id)?.stream);
  const peerOf = (id) => room.peers.find((p) => p.id === id);
  const trickCards = showingLast ? r.lastTrick.cards : r?.trick ?? [];

  return (
    <>
      <header className="online-top">
        <div className="online-scores">
          {[0, 1].map((t) => (
            <div key={t} className={`online-team t${t}`}>
              <span>{game.teams[t].name}</span>
              <b>{st[t].score}</b>
              {game.rules.bagsEnabled && <small>{st[t].bags} bag{st[t].bags === 1 ? '' : 's'}</small>}
            </div>
          ))}
        </div>
        <div className="online-meta">
          <span>Hand {handNo} · to {game.target}</span>
          <div className="row">
            {!call.joined && <button type="button" className="icon-btn round small" aria-label="Video chat" onClick={() => call.join()}><Icon name="video" size={18} /></button>}
            {!call.joined && <button type="button" className="icon-btn round small" aria-label="Audio chat" onClick={() => call.join({ audioOnly: true })}><Icon name="mic" size={18} /></button>}
            <button type="button" className="icon-btn round small" aria-label="Leave" onClick={onLeave}><Icon name="close" size={18} /></button>
          </div>
        </div>
      </header>

      <div className="felt">
        {SEATS.map((_, s) => {
          const who = table.seats[s];
          const entry = seatEntry(hand, s);
          const away = who && !who.bot && !present.has(who.id);
          const turn = r?.turn === s && ['bidding', 'playing'].includes(table.phase);
          const stream = who && !who.bot ? videoOf(who.id) : null;
          const bidText = table.phase === 'bidding' && !hasBid(table, s) ? (turn ? 'bidding…' : '–')
            : isNil(entry.call) ? nilLabel(entry.call) : `bid ${entry.bid}`;
          return (
            <div key={s} className={`player-spot ${posOf(s)} t${teamOf(s)}${turn ? ' turn' : ''}${s === mySeat ? ' me' : ''}`}>
              <div className="avatar">
                {stream && (
                  <VideoTile stream={stream} muted={who.id === me.id || !call.speakerOn} mirrored={who.id === me.id}
                    micOff={who.id !== me.id && peerOf(who.id) && !peerOf(who.id).mic}
                    className={hasVideo(stream) && (who.id !== me.id || call.camOn) ? '' : 'no-video'} />
                )}
                {(!stream || !hasVideo(stream) || (who.id === me.id && !call.camOn)) && (
                  <span className="initial">{who?.bot ? '🤖' : (who?.name ?? '?').slice(0, 1).toUpperCase()}</span>
                )}
                {r?.dealer === s && <span className="dealer-chip">D</span>}
              </div>
              <div className="spot-name">{s === mySeat ? 'You' : who?.name}</div>
              <div className="spot-score">
                {table.phase === 'bidding' ? bidText : <>{entry.books}<small> / {isNil(entry.call) ? nilLabel(entry.call) : entry.bid}</small></>}
              </div>
              {away && (
                <div className="away">
                  {who.standIn ? 'computer playing' : 'reconnecting…'}
                  {isHost && <button type="button" className="text-btn small" onClick={() => hostActions.standIn(s, !who.standIn)}>{who.standIn ? 'Wait instead' : 'Computer plays'}</button>}
                </div>
              )}
            </div>
          );
        })}

        <div className="trick">
          {trickCards.map(({ seat, card }) => (
            <div key={seat} className={`trick-card ${posOf(seat)}${showingLast && r.lastTrick.winner === seat ? ' won' : ''}`}>
              <PlayingCard code={card} size="md" />
            </div>
          ))}
          {!trickCards.length && table.phase === 'playing' && (
            <div className="trick-msg">{r.spadesBroken ? '♠ broken' : 'Spades not broken'}</div>
          )}
          {showingLast && <div className="trick-msg winner-msg">{r.lastTrick.winner === mySeat ? 'You take it' : `${table.seats[r.lastTrick.winner]?.name} takes it`}</div>}
        </div>
      </div>

      {call.joined && (
        <div className="online-call"><CallButtons call={call} size={18} /><SoundNote call={call} /></div>
      )}

      {/* This player's hand and controls */}
      {mySeat >= 0 && (
        <div className="hand-dock online-dock">
          <div className="dock-head">
            <span>{myTurn ? (table.phase === 'bidding' ? 'Your bid' : 'Your turn') : turnText(table)}</span>
            <span>{cards ? `${cards.length} cards` : ''}</span>
          </div>
          {coverCards ? (
            <div className="blind-choice">
              <p>New hand dealt. Thinking about <b>blind nil</b>? Decide before you look.</p>
              <div className="row">
                <button type="button" className="secondary" onClick={() => setPeeked(handNo)}>Look at my cards</button>
                {myTurn && <button type="button" className="primary" onClick={() => send('o-bid', { call: 'blind' })}>Blind nil</button>}
              </div>
              {!myTurn && <p className="small">You can bid blind nil when it’s your turn.</p>}
            </div>
          ) : cards ? (
            <FannedHand cards={sorted} selected={selected}
              onSelect={table.phase === 'playing' && myTurn && !sending ? (c) => setSelected(c && legal.includes(c) ? c : null) : undefined}
              dim={table.phase === 'playing' && myTurn ? sorted.filter((c) => !legal.includes(c)) : []} />
          ) : (
            <p className="dock-hint">Getting your cards…</p>
          )}
          <div className="dock-action">
            {myTurn && table.phase === 'bidding' && !coverCards && <BidPad onBid={(b) => send('o-bid', b)} />}
            {myTurn && table.phase === 'playing' && (selected
              ? <button type="button" className="primary big go" disabled={sending} onClick={play}>Play <CardText code={selected} /></button>
              : <p className="dock-hint">Tap a card to play. Cards you can’t play are dimmed.</p>)}
          </div>
        </div>
      )}

      {(table.phase === 'scored' || table.phase === 'over') && (
        <HandResult table={table} isHost={isHost} hostActions={hostActions} />
      )}
    </>
  );
}

const hasVideo = (stream) => stream.getVideoTracks().length > 0;

/** Has `seat` already played `card` this hand (so a repeat of that move can be ignored)? */
function alreadyPlayed(t, seat, card) {
  const r = t.round;
  if (!r) return false;
  return r.trick.some((x) => x.seat === seat && x.card === card)
    || r.tricks.some((tr) => tr.cards.some((x) => x.seat === seat && x.card === card));
}

/** Should a bid from `seat` for hand number `hand` be ignored (already in, or left over from an old hand)? */
function alreadyBid(t, seat, hand) {
  if (!t.game || hand !== t.game.hands.length) return true;
  return hasBid(t, seat);
}

const hasBid = (table, s) => {
  // Bids go round from the seat after the dealer; seats before the current turn have bid.
  const r = table.round;
  if (table.phase !== 'bidding') return true;
  const first = (r.dealer + 1) % 4;
  return (s - first + 4) % 4 < r.bidsIn;
};

function turnText(table) {
  const who = table.seats[table.round?.turn]?.name;
  if (table.phase === 'bidding') return `${who} is bidding`;
  if (table.phase === 'playing') return `${who}’s turn`;
  return '';
}

function BidPad({ onBid }) {
  const [n, setN] = useState(null);
  return (
    <div className="bid-pad">
      <div className="bid-grid">
        {Array.from({ length: 13 }, (_, i) => i + 1).map((b) => (
          <button key={b} type="button" className={n === b ? 'on' : ''} onClick={() => setN(b)}>{b}</button>
        ))}
        <button type="button" className={`nil${n === 'nil' ? ' on' : ''}`} onClick={() => setN('nil')}>Nil</button>
      </div>
      <button type="button" className="primary big go" disabled={n == null} onClick={() => onBid(n === 'nil' ? { call: 'nil' } : { bid: n })}>
        {n == null ? 'Choose your bid' : n === 'nil' ? 'Bid nil' : `Bid ${n}`}
      </button>
    </div>
  );
}

/** After the 13th book: what each team scored; at the end of the game, who won. */
function HandResult({ table, isHost, hostActions }) {
  const game = table.game;
  const hand = currentHand(table);
  const hist = history(game);
  const last = hist[hist.length - 1];
  const over = table.phase === 'over';
  const w = winner(game);
  const [left, setLeft] = useState(Math.round(NEXT_HAND_MS / 1000));
  useEffect(() => {
    if (over) return undefined;
    const t = setInterval(() => setLeft((x) => Math.max(0, x - 1)), 1000);
    return () => clearInterval(t);
  }, [over]);
  return (
    <div className="sheet-backdrop">
      <div className="result-card">
        <h2>{over ? `${game.teams[w].name} win!` : `Hand ${game.hands.length}`}</h2>
        <div className="result-teams">
          {[0, 1].map((t) => {
            const r = scoreTeam(hand.teams[t], game.rules);
            return (
              <div key={t} className={`result-team t${t}`}>
                <b>{game.teams[t].name}</b>
                <span className={`points ${last[t].points < 0 ? 'neg' : 'pos'}`}>{signed(last[t].points)}</span>
                <span className="muted small">{r.lines.join(' · ')}{last[t].penalty ? ` · bag penalty −${last[t].penalty}` : ''}</span>
                <span className="result-total">{last[t].score}</span>
              </div>
            );
          })}
        </div>
        {over && <HandList game={game} />}
        {isHost ? (
          over ? (
            <div className="stack">
              <button type="button" className="primary big go" onClick={hostActions.playAgain}>Play again, same seats</button>
              <button type="button" className="secondary big" onClick={hostActions.toLobby}>Change seats or settings</button>
            </div>
          ) : (
            <button type="button" className="primary big" onClick={hostActions.nextHand}>Next hand ({left})</button>
          )
        ) : (
          <p className="muted center">{over ? 'Waiting for the host to start another game…' : `Next hand in ${left}…`}</p>
        )}
      </div>
      {over && <Confetti />}
    </div>
  );
}

function HandList({ game }) {
  const hist = history(game);
  return (
    <div className="stack result-hands">
      {game.hands.map((h, i) => ({ h, i })).reverse().map(({ h, i }) => (
        <HandRow key={h.id} hand={h} number={i + 1} standing={hist[i]} game={game} />
      ))}
    </div>
  );
}
