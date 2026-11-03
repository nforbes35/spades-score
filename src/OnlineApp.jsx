import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { read, write, tabRead, tabWrite } from './lib/store.js';
import { standings, winner, signed, scoreTeam, isNil, nilLabel, STANDARD_RULES } from './lib/scoring.js';
import { SEATS, teamOf, seatEntry } from './lib/table.js';
import { sortHand } from './lib/cards.js';
import { newTable, startGame, deal, placeBid, playCard, legalCards, backToLobby, publicTable, currentHand, ONLINE_RULES } from './lib/online.js';
import { botBid, botPlay, pickBotNames } from './lib/bots.js';
import { useRoom, joinLink } from './lib/room.js';
import { useDevice, rememberTvScreen } from './lib/device.js';
import { useCall } from './lib/call.js';
import { useKeys, seal, unseal } from './lib/secret.js';
import { useWakeLock, chime, buzz, dealSound } from './lib/fx.js';
import { recordGame, useStatsSync, nameKey } from './lib/stats.js';
import Stats from './Stats.jsx';
import DeckPicker from './DeckPicker.jsx';
import { useDeck } from './lib/decks.js';
import { Avatar, ProfileEditor } from './Avatar.jsx';
import { loadName, saveName, loadAvatar, saveAvatar, useAvatars } from './lib/profile.js';
import { Icon, FannedHand, PlayingCard, CardBack, Sheet, RulesFields, Toggle, Segmented, useToast, Confetti, StatusDot, CardText, useCountUp } from './components.jsx';
import { VideoTile, CallButtons, SoundNote, useTvStart, SoundPrompt } from './Video.jsx';
import { HandRow } from './Scoreboard.jsx';
import { history } from './lib/scoring.js';

const ID_KEY = 'spades-device-id';
const TV_ID_KEY = 'spades-tv-id';
// The last online game on this device, for the home screen's Rejoin button.
export const LAST_ONLINE_KEY = 'spades-last-online';
const BOT_DELAY_MS = 900;
const RESEND_MS = 2500;
const RESYNC_MS = 5000;
// After the last book has sat on the table, the score shows this long before the next deal.
const NEXT_HAND_MS = 5000;
// The dealing animation: a riffle, then 52 cards flying out (see DealAnimation).
const RIFFLE_MS = 450;
const DEAL_GAP_MS = 28;
const DEAL_MS = 2500;
const TRICK_SHOW_MS = 1600;
const BANNER_DELAY_MS = 4000;
const NOT_FOUND_MS = 15000;
const BID_TIMES = [15, 30, 45, 60, 90];
const DEFAULT_BID_TIMER = 30;
// Extra time the host allows past the countdown, for a bid that's on its way.
const BID_GRACE_MS = 1500;
const AREAS = ['bottom', 'left', 'top', 'right'];

/** This device's id, kept so a reload rejoins the same seat. A TV keeps its own, so it's never mistaken for a player. */
function stableId(key = ID_KEY) {
  let id = tabRead(key);
  if (!id) id = Math.random().toString(36).slice(2, 10);
  tabWrite(key, id);
  return id;
}

/** Online mode: everyone plays on their own device, the app deals, checks the rules and keeps score. */
export default function OnlineApp({ code, isHost, tv, onLeave, onPlayHere, onUseAsTv }) {
  const [name, setName] = useState(loadName);
  const [avatar, setAvatar] = useState(loadAvatar);
  const [named, setNamed] = useState(() => Boolean(loadName()));
  const changeAvatar = (value) => { setAvatar(value); saveAvatar(value); };
  if (tv) return <OnlineRoom code={code} tv name="TV" avatar={null} onLeave={onLeave} onPlayHere={onPlayHere} onProfile={() => {}} />;
  if (!named) {
    return (
      <div className="app">
        <header className="hero"><div className="wrap hero-row"><div className="brand"><span className="brand-mark">♠</span><h1>Play Online</h1></div></div></header>
        <main className="wrap">
          <form className="card waiting-card profile-card" onSubmit={(e) => { e.preventDefault(); if (name.trim()) { saveName(name.trim()); setNamed(true); } }}>
            <h2>Who’s playing?</h2>
            <p className="muted">Everyone at the table sees your name and icon.</p>
            <ProfileEditor name={name} avatar={avatar} onName={setName} onAvatar={changeAvatar} autoFocus={!name} />
            <button type="submit" className="primary big go" disabled={!name.trim()}>Continue</button>
            <button type="button" className="text-btn" onClick={onLeave}>Cancel</button>
          </form>
        </main>
      </div>
    );
  }
  return (
    <OnlineRoom code={code} isHost={isHost} name={name.trim()} avatar={avatar} onLeave={onLeave} onUseAsTv={onUseAsTv}
      onProfile={(next) => { setName(next.name); saveName(next.name); changeAvatar(next.avatar); }} />
  );
}

function OnlineRoom({ code, isHost = false, tv = false, name, avatar, onLeave, onPlayHere, onUseAsTv, onProfile }) {
  const keys = useKeys();
  const [deviceId] = useState(() => stableId(tv ? TV_ID_KEY : ID_KEY));
  const [me, setMe] = useDevice(code, { role: isHost ? 'ohost' : tv ? 'otv' : 'oplayer', name, id: deviceId, pub: keys?.pub ?? null });
  const toast = useToast();
  const [view, setView] = useState(null); // the public table as this device sees it
  const [myHand, setMyHand] = useState(null); // { hand: game hand number, cards }
  const [closed, setClosed] = useState(null); // { by }: the host ended the game
  const hostRef = useRef(null);

  // ----- Host: runs the game -----
  const tableKey = `spades-online-table-${code}`;
  const [table, setTable] = useState(() => (isHost ? read(tableKey) ?? newTable() : null));
  useEffect(() => { if (isHost) write(tableKey, table); }, [isHost, table]);

  const room = useRoom(code, me, onMessage);
  const call = useCall({ room, me, setMe, facing: 'user', receiveOnly: tv });
  const statsSync = useStatsSync(room);
  const [icons, iconMessage] = useAvatars(room, me, avatar);
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
    if (statsSync(m, from)) return;
    if (iconMessage(m, from)) return;
    if (isHost) {
      if (!from) return;
      const t = tableRef.current;
      const seat = seatOf(t, from.id);
      let error = null;
      if (m.type === 'o-hello') {
        // Back from another browser or phone (so a new device id): the seat of an away player with the same
        // name is theirs again.
        const back = seat < 0 && t.phase !== 'lobby' && from.role === 'oplayer' ? awaySeatNamed(t, from.name, room.peers, me.id) : -1;
        if (back >= 0) act((x) => ({ ...x, seats: x.seats.map((y, i) => (i === back ? { ...y, id: from.id, standIn: false } : y)) }));
        else sendAll(t, from);
      } else if (m.type === 'o-sit') {
        error = act((x) => sit(x, m.seat, { id: from.id, name: String(m.name || from.name || '').trim().slice(0, 14) || 'Player' }));
      } else if (m.type === 'o-stand') {
        // Mid-game the seat stays theirs: the computer plays it until they rejoin.
        error = act((x) => ({ ...x, seats: x.seats.map((s) => (s?.id !== from.id ? s : x.phase === 'lobby' ? null : { ...s, standIn: true })) }));
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
    else if (m.type === 'o-closed' && from?.role === 'ohost') {
      setClosed({ by: m.by || from.name });
      forgetGame(code);
      call.leave();
    }
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
    let wait = table.round.trick.length === 0 && table.round.lastTrick && Date.now() - table.round.lastTrick.at < TRICK_SHOW_MS ? TRICK_SHOW_MS : BOT_DELAY_MS;
    // The first bid waits for the cards to finish being dealt.
    if (table.phase === 'bidding' && table.round.bidsIn === 0 && table.round.dealtAt) wait = Math.max(wait, table.round.dealtAt + DEAL_MS + 400 - Date.now());
    const timer = setTimeout(() => {
      act((x) => (x.phase === 'bidding' ? placeBid(x, s, botBid(x.round.hands[s])) : playCard(x, s, botPlay(x, s))));
    }, wait);
    return () => clearTimeout(timer);
  }, [isHost, table, peerKey]);

  // Host: with a bid timer, the computer bids for anyone who runs out of time.
  const bidTimer = table?.settings?.bidTimer ?? 0;
  const bidTurn = table?.phase === 'bidding' ? `${table.game.hands.length}:${table.round.turn}` : null;
  useEffect(() => {
    if (!isHost || !bidTimer || !bidTurn) return undefined;
    const s = tableRef.current.round.turn;
    if (autoSeat(tableRef.current, s)) return undefined;
    const timer = setTimeout(() => {
      const before = tableRef.current;
      act((x) => (x.phase === 'bidding' && `${x.game.hands.length}:${x.round.turn}` === bidTurn ? placeBid(x, s, botBid(x.round.hands[s])) : x));
      if (tableRef.current !== before) {
        const who = tableRef.current.seats[s];
        if (who?.id === me.id) toast.show('Time’s up: the computer bid for you.');
        else if (who) room.send({ type: 'o-error', text: 'Time’s up: the computer bid for you.' }, who.id);
      }
    }, bidTimer * 1000 + BID_GRACE_MS + (tableRef.current.round.bidsIn === 0 ? DEAL_MS : 0));
    return () => clearTimeout(timer);
  }, [isHost, bidTimer, bidTurn]);

  // Host: once the last book has been seen, show the score for a few seconds, then deal the next hand.
  useEffect(() => {
    if (!isHost || table?.phase !== 'scored') return undefined;
    const timer = setTimeout(() => act((x) => (x.phase === 'scored' ? deal(x) : x)), TRICK_SHOW_MS + NEXT_HAND_MS);
    return () => clearTimeout(timer);
  }, [isHost, table?.phase, table?.game?.hands.length]);

  // ----- What this device shows -----
  const shown = isHost ? (table ? publicTable(table) : null) : view;
  const mySeat = shown && !tv ? seatOf(shown, me.id) : -1;
  // Every device keeps the game for stats as hands are scored (computer players noted).
  const scoredHands = shown?.game ? shown.game.hands.filter((h) => !h.inPlay).length : 0;
  useEffect(() => {
    if (shown?.game && !tv) recordGame(shown.game, { mode: 'online', bots: shown.seats.filter((s) => s?.bot).map((s) => s.name) });
  }, [scoredHands, shown?.game?.id, shown?.phase]);
  const handNo = shown?.game?.hands.length ?? 0;
  const cards = isHost
    ? (mySeat >= 0 && table?.round?.hands ? table.round.hands[mySeat] : null)
    : (myHand && myHand.hand === handNo ? myHand.cards : null);
  useWakeLock(true);
  const tvFit = useTvFit(tv);
  // No host after a while: the game may be over (an old link or code).
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (shown) return undefined;
    const t = setTimeout(() => setSlow(true), NOT_FOUND_MS);
    return () => clearTimeout(t);
  }, [Boolean(shown)]);
  useEffect(() => { if (!tv) write(LAST_ONLINE_KEY, { code, host: isHost, at: Date.now() }); }, [code, isHost, tv, handNo]);

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

  // A new name shows on your seat too.
  useEffect(() => {
    if (shown?.phase !== 'lobby' || mySeat < 0 || shown.seats[mySeat].name === name) return;
    if (isHost) act((x) => sit(x, mySeat, { id: me.id, name }));
    else if (hostPeer) room.send({ type: 'o-sit', seat: mySeat, name }, hostPeer.id);
  }, [name, mySeat, shown?.phase, hostPeer?.id, me.name]);

  const people = [
    { id: me.id, name: me.name, role: me.role, here: true },
    ...room.peers.filter((p) => p.role === 'ohost' || p.role === 'oplayer').map((p) => ({ ...p, here: true })),
  ];

  if (closed) return <GameEnded by={closed.by} game={shown?.game} onHome={onLeave} />;

  if (!shown) {
    return (
      <div className="app">
        <header className="hero"><div className="wrap hero-row"><div className="brand"><span className="brand-mark">♠</span><h1>Game {code}</h1></div>
          <button type="button" className="icon-btn" onClick={onLeave}>Leave</button></div></header>
        <main className="wrap">
          <div className="card waiting-card"><span className="spinner" /><h2>Finding the host…</h2>
            <p className="muted">Make sure whoever sent the link has the game open.</p>
            {slow && (
              <>
                <p><b>Still can’t find game {code}.</b> It may have ended, or the host’s phone has the app closed.</p>
                <button type="button" className="secondary" onClick={() => { forgetGame(code); onLeave(); }}>Back to home</button>
              </>
            )}
          </div>
        </main>
      </div>
    );
  }

  const midGame = shown.phase !== 'lobby' && mySeat >= 0;
  const leave = () => {
    if (!confirm(isHost
      ? (shown.phase === 'lobby' ? 'Close this game for everyone?' : 'End this game for everyone? Everyone sees the score so far and goes back to the home screen.')
      : midGame ? 'Leave this game? The computer plays your seat until you rejoin from the home screen.' : 'Leave this game?')) return;
    call.leave();
    if (!isHost) { room.send({ type: 'o-stand' }, hostPeer?.id); onLeave(); return; }
    // Tell everyone it's over (twice, in case one goes missing), then go.
    write(tableKey, null);
    forgetGame(code);
    room.send({ type: 'o-closed', by: name });
    setTimeout(() => room.send({ type: 'o-closed', by: name }), 250);
    setTimeout(onLeave, 600);
  };

  if (tv) {
    return (
      <div className={`app online tv-mode${shown.phase === 'lobby' ? '' : ' at-table'}`} style={tvFit}>
        {shown.phase === 'lobby'
          ? <TvLobby code={code} table={shown} icons={icons} onPlayHere={() => { rememberTvScreen(false); call.leave(); onPlayHere(); }} />
          : <OnlineTable code={code} table={shown} mySeat={-1} cards={null} me={me} isHost={false} call={call} room={room} icons={icons}
              present={present} send={() => {}} toast={toast} waiting={false} tv onLeave={onLeave} />}
        <TvControls call={call} onLeave={() => { call.leave(); onLeave(); }} />
      </div>
    );
  }

  return (
    <div className={`app online${shown.phase === 'lobby' ? '' : ' at-table'}`}>
      {shown.phase === 'lobby'
        ? <Lobby code={code} table={shown} isHost={isHost} me={me} people={people} call={call} icons={icons}
            profile={{ name, avatar }} onProfile={onProfile}
            onSit={(seat) => (isHost ? toastErr(toast, act((x) => sit(x, seat, { id: me.id, name }))) : room.send({ type: 'o-sit', seat, name }, hostPeer?.id))}
            onStand={() => (isHost ? act((x) => ({ ...x, seats: x.seats.map((s) => (s?.id === me.id ? null : s)) })) : room.send({ type: 'o-stand' }, hostPeer?.id))}
            hostActions={isHost ? hostLobbyActions(act, toast) : null}
            onLeave={leave}
            onUseAsTv={isHost ? null : () => {
              // This screen becomes the TV (remembered for next time); give up any seat first.
              rememberTvScreen(true);
              if (mySeat >= 0) room.send({ type: 'o-stand' }, hostPeer?.id);
              call.leave();
              onUseAsTv();
            }} />
        : <OnlineTable code={code} table={shown} mySeat={mySeat} cards={cards} me={me} isHost={isHost} call={call} room={room} icons={icons}
            present={present} send={send} toast={toast} waiting={Boolean(pending)}
            hostActions={isHost ? hostGameActions(act) : null} onLeave={leave} />}
      <ConnectionBanner room={room} isHost={isHost} hostPeer={hostPeer} onLeave={leave} />
      {toast.node}
    </div>
  );
}

const toastErr = (toast, err) => { if (err) toast.show(err); };

/** Drop this game from the home screen's Rejoin button. */
function forgetGame(code) {
  if (read(LAST_ONLINE_KEY)?.code === code) write(LAST_ONLINE_KEY, null);
}

/** The host ended the game: the score so far, and back home. */
function GameEnded({ by, game, onHome }) {
  const st = game ? standings(game) : null;
  const played = game ? game.hands.filter((h) => !h.inPlay).length : 0;
  return (
    <div className="app game-ended">
      <main className="wrap">
        <div className="card waiting-card ended-card">
          <span className="brand-mark">♠</span>
          <h2>{by ? `${by} closed the game` : 'The game has ended'}</h2>
          {game && (
            <div className="ended-scores">
              {[0, 1].map((t) => (
                <div key={t} className={`ended-team t${t}`}>
                  <span>{game.teams[t].name}</span>
                  <b>{st[t].score}</b>
                </div>
              ))}
            </div>
          )}
          {game && <p className="muted">{played ? `After ${played} hand${played === 1 ? '' : 's'}. Stats from the hands you played are saved.` : 'No hands were finished.'}</p>}
          <button type="button" className="primary big go" onClick={onHome}>Back to home</button>
        </div>
      </main>
    </div>
  );
}

/** The seat of a player who isn't here and goes by `name` (-1 if none): someone coming back on a new device. */
function awaySeatNamed(t, name, peers, hostId) {
  if (!name) return -1;
  const here = new Set([hostId, ...peers.map((p) => p.id)]);
  return t.seats.findIndex((x) => x && !x.bot && !here.has(x.id) && nameKey(x.name) === nameKey(name));
}

/**
 * A strip across the top when this device has lost the game: the connection dropped, or (for players) the
 * host's phone has gone quiet. It reconnects by itself; the button tries again right away.
 */
function ConnectionBanner({ room, isHost, hostPeer, onLeave }) {
  const offline = room.status === 'error' || room.status === 'offline' || room.status === 'connecting';
  const lostHost = !isHost && !hostPeer;
  const problem = offline ? 'offline' : lostHost ? 'host' : null;
  // Only after a few seconds, so a quick blip doesn't flash a warning.
  const [shown, setShown] = useState(null);
  useEffect(() => {
    if (!problem) { setShown(null); return undefined; }
    const t = setTimeout(() => setShown(problem), BANNER_DELAY_MS);
    return () => clearTimeout(t);
  }, [problem]);
  if (!shown) return null;
  return (
    <div className="conn-banner" role="status">
      <span className="spinner small" />
      <span>{shown === 'offline' ? 'Connection lost. Reconnecting…' : 'Waiting for the host’s phone to come back…'}</span>
      <button type="button" onClick={room.reconnect}>Rejoin now</button>
      {shown === 'host' && <button type="button" className="leave" onClick={onLeave}>Leave</button>}
    </div>
  );
}

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
      const botName = pickBotNames(used, 1)[0] ?? 'Computer';
      const seats = [...t.seats];
      seats[seat] = { id: `bot-${seat}-${Date.now()}`, name: botName, bot: true };
      return { ...t, seats };
    }),
    fillBots: () => act((t) => {
      const used = new Set(t.seats.filter(Boolean).map((s) => s.name));
      const free = pickBotNames(used, 4);
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

function Lobby({ code, table, isHost, me, people, call, icons, profile, onProfile, onSit, onStand, hostActions, onLeave, onUseAsTv }) {
  const [qr, setQr] = useState(null);
  const [editing, setEditing] = useState(null); // the profile being edited
  const [decksOpen, setDecksOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
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
            {mine
              ? <button type="button" className="seat-avatar-btn" aria-label="Change your name or icon" onClick={() => setEditing(profile)}><Avatar value={icons[who.id]} name={who.name} className="lobby-avatar" /><span className="edit-dot"><Icon name="edit" size={12} /></span></button>
              : <Avatar value={icons[who.id]} name={who.name} bot={who.bot} className="lobby-avatar" />}
            <b>{who.name}</b>
            <span className="muted small">{mine ? 'You' : who.bot ? 'Computer' : 'Seated'}</span>
            {mine && <button type="button" className="text-btn small" onClick={onStand}>Stand up</button>}
            {isHost && !mine && <button type="button" className="text-btn small" onClick={() => hostActions.clearSeat(s)}>Remove</button>}
          </>
        ) : (
          <>
            <span className="empty-seat" aria-hidden="true">+</span>
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
        <div className="wrap lobby-me">
          <button type="button" className="profile-chip" onClick={() => setEditing(profile)}>
            <Avatar value={profile.avatar} name={profile.name} /> {profile.name} <Icon name="edit" size={14} />
          </button>
          <button type="button" className="profile-chip" onClick={() => setDecksOpen(true)}><Icon name="cards" size={18} /> Cards &amp; table</button>
          {onUseAsTv && <button type="button" className="profile-chip" onClick={onUseAsTv}><Icon name="tv" size={18} /> TV mode</button>}
        </div>
        <div className="wrap"><p className="target">Game {code} · {isHost ? 'You’re the host' : `Host: ${host?.name ?? '…'}`}</p></div>
      </header>
      <main className="wrap">
        {table.game && (
          <div className="card last-game">
            <div className="row between">
              <span className="eyebrow">Last game</span>
              <button type="button" className="text-btn small" onClick={() => setStatsOpen(true)}><Icon name="trophy" size={15} /> Stats</button>
            </div>
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

        <div className="section-title">Companion TV</div>
        <TvInviteCard code={code} />

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
              <Toggle label="Bid timer" checked={Boolean(table.settings.bidTimer)}
                onChange={(on) => hostActions.settings({ bidTimer: on ? DEFAULT_BID_TIMER : 0 })} />
              {Boolean(table.settings.bidTimer) && (
                <div className="field"><span>Seconds to bid</span>
                  <Segmented small label="Seconds to bid" value={table.settings.bidTimer}
                    options={BID_TIMES.map((n) => ({ id: n, label: String(n) }))}
                    onChange={(bidTimer) => hostActions.settings({ bidTimer })} />
                </div>
              )}
              {Boolean(table.settings.bidTimer) && <p className="footnote">When time runs out, the computer bids for that player.</p>}
              <Toggle label="Blind nil allowed" checked={table.settings.rules.blindNilAllowed !== false}
                onChange={(v) => hostActions.settings({ rules: { ...table.settings.rules, blindNilAllowed: v } })} />
              <button type="button" className="text-btn" onClick={() => setRulesOpen(true)}><Icon name="edit" size={16} /> More scoring rules</button>
            </div>
          </>
        ) : (
          <p className="footnote center">The host picks the rules and starts the game. Playing to {table.settings.target}.{table.settings.bidTimer ? ` ${table.settings.bidTimer} seconds to bid.` : ''}</p>
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
      {statsOpen && <Stats onClose={() => setStatsOpen(false)} />}
      {decksOpen && <DeckPicker onClose={() => setDecksOpen(false)} />}
      {editing && (
        <Sheet title="You" onClose={() => setEditing(null)}
          action={{ label: 'Done', onClick: () => { if (editing.name.trim()) onProfile({ ...editing, name: editing.name.trim() }); setEditing(null); } }}>
          <ProfileEditor name={editing.name} avatar={editing.avatar}
            onName={(n) => setEditing((x) => ({ ...x, name: n }))} onAvatar={(a) => setEditing((x) => ({ ...x, avatar: a }))} />
        </Sheet>
      )}
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

function OnlineTable({ code, table, mySeat, cards, me, isHost, call, room, icons, present, send, toast, waiting, hostActions, onLeave, tv = false }) {
  const r = table.round;
  const game = table.game;
  const hand = currentHand(table);
  const base = mySeat >= 0 ? mySeat : 0;
  const posOf = (s) => AREAS[(s - base + 4) % 4];
  const myTurn = mySeat >= 0 && r?.turn === mySeat && ['bidding', 'playing'].includes(table.phase);
  const [selected, setSelected] = useState(null);
  const [sending, setSending] = useState(false);
  const [peeked, setPeeked] = useState(null); // hand number whose cards I've looked at
  const [decksOpen, setDecksOpen] = useState(false);
  const [tvOpen, setTvOpen] = useState(false);
  const deck = useDeck();
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
  const dealing = useDealing(`${game.id}:${handNo}`, table.phase === 'bidding' && r?.bidsIn === 0);
  const bidTimer = table.settings.bidTimer ?? 0;
  const left = useCountdown(bidTimer && table.phase === 'bidding' ? `${handNo}:${r.turn}` : null, bidTimer, r?.bidsIn === 0 ? DEAL_MS : 0);
  const hurry = left != null && left <= 5;
  useEffect(() => { if (myTurn && table.phase === 'bidding' && left === 5) buzz([80, 60, 80]); }, [left === 5]);
  const blindOk = table.settings.rules.blindNilAllowed !== false;
  // Blind nil must be decided before looking, so a new hand starts face down until you choose.
  const coverCards = table.phase === 'bidding' && blindOk && mySeat >= 0 && !hasBid(table, mySeat) && peeked !== handNo;
  const legal = cards && table.phase === 'playing' && myTurn
    ? legalCards({ ...table, round: { ...r, hands: { [mySeat]: cards } } }, mySeat)
    : [];
  const sorted = cards ? sortHand(cards) : [];

  const canAct = table.phase === 'playing' && myTurn && !sending;
  const playCardNow = (card) => {
    if (!legal.includes(card)) return;
    setSelected(null);
    setSending(true);
    send('o-play', { card });
  };
  const play = () => { if (selected) playCardNow(selected); };
  const videoOf = (id) => (id === me.id ? call.local : call.videos.find((v) => v.peer.id === id)?.stream);
  const peerOf = (id) => room.peers.find((p) => p.id === id);
  const trickCards = showingLast ? r.lastTrick.cards : r?.trick ?? [];

  return (
    <>
      <header className="online-top">
        <div className="online-scores">
          {[0, 1].map((t) => (
            <div key={t} className={`online-team t${t}`} aria-label={game.teams[t].name}>
              <span>{game.teams[t].name}</span>
              <span className="team-faces">
                {SEATS.map((_, s) => s).filter((s) => teamOf(s) === t).map((s) => {
                  const who = table.seats[s];
                  return <Avatar key={s} value={who ? icons[who.id] : null} name={who?.name ?? '?'} bot={who?.bot} />;
                })}
              </span>
              <span className="team-score">
                <b><CountUp value={st[t].score} /></b>
                {game.rules.bagsEnabled && <small>{st[t].bags} bag{st[t].bags === 1 ? '' : 's'}</small>}
              </span>
            </div>
          ))}
        </div>
        <div className="online-meta">
          <span>Hand {handNo} · to {game.target}</span>
          <div className="row">
            {!tv && !call.joined && <button type="button" className="icon-btn round small" aria-label="Video chat" onClick={() => call.join()}><Icon name="video" size={18} /></button>}
            {!tv && !call.joined && <button type="button" className="icon-btn round small" aria-label="Audio chat" onClick={() => call.join({ audioOnly: true })}><Icon name="mic" size={18} /></button>}
            {!tv && <button type="button" className="icon-btn round small" aria-label="Add a TV" onClick={() => setTvOpen(true)}><Icon name="tv" size={18} /></button>}
            {!tv && <button type="button" className="icon-btn round small" aria-label="Cards and table" onClick={() => setDecksOpen(true)}><Icon name="cards" size={18} /></button>}
            {!tv && <button type="button" className="icon-btn round small" aria-label="Leave" onClick={onLeave}><Icon name="close" size={18} /></button>}
          </div>
        </div>
      </header>

      <div className="felt">
        <div className="table-oval" aria-hidden="true">
          <span className="table-logo">♠</span>
          {deck.verse && <p className="table-verse">“{deck.verse}”<small>{deck.verseRef}</small></p>}
        </div>
        {SEATS.map((_, s) => {
          const who = table.seats[s];
          const entry = seatEntry(hand, s);
          const away = who && !who.bot && !present.has(who.id);
          const turn = r?.turn === s && ['bidding', 'playing'].includes(table.phase);
          const stream = who && !who.bot ? videoOf(who.id) : null;
          const bidText = table.phase === 'bidding' && !hasBid(table, s) ? (turn ? 'bidding…' : '–')
            : isNil(entry.call) ? nilLabel(entry.call) : `bid ${entry.bid}`;
          const held = s !== mySeat && !dealing && table.phase !== 'scored' && table.phase !== 'over' ? r?.counts?.[s] ?? 0 : 0;
          return (
            <div key={s} className={`player-spot ${posOf(s)} t${teamOf(s)}${turn ? ' turn' : ''}${s === mySeat ? ' me' : ''}`}>
              {held > 0 && (
                <div className="spot-backs" aria-label={`${held} cards`}>
                  {Array.from({ length: Math.min(held, 7) }, (_, k) => <CardBack key={k} size="xs" style={{ '--k': k - (Math.min(held, 7) - 1) / 2 }} />)}
                  <span className="held-count">{held}</span>
                </div>
              )}
              <div className="avatar">
                {turn && left != null && (
                  <svg className={`bid-clock${hurry ? ' hurry' : ''}`} viewBox="0 0 100 100" aria-label={`${left} seconds to bid`}>
                    <circle cx="50" cy="50" r="46" pathLength="100" style={{ strokeDashoffset: 100 - (100 * left) / bidTimer }} />
                  </svg>
                )}
                {turn && left != null && <span className={`bid-secs${hurry ? ' hurry' : ''}`}>{left}</span>}
                {stream && (
                  <VideoTile stream={stream} muted={who.id === me.id || !call.speakerOn} mirrored={who.id === me.id}
                    micOff={who.id !== me.id && peerOf(who.id) && !peerOf(who.id).mic}
                    className={hasVideo(stream) && (who.id !== me.id || call.camOn) ? '' : 'no-video'} />
                )}
                {(!stream || !hasVideo(stream) || (who.id === me.id && !call.camOn)) && (
                  <Avatar value={who ? icons[who.id] : null} name={who?.name ?? '?'} bot={who?.bot} className="seat-icon" />
                )}
                {r?.dealer === s && <span className="dealer-chip">D</span>}
              </div>
              <div className="nameplate">
                <span className="spot-name">{s === mySeat ? 'You' : who?.name}</span>
                <span className="spot-score">
                  {table.phase === 'bidding' ? bidText : <>{entry.books}<small>/{isNil(entry.call) ? nilLabel(entry.call) : entry.bid}</small></>}
                </span>
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

        {dealing && <DealAnimation dealer={r.dealer} posOf={posOf} />}
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

      {call.joined && !tv && (
        <div className="online-call"><CallButtons call={call} size={18} /><SoundNote call={call} /></div>
      )}

      {/* This player's hand and controls */}
      {mySeat >= 0 && (
        <div className="hand-dock online-dock">
          <div className="dock-head">
            <span>{myTurn ? (table.phase === 'bidding' ? 'Your bid' : 'Your turn') : turnText(table)}
              {left != null && <b className={`dock-clock${hurry ? ' hurry' : ''}`}> · {left}s</b>}</span>
            <span>{cards ? `${cards.length} cards` : ''}</span>
          </div>
          {dealing ? (
            <p className="dock-hint">Dealing…</p>
          ) : coverCards ? (
            <div className="blind-choice">
              <p>New hand dealt. Thinking about <b>blind nil</b>? Decide before you look.</p>
              <div className="row">
                <button type="button" className="secondary" onClick={() => setPeeked(handNo)}>Look at my cards</button>
                {myTurn && <button type="button" className="primary" onClick={() => send('o-bid', { call: 'blind' })}>Blind nil</button>}
              </div>
              {!myTurn && <p className="small">You can bid blind nil when it’s your turn.</p>}
            </div>
          ) : cards ? (
            <FannedHand cards={sorted} selected={selected} dealKey={handNo}
              onSelect={canAct ? (c) => setSelected(c && legal.includes(c) ? c : null) : undefined}
              onPlay={canAct ? playCardNow : undefined} playable={legal}
              onRefuse={() => toast.show(refuseReason(table, cards))}
              dim={table.phase === 'playing' && myTurn ? sorted.filter((c) => !legal.includes(c)) : []} />
          ) : (
            <p className="dock-hint">Getting your cards…</p>
          )}
          <div className="dock-action">
            {myTurn && table.phase === 'bidding' && !coverCards && <BidPad onBid={(b) => send('o-bid', b)} />}
            {myTurn && table.phase === 'playing' && (selected
              ? <button type="button" className="primary big go" disabled={sending} onClick={play}>Play <CardText code={selected} /></button>
              : <p className="dock-hint">Swipe a card up to play it, or tap it. Dimmed cards can’t be played.</p>)}
          </div>
        </div>
      )}

      {decksOpen && <DeckPicker onClose={() => setDecksOpen(false)} />}
      {tvOpen && <Sheet title="Companion TV" short onClose={() => setTvOpen(false)} closeLabel="Done"><TvInviteCard code={code} /></Sheet>}
      {(table.phase === 'scored' || table.phase === 'over') && !showingLast && (
        <HandResult table={table} isHost={isHost} hostActions={hostActions} />
      )}
    </>
  );
}

/** Seconds left on a countdown that restarts whenever `key` changes (null: no countdown). */
function useCountdown(key, seconds, delayMs = 0) {
  const started = useRef({ key: undefined, at: 0 });
  if (started.current.key !== key) started.current = { key, at: Date.now() + delayMs };
  const start = started.current.at;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (key == null) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [key]);
  if (key == null || !seconds) return null;
  return Math.max(0, Math.ceil(seconds - (Math.max(now, start) - start) / 1000));
}

const hasVideo = (stream) => stream.getVideoTracks().length > 0;

/** Why a card can't be played right now, in words. */
function refuseReason(table, cards) {
  const r = table.round;
  if (!r.trick.length) return 'Spades aren’t broken yet: lead another suit.';
  const led = r.trick[0].card.slice(-1);
  const names = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' };
  return cards?.some((c) => c.slice(-1) === led) ? `You have to follow suit: play ${names[led]}.` : 'You can’t play that card.';
}
const CountUp = ({ value }) => useCountUp(value);

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
  const [statsOpen, setStatsOpen] = useState(false);
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
        {over && <button type="button" className="text-btn" onClick={() => setStatsOpen(true)}><Icon name="trophy" size={16} /> See everyone’s stats</button>}
        {statsOpen && <Stats onClose={() => setStatsOpen(false)} />}
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

// ---------------------------------------------------------------------------------------------
// Dealing: a riffle, then the cards fly out around the table, with sound.

/** True for a moment after a new hand arrives (not when you open the app mid-hand). */
function useDealing(key, fresh) {
  const [dealing, setDealing] = useState(false);
  const seen = useRef(null);
  useEffect(() => {
    if (seen.current === key) return;
    seen.current = key;
    if (!fresh) return;
    setDealing(true);
    dealSound({ delay: RIFFLE_MS / 1000 });
    setTimeout(() => setDealing(false), DEAL_MS); // not cleared: a re-render mustn't leave it dealing
  }, [key]);
  return dealing;
}

/** 52 card backs dealt one at a time, clockwise from the dealer's left, each landing on that player. */
function DealAnimation({ dealer, posOf }) {
  const box = useRef(null);
  const [to, setTo] = useState(null); // area -> [dx, dy] from the middle of the deal to that player
  const [jitter] = useState(() => Array.from({ length: 52 }, () => [Math.random() * 18 - 9, Math.random() * 14 - 7, Math.random() * 36 - 18]));
  useLayoutEffect(() => {
    const b = box.current.getBoundingClientRect();
    const zoom = b.width / box.current.offsetWidth || 1; // the TV is zoomed: measure in its own pixels
    const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
    const found = {};
    for (const area of AREAS) {
      const el = box.current.parentElement.querySelector(`.player-spot.${area} .avatar`);
      const r = el?.getBoundingClientRect();
      found[area] = r ? [(r.left + r.width / 2 - cx) / zoom, (r.top + r.height / 2 - cy) / zoom] : [0, 0];
    }
    setTo(found);
  }, []);
  return (
    <div className="deal-layer" ref={box} aria-hidden="true" style={{ '--riffle': `${RIFFLE_MS}ms`, '--gap': `${DEAL_GAP_MS}ms` }}>
      <div className="deal-deck">{[0, 1, 2, 3, 4].map((k) => <CardBack key={k} size="sm" style={{ '--k': k }} />)}</div>
      {to && jitter.map(([jx, jy, rot], i) => {
        const [dx, dy] = to[posOf((dealer + 1 + i) % 4)];
        return <CardBack key={i} size="sm" className="deal-card" style={{ '--i': i, '--tx': `${dx + jx}px`, '--ty': `${dy + jy}px`, '--rot': `${rot}deg` }} />;
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Companion TV: the table big on a TV, with everyone's video and sound.

const tvLink = (code) => joinLink(code, { as: 'otv' });

/** The TV draws the phone layout's sizes scaled up to fill the screen (laid out for a 720-high screen). */
function useTvFit(on) {
  const measure = () => {
    const zoom = Math.max(1, window.innerHeight / 720);
    return { zoom, height: window.innerHeight / zoom, minHeight: 0 };
  };
  const [fit, setFit] = useState(measure);
  useEffect(() => {
    if (!on) return undefined;
    const resize = () => setFit(measure());
    addEventListener('resize', resize);
    return () => removeEventListener('resize', resize);
  }, [on]);
  return on ? fit : undefined;
}

/** How to put the game on a TV: the address and code to type, or a link/QR for a laptop or iPad. */
function TvInviteCard({ code }) {
  const [qr, setQr] = useState(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => { QRCode.toDataURL(tvLink(code), { margin: 1, width: 240 }).then(setQr).catch(() => {}); }, [code]);
  return (
    <div className="card tv-invite">
      <p>Show the table big on a TV, with everyone’s video and sound. Your phone keeps your cards, camera and mic.</p>
      <ol>
        <li>On the TV’s web browser (or a laptop or iPad hooked up to it), go to <b>{location.host}</b></li>
        <li>Tap <b>Join a game</b> and type <b className="tv-code">{code}</b></li>
        <li>Pick <b>Show the table on this TV</b></li>
      </ol>
      <div className="row tv-invite-row">
        {qr && <img className="qr small" src={qr} alt="QR code to open the TV view" />}
        <button type="button" className="soft" onClick={() => navigator.clipboard?.writeText(tvLink(code)).then(() => setCopied(true)).catch(() => {})}>
          <Icon name="share" size={16} /> {copied ? 'TV link copied' : 'Copy TV link'}
        </button>
      </div>
      <p className="footnote">No TV? Everything works on the phone alone too.</p>
    </div>
  );
}

/** The TV before the game starts: the code to join with and who's sitting where. */
function TvLobby({ code, table, icons, onPlayHere }) {
  return (
    <div className="tv-lobby">
      <h1><span className="brand-mark">♠</span> Family Spades</h1>
      <p className="tv-lobby-code">Game <b>{code}</b></p>
      <div className="tv-lobby-seats">
        {SEATS.map((_, s) => {
          const who = table.seats[s];
          return (
            <div key={s} className={`tv-lobby-seat t${teamOf(s)}`}>
              {who ? <Avatar value={icons[who.id]} name={who.name} bot={who.bot} className="tv-lobby-avatar" /> : <span className="empty-seat">+</span>}
              <b>{who?.name ?? 'Open seat'}</b>
              <span>Team {teamOf(s) + 1}</span>
            </div>
          );
        })}
      </div>
      <p className="tv-lobby-wait">Waiting for the host to start the game…</p>
      <button type="button" className="tv-play-here" onClick={onPlayHere}><Icon name="users" size={16} /> Join as a player</button>
    </div>
  );
}

/** Small controls in the corner, and a note until a key press lets the TV play sound. */
function TvControls({ call, onLeave }) {
  const needsPress = useTvStart(call);
  return (
    <>
      <div className="tv-corner">
        <button type="button" onClick={call.toggleSpeaker} aria-label={call.speakerOn ? 'Turn sound off' : 'Turn sound on'}>
          <Icon name={call.speakerOn ? 'speaker' : 'speakerOff'} size={18} />
        </button>
        <button type="button" onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})} aria-label="Full screen">
          <Icon name="expand" size={18} />
        </button>
        <button type="button" onClick={() => { if (confirm('Close the TV view?')) onLeave(); }} aria-label="Close TV view">
          <Icon name="close" size={18} />
        </button>
      </div>
      {needsPress && <SoundPrompt />}
    </>
  );
}
