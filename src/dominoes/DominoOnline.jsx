// Dominoes online: everyone on their own phone, like Spades online. The host's device runs the game
// (engine.js), sends everyone the table (no hands, just counts) and each player their own tiles, locked for
// their device. Players send moves; the host checks them. Computer players fill empty seats.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { read, write, tabRead, tabWrite } from '../lib/store.js';
import { useRoom, joinLink } from '../lib/room.js';
import { useDevice } from '../lib/device.js';
import { useKeys, seal, unseal } from '../lib/secret.js';
import { useWakeLock, buzz, dealSound, cardSound, setSoundSetting, useSoundSettings } from '../lib/fx.js';
import { useCall } from '../lib/call.js';
import { useTurnAlerts, sendTurnAlert, alertPermission } from '../lib/push.js';
import { saveGame, forgetSaved } from '../lib/saved.js';
import { nameKey } from '../lib/stats.js';
import { VideoTile, CallButtons, SoundNote } from '../Video.jsx';
import DeckPicker from '../DeckPicker.jsx';
import { ConnectionBanner, ReactSheet, ReactionsLayer, TableMenu, SpeakingRings, MyCallButtons, useTvFit, TvControls, TvInviteCard } from '../OnlineApp.jsx';
import { useDeck } from '../lib/decks.js';
import { pickBotNames } from '../lib/bots.js';
import { Avatar, ProfileEditor } from '../Avatar.jsx';
import { loadName, saveName, loadAvatar, saveAvatar, useAvatars } from '../lib/profile.js';
import { Icon, Segmented, Toggle, useToast, Confetti, Sheet } from '../components.jsx';
import Domino from './Domino.jsx';
import { boardLayout } from './board.js';
import {
  VARIANTS, SETS, halves, newDominoTable, startMatch, deal, legalMoves, playTile, drawTile, pass, publicTable, botMove, openEnds,
} from './engine.js';

const ID_KEY = 'spades-device-id'; // the same device id as Spades online, so a reload rejoins the same seat
const TV_ID_KEY = 'spades-tv-id'; // a TV keeps its own, so it's never mistaken for a player
const REACTION_MS = 3200;
const AWAY_STAND_IN_MS = 20000; // someone gone this long on their turn: the computer plays for them
const TURN_ALERT_AFTER_MS = 3000;
const BOT_DELAY_MS = 1100;
const NEXT_HAND_MS = 7000;
const RESYNC_MS = 5000;
const LAST_KEY = 'dominoes-last-online';

function stableId(key = ID_KEY) {
  let id = tabRead(key);
  if (!id) id = Math.random().toString(36).slice(2, 10);
  tabWrite(key, id);
  return id;
}

/** Name and icon first (shared with Spades), then the game room. */
export default function DominoOnline({ code, isHost, tv = false, onLeave }) {
  const [name, setName] = useState(loadName);
  const [avatar, setAvatar] = useState(loadAvatar);
  const [named, setNamed] = useState(() => Boolean(loadName()));
  if (tv) return <DominoRoom code={code} tv name="TV" avatar={null} onLeave={onLeave} />;
  if (!named) {
    return (
      <div className="app">
        <header className="hero"><div className="wrap hero-row"><div className="brand"><span className="brand-mark">🁫</span><h1>Dominoes</h1></div></div></header>
        <main className="wrap">
          <form className="card waiting-card profile-card" onSubmit={(e) => { e.preventDefault(); if (name.trim()) { saveName(name.trim()); setNamed(true); } }}>
            <h2>Who’s playing?</h2>
            <p className="muted">Everyone at the table sees your name and icon.</p>
            <ProfileEditor name={name} avatar={avatar} onName={setName} onAvatar={(v) => { setAvatar(v); saveAvatar(v); }} autoFocus={!name} />
            <button type="submit" className="primary big go" disabled={!name.trim()}>Continue</button>
            <button type="button" className="text-btn" onClick={onLeave}>Cancel</button>
          </form>
        </main>
      </div>
    );
  }
  return <DominoRoom code={code} isHost={isHost} name={name.trim()} avatar={avatar} onLeave={onLeave} />;
}

function DominoRoom({ code, isHost = false, tv = false, name, avatar, onLeave }) {
  const keys = useKeys();
  const [deviceId] = useState(() => stableId(tv ? TV_ID_KEY : ID_KEY));
  // (the TV uses the same role as a Spades TV, so video chat treats it the same: it plays everyone's sound)
  const [me, setMe] = useDevice(code, { role: isHost ? 'dhost' : tv ? 'otv' : 'dplayer', name, id: deviceId, pub: keys?.pub ?? null });
  const toast = useToast();
  const [view, setView] = useState(null);
  const viewRef = useRef(null);
  const [myTiles, setMyTiles] = useState(null); // { hand: hand number, tiles }
  const [closed, setClosed] = useState(null);
  // Emojis and gifts on their way across the table (the same picker and animations as Spades)
  const [reactions, setReactions] = useState([]);
  const addReaction = (x) => {
    const id = Math.random().toString(36).slice(2);
    setReactions((list) => [...list.slice(-12), { ...x, id }]);
    setTimeout(() => setReactions((list) => list.filter((y) => y.id !== id)), REACTION_MS);
  };
  const lastReaction = useRef(0);
  const mySeatRef = useRef(-1);
  const react = (to, item, gift) => {
    if (Date.now() - lastReaction.current < 1000 || mySeatRef.current < 0) return;
    lastReaction.current = Date.now();
    room.send({ type: 'd-react', to, item, gift });
    addReaction({ from: mySeatRef.current, to, item, gift });
  };

  // ----- Host: runs the game -----
  const tableKey = `dominoes-online-table-${code}`;
  const [table, setTable] = useState(() => (isHost ? read(tableKey) ?? newDominoTable() : null));
  useEffect(() => { if (isHost) write(tableKey, table); }, [isHost, table]);
  useEffect(() => { if (!tv) write(LAST_KEY, { code, host: isHost, at: Date.now() }); }, [code, isHost, tv]);
  const tableRef = useRef(table);
  tableRef.current = table;
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

  const room = useRoom(code, me, onMessage);
  const call = useCall({ room, me, setMe, facing: 'user', receiveOnly: tv });
  const [icons] = useAvatars(room, me, avatar);
  const hostPeer = isHost ? null : room.peers.find((p) => p.role === 'dhost');
  const hostRef = useRef(hostPeer);
  hostRef.current = hostPeer;
  const seatOf = (t, id) => (t?.seats ?? []).findIndex((s) => s && !s.bot && s.id === id);

  function onMessage(m, from) {
    if (m.type === 'rtc') { call.handle(m); return; }
    if (m.type === 'd-react') {
      const t = tableRef.current ?? viewRef.current;
      const seatFrom = from && t ? seatOf(t, from.id) : -1;
      if (seatFrom >= 0) addReaction({ from: seatFrom, to: m.to, item: String(m.item).slice(0, 8), gift: Boolean(m.gift) });
      return;
    }
    if (isHost) {
      if (!from) return;
      if (m.type === 'd-alerts') { if (m.sub?.endpoint) pushSubs.current[from.id] = m.sub; else delete pushSubs.current[from.id]; return; }
      if (m.type === 'd-vis') { if (m.visible) awayIds.current.delete(from.id); else awayIds.current.add(from.id); return; }
      const t = tableRef.current;
      const seat = seatOf(t, from.id);
      let error = null;
      if (m.type === 'd-hello') {
        // Back (maybe on another phone or browser): an away seat with their name is theirs again
        const back = seat < 0 && t.phase !== 'lobby' && from.role === 'dplayer' ? awaySeatNamed(t, from.name, room.peers, me.id) : -1;
        if (back >= 0) act((x) => ({ ...x, seats: x.seats.map((y, i) => (i === back ? { ...y, id: from.id, standIn: false } : y)) }));
        else if (seat >= 0 && t.seats[seat].standIn) act((x) => ({ ...x, seats: x.seats.map((y, i) => (i === seat ? { ...y, standIn: false } : y)) }));
        else sendAll(t, from);
      }
      else if (m.type === 'd-sit') error = act((x) => sit(x, m.seat, { id: from.id, name: String(m.name || from.name || 'Player').slice(0, 14) }));
      else if (m.type === 'd-stand') error = act((x) => ({ ...x, seats: x.seats.map((s) => (s?.id !== from.id ? s : x.phase === 'lobby' ? null : { ...s, standIn: true })) }));
      else if (seat >= 0 && m.type === 'd-play') error = act((x) => (handNo(x) === m.hand ? playTile(x, seat, m.tile, m.arm) : x));
      else if (seat >= 0 && m.type === 'd-draw') error = act((x) => (handNo(x) === m.hand ? drawTile(x, seat) : x));
      else if (seat >= 0 && m.type === 'd-pass') error = act((x) => (handNo(x) === m.hand ? pass(x, seat) : x));
      if (error) room.send({ type: 'd-error', text: error }, from.id);
      return;
    }
    if (from?.role !== 'dhost') return;
    if (m.type === 'd-table') { viewRef.current = m.table; setView(m.table); }
    else if (m.type === 'd-hand' && keys && hostRef.current?.pub) unseal(keys, hostRef.current.pub, m.box).then((tiles) => setMyTiles({ hand: m.hand, tiles })).catch(() => {});
    else if (m.type === 'd-error') toast.show(m.text);
    else if (m.type === 'd-closed') { setClosed({ by: m.by, saved: Boolean(m.saved) }); call.leave(); }
  }

  /** Host: everyone gets the table; each seated player their own tiles, locked for their device. */
  const sendAll = useCallback(async (t, only) => {
    if (!t) return;
    const pub = publicTable(t);
    for (const p of only ? [only] : room.peers) {
      room.send({ type: 'd-table', table: pub }, p.id);
      const seat = seatOf(t, p.id);
      if (seat >= 0 && t.round?.hands && keys && p.pub) {
        const box = await seal(keys, p.pub, t.round.hands[seat]);
        room.send({ type: 'd-hand', hand: handNo(t), box }, p.id);
      }
    }
  }, [room.peers, keys]);
  const peerKey = room.peers.map((p) => `${p.id}:${p.pub ?? ''}`).join(',');
  useEffect(() => { if (isHost) sendAll(table); }, [isHost, table, peerKey, keys]);
  useEffect(() => {
    if (!isHost) return undefined;
    const timer = setInterval(() => sendAll(tableRef.current), RESYNC_MS);
    return () => clearInterval(timer);
  }, [isHost, sendAll]);
  useEffect(() => { if (!isHost && hostPeer) room.send({ type: 'd-hello' }, hostPeer.id); }, [isHost, hostPeer?.id, hostPeer?.pub, me.pub]);

  // Host: computer players (and stand-ins for anyone who left) take their turns; the next hand deals itself.
  const present = new Set([me.id, ...room.peers.map((p) => p.id)]);
  const autoSeat = (t, s) => t.seats[s]?.bot || (t.seats[s] && t.seats[s].standIn && !present.has(t.seats[s].id));
  // Someone who's gone (closed the app, lost signal) on their turn for a while: the computer plays for them
  // until they're back (they get their seat back as soon as they reconnect).
  const awayTurn = isHost && table?.phase === 'playing' && table.seats[table.round.turn] && !table.seats[table.round.turn].bot
    && !table.seats[table.round.turn].standIn && !present.has(table.seats[table.round.turn].id) ? table.round.turn : null;
  useEffect(() => {
    if (awayTurn == null) return undefined;
    const timer = setTimeout(() => act((x) => ({ ...x, seats: x.seats.map((y, i) => (i === awayTurn && y && !present.has(y.id) ? { ...y, standIn: true } : y)) })), AWAY_STAND_IN_MS);
    return () => clearTimeout(timer);
  }, [awayTurn, peerKey]);

  // ----- Turn alerts (as in Spades): a buzz on your phone when it's your turn and the app isn't on screen -----
  const alerts = useTurnAlerts();
  const pushSubs = useRef({});
  const awayIds = useRef(new Set());
  useEffect(() => {
    if (!isHost && !tv && hostPeer) room.send({ type: 'd-alerts', sub: alerts.on ? alerts.sub : null }, hostPeer.id);
  }, [isHost, tv, hostPeer?.id, alerts.on, alerts.sub?.endpoint]);
  useEffect(() => {
    if (isHost || tv) return undefined;
    const tell = () => { if (hostRef.current) room.send({ type: 'd-vis', visible: document.visibilityState === 'visible' }, hostRef.current.id); };
    document.addEventListener('visibilitychange', tell);
    return () => document.removeEventListener('visibilitychange', tell);
  }, [isHost, tv]);
  const alertKey = isHost && table?.phase === 'playing' ? `${handNo(table)}:${table.round.moves}:${table.round.turn}` : null;
  useEffect(() => {
    if (alertKey == null) return undefined;
    const who = table.seats[table.round.turn];
    if (!who || who.bot || who.standIn || who.id === me.id || !pushSubs.current[who.id]) return undefined;
    const timer = setTimeout(() => {
      const now = tableRef.current;
      if (now.phase !== 'playing' || `${handNo(now)}:${now.round.moves}:${now.round.turn}` !== alertKey) return;
      const away = awayIds.current.has(who.id) || !room.peers.some((p) => p.id === who.id);
      if (!away) return;
      sendTurnAlert(pushSubs.current[who.id], { title: 'Family Games', body: `${who.name}, it’s your turn in Dominoes`, tag: `turn-${code}` })
        .then((res) => { if (res.gone) delete pushSubs.current[who.id]; });
    }, TURN_ALERT_AFTER_MS);
    return () => clearTimeout(timer);
  }, [alertKey]);
  useEffect(() => {
    if (!isHost || !table) return undefined;
    if (table.phase === 'scored') {
      const timer = setTimeout(() => act((x) => (x.phase === 'scored' ? deal(x) : x)), NEXT_HAND_MS);
      return () => clearTimeout(timer);
    }
    if (table.phase !== 'playing') return undefined;
    const s = table.round.turn;
    if (!autoSeat(table, s)) return undefined;
    const timer = setTimeout(() => act((x) => {
      if (x.phase !== 'playing' || x.round.turn !== s) return x;
      const m = botMove(x, s);
      return m.type === 'play' ? playTile(x, s, m.tile, m.arm) : m.type === 'draw' ? drawTile(x, s) : pass(x, s);
    }), BOT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isHost, table, peerKey]);

  const shown = isHost ? (table ? publicTable(table) : null) : view;
  const mySeat = shown ? seatOf(shown, me.id) : -1;
  mySeatRef.current = mySeat;
  const tiles = isHost ? (mySeat >= 0 ? table?.round?.hands?.[mySeat] ?? null : null) : (myTiles && shown?.round && myTiles.hand === handNo(shown) ? myTiles.tiles : null);
  useWakeLock(Boolean(shown && shown.phase !== 'lobby'));
  const tvFit = useTvFit(tv);

  /** Send a move to the host (or make it, on the host). */
  const send = (type, body = {}) => {
    if (isHost) {
      const fn = { 'd-play': (x) => playTile(x, mySeat, body.tile, body.arm), 'd-draw': (x) => drawTile(x, mySeat), 'd-pass': (x) => pass(x, mySeat) }[type];
      const err = act(fn);
      if (err) toast.show(err);
      return;
    }
    room.send({ type, ...body, hand: handNo(shown) }, hostPeer?.id);
  };

  const leave = () => {
    if (isHost && !confirm(shown?.phase === 'lobby' ? 'Close this game for everyone?' : 'End this game for everyone?')) return;
    call.leave();
    if (!isHost) { room.send({ type: 'd-stand' }, hostPeer?.id); onLeave(); return; }
    write(tableKey, null);
    forgetSaved(`dominoes-${code}`);
    write(LAST_KEY, null);
    room.send({ type: 'd-closed', by: name });
    setTimeout(() => room.send({ type: 'd-closed', by: name }), 250);
    setTimeout(onLeave, 500);
  };
  // Host: save for later. The game stays on this phone and goes on the Dominoes home screen's Saved games list.
  const saveForLater = () => {
    if (!confirm(`Save this game for later? Everyone goes back to the home screen. Start it again from Saved games on this phone, and everyone can rejoin with code ${code}.`)) return;
    const t = tableRef.current;
    saveGame({
      id: `dominoes-${code}`, kind: 'dominoes', code,
      teams: t.match.scores.map((score, i) => ({ name: sideName(t, i), players: [], score })),
      hands: t.match.hands.length, target: t.settings.target,
    });
    call.leave();
    write(LAST_KEY, null);
    room.send({ type: 'd-closed', by: name, saved: true });
    setTimeout(() => room.send({ type: 'd-closed', by: name, saved: true }), 250);
    setTimeout(onLeave, 500);
  };

  if (closed) {
    return (
      <div className="app game-ended"><main className="wrap"><div className="card waiting-card ended-card">
        <span className="brand-mark">🁫</span><h2>{closed.saved ? `${closed.by ?? 'The host'} saved the game for later` : closed.by ? `${closed.by} closed the game` : 'The game has ended'}</h2>
        {closed.saved && <p className="muted">When they start it again, join with code <b>{code}</b> and you’ll get your seat back.</p>}
        <button type="button" className="primary big go" onClick={onLeave}>Back to home</button>
      </div></main></div>
    );
  }
  if (!shown) {
    return (
      <div className="app"><main className="wrap"><div className="card waiting-card">
        <h2>Joining game {code}…</h2>
        <p className="muted">Waiting for the host’s phone.</p>
        <button type="button" className="text-btn" onClick={onLeave}>Cancel</button>
      </div></main></div>
    );
  }

  if (tv) {
    return (
      <div className={`app online dominoes tv-mode${shown.phase === 'lobby' ? '' : ' at-table'}`} style={tvFit}>
        {shown.phase === 'lobby'
          ? <div className="dom-tv-wait"><h1>Dominoes · game {code}</h1><p>Waiting for the host to start…</p></div>
          : <DominoTable table={shown} mySeat={-1} tiles={null} icons={icons} isHost={false} send={() => {}} act={act} onLeave={onLeave}
              call={call} me={me} reactions={reactions} tv />}
        <TvControls call={call} onLeave={() => { call.leave(); onLeave(); }} view={null} onView={() => {}} />
      </div>
    );
  }

  return (
    <div className={`app online dominoes${shown.phase === 'lobby' ? '' : ' at-table'}`}>
      {shown.phase === 'lobby'
        ? <DominoLobby code={code} table={shown} isHost={isHost} me={me} icons={icons} act={act}
            onSit={(s) => { if (!isHost) { room.send({ type: 'd-sit', seat: s, name }, hostPeer?.id); return; } const e = act((x) => sit(x, s, { id: me.id, name })); if (e) toast.show(e); }}
            onStand={() => (isHost ? act((x) => ({ ...x, seats: x.seats.map((s) => (s?.id === me.id ? null : s)) })) : room.send({ type: 'd-stand' }, hostPeer?.id))}
            onStart={() => { const e = act((x) => startMatch(x)); if (e) toast.show(e); }} onLeave={leave} />
        : <DominoTable table={shown} mySeat={mySeat} tiles={tiles} icons={icons} isHost={isHost} send={send} act={act} onLeave={leave}
            call={call} me={me} code={code} reactions={reactions} react={react} alerts={alerts} toast={toast} onSave={isHost ? saveForLater : null} />}
      <ConnectionBanner room={room} isHost={isHost} hostPeer={hostPeer} onLeave={onLeave} />
      {toast.node}
    </div>
  );
}

const handNo = (t) => t?.match?.hands.length ?? 0;

/** The seat of a player who isn't here and goes by `name` (-1 if none): someone back on a new device. */
function awaySeatNamed(t, name, peers, hostId) {
  if (!name) return -1;
  const here = new Set([hostId, ...peers.map((p) => p.id)]);
  return t.seats.findIndex((x) => x && !x.bot && !here.has(x.id) && nameKey(x.name) === nameKey(name));
}

function sit(t, seat, who) {
  if (t.phase !== 'lobby') throw new Error('Seats are set while the game is on.');
  if (t.seats[seat] && t.seats[seat].id !== who.id && !t.seats[seat].bot) throw new Error('Someone is sitting there.');
  const seats = t.seats.map((s) => (s?.id === who.id ? null : s));
  seats[seat] = { id: who.id, name: who.name };
  return { ...t, seats };
}

/** Change the number of players, keeping whoever is already sitting. */
function setPlayers(t, n) {
  const kept = t.seats.filter(Boolean).slice(0, n);
  const seats = Array.from({ length: n }, (_, i) => kept[i] ?? null);
  return { ...t, seats, settings: { ...t.settings, teams: t.settings.teams && n === 4 } };
}

// ---------- Lobby ----------

function DominoLobby({ code, table, isHost, me, icons, act, onSit, onStand, onStart, onLeave }) {
  const { settings } = table;
  const mine = table.seats.findIndex((s) => s?.id === me.id);
  const full = table.seats.every(Boolean);
  const link = joinLink(code);
  const set = (patch) => act((t) => ({ ...t, settings: { ...t.settings, ...patch } }));
  const addBot = (seat) => act((t) => {
    const used = new Set(t.seats.filter(Boolean).map((s) => s.name));
    const seats = [...t.seats];
    seats[seat] = { id: `bot-${seat}-${Date.now()}`, name: pickBotNames(used, 1)[0] ?? 'Computer', bot: true };
    return { ...t, seats };
  });
  const fillBots = () => act((t) => {
    const used = new Set(t.seats.filter(Boolean).map((s) => s.name));
    const free = pickBotNames(used, t.seats.length);
    return { ...t, seats: t.seats.map((s, i) => s ?? { id: `bot-${i}-${Date.now()}`, name: free.shift() ?? 'Computer', bot: true }) };
  });
  return (
    <>
      <header className="hero">
        <div className="wrap hero-row">
          <div className="brand"><span className="brand-mark">🁫</span><h1>Dominoes</h1></div>
          <button type="button" className="icon-btn round" aria-label="Leave" onClick={onLeave}><Icon name="close" /></button>
        </div>
        <p className="wrap muted-light">Game {code}{isHost ? ' · You’re the host' : ''}</p>
      </header>
      <main className="wrap dom-lobby">
        <div className="section-title">Game</div>
        <div className="card group">
          {isHost ? (
            <>
              <div className="field-block"><span>Rules</span>
                <Segmented value={settings.variant} onChange={(v) => set({ variant: v, target: VARIANTS[v].target })}
                  options={Object.entries(VARIANTS).map(([id, v]) => ({ id, label: v.name }))} />
              </div>
              <div className="field-block"><span>Set</span>
                <Segmented value={settings.setMax} onChange={(v) => set({ setMax: v })} options={SETS.map((m) => ({ id: m, label: `Double ${m}` }))} />
              </div>
              <div className="field-block"><span>Players</span>
                <Segmented value={table.seats.length} onChange={(n) => act((t) => setPlayers(t, n))} options={[2, 3, 4].map((n) => ({ id: n, label: String(n) }))} />
              </div>
              {table.seats.length === 4 && <Toggle label="Teams of two (partners across)" checked={settings.teams} onChange={(v) => set({ teams: v })} />}
              <div className="field-block"><span>Play to</span>
                <Segmented value={settings.target} onChange={(v) => set({ target: v })} options={[100, 150, 200, 250].map((n) => ({ id: n, label: String(n) }))} />
              </div>
            </>
          ) : (
            <p className="dom-rules-line">{VARIANTS[settings.variant].name} · Double {settings.setMax} · {settings.teams ? 'Teams' : 'Each for themselves'} · to {settings.target}</p>
          )}
        </div>
        <p className="footnote">{RULES_NOTE[settings.variant]}</p>

        <div className="section-title">Seats</div>
        <div className={`dom-seats n${table.seats.length}`}>
          {table.seats.map((s, i) => (
            <div key={i} className={`card dom-seat${settings.teams ? ` t${i % 2}` : ''}${s?.id === me.id ? ' mine' : ''}`}>
              {s ? <Avatar value={icons[s.id]} name={s.name} bot={s.bot} className="lobby-avatar" /> : <span className="dom-empty">+</span>}
              <b>{s ? (s.id === me.id ? 'You' : s.name) : `Seat ${i + 1}`}</b>
              {settings.teams && <small>Team {i % 2 + 1}</small>}
              {!s && <button type="button" className="soft small" onClick={() => onSit(i)}>Sit here</button>}
              {!s && isHost && <button type="button" className="text-btn small" onClick={() => addBot(i)}>Add computer</button>}
              {s?.id === me.id && <button type="button" className="text-btn small" onClick={onStand}>Stand up</button>}
              {s?.bot && isHost && <button type="button" className="text-btn small" onClick={() => act((t) => ({ ...t, seats: t.seats.map((x, j) => (j === i ? null : x)) }))}>Remove</button>}
            </div>
          ))}
        </div>
        {mine < 0 && <p className="muted center">Tap “Sit here” to take a seat.</p>}

        <div className="section-title">Invite</div>
        <div className="card dom-invite">
          <div className="dom-code">{code.split('').map((c) => <span key={c + Math.random()}>{c}</span>)}</div>
          <p className="muted small">Family Games → Dominoes → Join a game, and type this code. Or send the link:</p>
          <button type="button" className="soft" onClick={() => { if (navigator.share) navigator.share({ title: 'Dominoes', url: link }).catch(() => {}); else navigator.clipboard?.writeText(link); }}>
            <Icon name="share" size={18} /> Share the link
          </button>
        </div>
        {isHost && (
          <div className="dom-start">
            {!full && <button type="button" className="secondary big" onClick={fillBots}>Fill empty seats with computer players</button>}
            <button type="button" className="primary big go" disabled={!full} onClick={onStart}>Start game</button>
          </div>
        )}
        {!isHost && <p className="muted center">The host starts the game.</p>}
      </main>
    </>
  );
}

const RULES_NOTE = {
  draw: 'Match a number on either end. Can’t play? Draw from the boneyard until you can. First out scores everyone else’s pips.',
  block: 'Match a number on either end. Can’t play? You pass (no drawing). First out scores everyone else’s pips; if nobody can play, the lowest hand wins.',
  allfives: 'Like Draw, but the first double is a spinner (play off all four sides), and whenever the ends add up to 5, 10, 15… you score that many.',
};

// ---------- The table ----------

// Where each seat sits around the table, from your seat (you're always at the bottom).
const AROUND = { 2: ['bottom', 'top'], 3: ['bottom', 'left', 'right'], 4: ['bottom', 'left', 'top', 'right'] };

function DominoTable({ table, mySeat, tiles, icons, isHost, send, act, onLeave, call, me, code, reactions = [], react, alerts, toast, onSave, tv = false }) {
  const r = table.round;
  const deck = useDeck();
  const sound = useSoundSettings();
  const [callOpen, setCallOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [tvOpen, setTvOpen] = useState(false);
  const [decksOpen, setDecksOpen] = useState(false);
  const [reactTo, setReactTo] = useState(null);
  const [lastTest, setLastTest] = useState(null);
  const canReact = Boolean(react) && mySeat >= 0;
  const tapSeat = (s) => { if (canReact && table.seats[s]) setReactTo(s); };
  const videoOf = (id) => (id === me.id ? call.local : call.videos.find((v) => v.peer.id === id)?.stream);
  const hasVideo = (stream) => stream.getVideoTracks().length > 0;
  const testAlert = () => {
    const perm = alertPermission();
    if (perm !== 'granted') { setLastTest(`notifications are ${perm}`); toast.show(`Notifications are ${perm === 'denied' ? 'blocked' : 'not allowed yet'}: allow them in Settings → Notifications.`); return; }
    if (!alerts.sub) { alerts.retry().then((why) => { setLastTest(why ?? 'signed up: try the test again'); toast.show(why ?? 'Signed up: tap Send a test alert again.'); }); return; }
    toast.show('Test alert on its way: lock your phone or go to the home screen');
    setLastTest('sending…');
    sendTurnAlert(alerts.sub, { body: 'Test: this is your turn alert', tag: 'test', delay: 6 }).then((x) => { setLastTest(x.why); toast.show(x.why); });
  };
  const menu = [
    call.joined
      ? { icon: 'video', label: 'Video chat settings', onClick: () => setCallOpen(true) }
      : { icon: 'video', label: 'Join A/V Chat', onClick: () => setJoinOpen(true) },
    { icon: 'tv', label: 'Add a TV', onClick: () => setTvOpen(true) },
    { icon: 'cards', label: 'Table theme', onClick: () => setDecksOpen(true) },
    alerts && {
      icon: 'bell', label: 'Turn alerts', on: alerts.on,
      note: isHost ? 'Not for the host’s phone (it runs the game)'
        : alerts.why && !alerts.on ? 'Open the app from your Home Screen first'
        : alerts.on && !alerts.sub ? (alerts.problem ?? 'Signing this phone up…')
        : 'Buzz when it’s your turn, even in the background',
      onClick: () => {
        if (isHost) { toast.show('The host’s phone runs the game, so it can’t get alerts. Join from another device as a player to get them.'); return; }
        alerts.toggle().then((err) => { if (err) toast.show(err); });
      },
    },
    alerts && alerts.on && !isHost && {
      icon: 'bell', label: 'Send a test alert',
      note: lastTest ? `Last test: ${lastTest}` : alerts.sub ? 'Arrives in about 6 seconds: lock your phone' : 'This phone isn’t signed up yet',
      onClick: testAlert,
    },
    { icon: sound.effects ? 'speaker' : 'speakerOff', label: 'Sound effects', on: sound.effects, onClick: () => setSoundSetting('effects', !sound.effects) },
    onSave && { icon: 'home', label: 'Save for later', note: 'Pick it up again from the Dominoes home screen', onClick: onSave },
    { icon: 'close', label: isHost ? 'End game' : 'Leave game', danger: true, onClick: onLeave },
  ];
  const n = table.seats.length;
  const base = mySeat >= 0 ? mySeat : 0;
  const posOf = (s) => AROUND[n][(s - base + n) % n];
  const myTurn = table.phase === 'playing' && r?.turn === mySeat;
  const [selected, setSelected] = useState(null);
  const moves = useMemo(() => (myTurn && tiles ? movesFor(table, mySeat, tiles) : []), [table, mySeat, tiles, myTurn]);
  const playable = new Set(moves.map((m) => m.tile));
  const forSelected = moves.filter((m) => m.tile === selected);
  useEffect(() => { if (!myTurn) setSelected(null); }, [myTurn]);
  useEffect(() => { if (myTurn) buzz(60); }, [myTurn, r?.moves]);

  // sounds: the deal, and each tile landing
  const dealtAt = r?.dealtAt;
  useEffect(() => { if (dealtAt && Date.now() - dealtAt < 3000) dealSound(); }, [dealtAt]);
  const lastAt = r?.last?.tile ? r.last.at : null;
  useEffect(() => { if (lastAt && Date.now() - lastAt < 2000) cardSound(); }, [lastAt]);

  const sides = table.match ? table.match.scores.map((score, i) => ({ score, name: sideName(table, i) })) : [];
  const counts = r?.counts ?? r?.hands?.map((h) => h.length) ?? [];
  const boneyard = r?.boneyardCount ?? r?.boneyard?.length ?? 0;

  const play = (tile, arm) => { setSelected(null); send('d-play', { tile, arm }); };
  const tapTile = (t) => {
    if (!myTurn || !playable.has(t)) { setSelected(t === selected ? null : t); return; }
    const options = moves.filter((m) => m.tile === t);
    // one place it can go: play it straight away on a second tap (first tap picks it up)
    if (selected === t && options.length === 1) { play(t, options[0].arm); return; }
    setSelected(t);
  };

  return (
    <>
      <header className="online-top dom-top">
        <div className="dom-scores">
          {sides.map((s, i) => (
            <div key={i} className={`dom-score${table.settings.teams ? ` t${i}` : ''}`}>
              <span>{s.name}</span><b>{s.score}</b>
            </div>
          ))}
        </div>
        <div className="online-meta">
          <span>{VARIANTS[table.settings.variant].name} · to {table.settings.target}</span>
          {!tv && <TableMenu items={menu} />}
        </div>
      </header>

      <div className="felt dom-felt">
        <div className="table-oval" aria-hidden="true" />
        <Board table={table} selectedMoves={forSelected} onEnd={(arm) => play(selected, arm)} maxUnit={tv ? 60 : 38} />
        {table.seats.map((who, s) => (
          <div key={s} className={`player-spot ${posOf(s)}${table.settings.teams ? ` t${s % 2}` : ''}${r?.turn === s && table.phase === 'playing' ? ' turn' : ''}${s === mySeat ? ' me' : ''}`}>
            {(() => {
              const stream = who && !who.bot ? videoOf(who.id) : null;
              const showVideo = stream && hasVideo(stream) && (who.id !== me.id || call.camOn);
              return (
                <div className={`avatar${canReact && who && s !== mySeat ? ' tappable' : ''}`} data-seat={s} onClick={() => tapSeat(s)}>
                  {stream && <VideoTile stream={stream} muted={who.id === me.id || !call.speakerOn} mirrored={who.id === me.id} className={showVideo ? '' : 'no-video'} />}
                  {!showVideo && (
                    <>
                      <Avatar value={who ? icons[who.id] : null} name={who?.name ?? '?'} bot={who?.bot} className="seat-icon" />
                      {stream && <SpeakingRings stream={stream} />}
                    </>
                  )}
                </div>
              );
            })()}
            <div className="nameplate">
              <span className="spot-name">{s === mySeat ? 'You' : who?.name}</span>
              <span className="spot-score dom-count" title="Tiles in hand">{counts[s] ?? 0}</span>
            </div>
            {s === mySeat && call.joined && <MyCallButtons call={call} onMore={() => setCallOpen(true)} />}
            {who && who.standIn && <div className="away">computer playing</div>}
            {r?.last?.seat === s && (r.last.passed || r.last.drew) && Date.now() - r.last.at < 4000 && <span className="dom-said">{r.last.passed ? 'Pass' : 'Drew'}</span>}
          </div>
        ))}
        {VARIANTS[table.settings.variant].draws && table.phase === 'playing' && <div className="dom-boneyard"><Domino a={0} b={0} faceDown size={34} /> {boneyard}</div>}
        {r?.events?.length > 0 && <FivesPop key={r.events.length} event={r.events.at(-1)} table={table} />}
        <ReactionsLayer reactions={reactions} names={table.seats.map((w, s) => (s === mySeat ? 'You' : w?.name))} />
      </div>

      {call.joined && !tv && mySeat < 0 && (
        <div className="online-call watching"><CallButtons call={call} size={18} /><SoundNote call={call} /></div>
      )}
      {callOpen && call.joined && (
        <Sheet title="Video chat" short onClose={() => setCallOpen(false)} closeLabel="Done">
          <div className="call-sheet">
            <CallButtons call={{ ...call, leave: () => { setCallOpen(false); call.leave(); } }} size={22} />
            <SoundNote call={call} />
          </div>
        </Sheet>
      )}
      {joinOpen && !call.joined && (
        <Sheet title="Video chat" short onClose={() => setJoinOpen(false)} closeLabel="Cancel">
          <div className="blind-confirm">
            <button type="button" className="primary big" onClick={() => { setJoinOpen(false); call.join(); }}><Icon name="video" /> Video and audio</button>
            <button type="button" className="secondary big" onClick={() => { setJoinOpen(false); call.join({ audioOnly: true }); }}><Icon name="mic" /> Audio only</button>
          </div>
        </Sheet>
      )}
      {tvOpen && <Sheet title="Companion TV" short onClose={() => setTvOpen(false)} closeLabel="Done"><TvInviteCard code={code} as="dtv" what="tiles" /></Sheet>}
      {decksOpen && <DeckPicker onClose={() => setDecksOpen(false)} />}
      {reactTo != null && canReact && (
        <ReactSheet table={table} mySeat={mySeat} icons={icons} to={reactTo} onTo={setReactTo}
          onSend={(to, item, gift) => { react(to, item, gift); setReactTo(null); }} onClose={() => setReactTo(null)} />
      )}

      {mySeat >= 0 && !tv && (
        <div className="hand-dock online-dock dom-dock">
          <div className="dock-head">
            <span>{table.phase === 'playing' ? (myTurn ? 'Your turn' : `${table.seats[r.turn]?.name ?? '…'}’s turn`) : ''}</span>
            <span>{tiles ? `${tiles.length} tile${tiles.length === 1 ? '' : 's'}` : ''}</span>
          </div>
          <div className="dom-hand">
            {(tiles ?? []).map((t) => {
              const [a, b] = halves(t);
              return (
                <button key={t} type="button" className={`dom-tile${selected === t ? ' sel' : ''}${myTurn && !playable.has(t) ? ' dim' : ''}`} onClick={() => tapTile(t)} aria-label={`${a} and ${b}`}>
                  <Domino a={a} b={b} vertical size={86} />
                </button>
              );
            })}
          </div>
          <div className="dock-action dom-actions">
            {myTurn && selected && forSelected.length > 0 && forSelected.map((m) => (
              <button key={m.arm ?? 'first'} type="button" className="primary big go" onClick={() => play(selected, m.arm)}>
                {m.arm == null ? 'Play it' : forSelected.length === 1 ? 'Play' : `On the ${openEnds(table).find((e) => e.arm === m.arm)?.value} ${ARM_NAMES[m.arm]}`}
              </button>
            ))}
            {myTurn && moves.length === 0 && canDrawPublic(table) && <button type="button" className="primary big go" onClick={() => send('d-draw')}>Draw a tile</button>}
            {myTurn && moves.length === 0 && !canDrawPublic(table) && <button type="button" className="secondary big" onClick={() => send('d-pass')}>Pass</button>}
            {myTurn && !selected && moves.length > 0 && <p className="dock-hint">Tap a tile to play it.</p>}
          </div>
        </div>
      )}

      {(table.phase === 'scored' || table.phase === 'over') && <HandResult table={table} isHost={isHost} act={act} onLeave={onLeave} />}
    </>
  );
}

const ARM_NAMES = { L: '(left)', R: '(right)', U: '(top)', D: '(bottom)' };

/** Your legal moves, worked out from the public table plus your own tiles. */
function movesFor(table, seat, tiles) {
  const t = { ...table, round: { ...table.round, hands: table.round.hands ?? table.seats.map((_, s) => (s === seat ? tiles : [])), boneyard: [] } };
  return legalMoves(t, seat);
}
const canDrawPublic = (table) => VARIANTS[table.settings.variant].draws && (table.round.boneyardCount ?? table.round.boneyard?.length ?? 0) > 0;

const sideName = (table, i) => {
  if (table.settings.teams) {
    const names = table.seats.filter((_, s) => s % 2 === i).map((x) => x?.name).filter(Boolean);
    return names.join(' & ') || `Team ${i + 1}`;
  }
  return table.seats[i]?.name ?? `Player ${i + 1}`;
};

/** The line of play, scaled to fit the table, with buttons on the ends the picked tile can go. */
function Board({ table, selectedMoves, onEnd, maxUnit = 38 }) {
  const box = useRef(null);
  const [size, setSize] = useState({ w: 360, h: 300 });
  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const reach = Math.max(4, Math.min(10, Math.round((size.w / Math.max(size.h, 1)) * 4)));
  const { tiles, ends, box: b } = boardLayout(table.round?.layout, { reach });
  const unitW = (b.x1 - b.x0), unitH = (b.y1 - b.y0);
  const unit = Math.min(maxUnit, size.w / unitW, size.h / unitH);
  const ox = (size.w - unitW * unit) / 2 - b.x0 * unit;
  const oy = (size.h - unitH * unit) / 2 - b.y0 * unit;
  const last = table.round?.last?.tile;
  const pickArms = new Set(selectedMoves.map((m) => m.arm));
  return (
    <div className="dom-board" ref={box}>
      {tiles.map((t) => (
        <div key={t.t} className={`dom-placed${t.t === last ? ' last' : ''}`} style={{ left: ox + t.cx * unit, top: oy + t.cy * unit }}>
          <Domino a={t.a} b={t.b} vertical={t.vertical} size={unit * 2} />
        </div>
      ))}
      {Object.entries(ends).filter(([arm]) => pickArms.has(arm)).map(([arm, e]) => (
        <button key={arm} type="button" className="dom-end" style={{ left: ox + e.x * unit, top: oy + e.y * unit, width: unit * 1.6, height: unit * 1.6 }} onClick={() => onEnd(arm)} aria-label="Play here">+</button>
      ))}
      {!tiles.length && table.phase === 'playing' && <p className="dom-board-hint">{table.round.mustPlay ? `${table.seats[table.round.turn]?.name ?? 'Someone'} starts with the ${table.round.mustPlay.replace('-', '|')}` : 'First tile: anything goes'}</p>}
    </div>
  );
}

/** All Fives: "+15" pops up when someone scores off the ends. */
function FivesPop({ event, table }) {
  const [on, setOn] = useState(true);
  useEffect(() => { const t = setTimeout(() => setOn(false), 1800); return () => clearTimeout(t); }, []);
  if (!on) return null;
  return <div className="dom-fives">{table.seats[event.seat]?.name} +{event.points}</div>;
}

/** Between hands: who went out (or the hand was blocked), the pips and points; the next hand deals itself. */
function HandResult({ table, isHost, act, onLeave }) {
  const res = table.round.result;
  const over = table.phase === 'over';
  const [left, setLeft] = useState(Math.round(NEXT_HAND_MS / 1000));
  useEffect(() => {
    if (over) return undefined;
    const t = setInterval(() => setLeft((x) => Math.max(0, x - 1)), 1000);
    return () => clearInterval(t);
  }, [over]);
  const winnerName = res.winner != null ? sideName(table, res.winner) : null;
  return (
    <div className="dom-result">
      {over && <Confetti />}
      <div className="card dom-result-card">
        <h2>{over ? `${sideName(table, table.match.winner)} win${table.settings.teams ? '' : 's'} the game!` : res.reason === 'domino' ? `${table.seats[res.outSeat]?.name} went out!` : 'Blocked: nobody can play'}</h2>
        {!over && <p className="muted">{winnerName ? `${winnerName} score${table.settings.teams ? '' : 's'} ${res.points[res.winner]}` : 'A tie: no points this hand'}</p>}
        <div className="dom-result-rows">
          {table.match.scores.map((s, i) => (
            <div key={i} className="dom-result-row"><span>{sideName(table, i)}</span><b>{s}</b>{res.points[i] > 0 && <small>+{res.points[i]}</small>}</div>
          ))}
        </div>
        {over
          ? (isHost
            ? <button type="button" className="primary big go" onClick={() => act((t) => startMatch(t))}>Play again</button>
            : <p className="muted">The host can start another game.</p>)
          : <p className="muted small">Next hand in {left}…</p>}
        {over && <button type="button" className="text-btn" onClick={onLeave}>Leave</button>}
      </div>
    </div>
  );
}
