// Dominoes online: everyone on their own phone, like Spades online. The host's device runs the game
// (engine.js), sends everyone the table (no hands, just counts) and each player their own tiles, locked for
// their device. Players send moves; the host checks them. Computer players fill empty seats.
import QRCode from 'qrcode';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { read, write, tabRead, tabWrite } from '../lib/store.js';
import { useRoom, joinLink } from '../lib/room.js';
import { useDevice } from '../lib/device.js';
import { useKeys, seal, unseal } from '../lib/secret.js';
import { useWakeLock, buzz, dealSound, cardSound, thud, setSoundSetting, useSoundSettings } from '../lib/fx.js';
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
import { Icon, Segmented, Toggle, useToast, Confetti, Sheet, useTableLayout } from '../components.jsx';
import Domino from './Domino.jsx';
import { fitBoard } from './board.js';
import { AIM, aimPages, swipeDirection, handTileWidth } from './handmode.js';
import {
  VARIANTS, SETS, startingTiles, kindOf, sideOf, teamsPossible, maxPlayers, roundsOf, lineName, byRounds, roundsToWin, halves, newDominoTable, startMatch, deal, legalMoves, playTile, drawTile, pass, publicTable, botMove, openEnds,
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
const HAND_MODE_KEY = 'dominoes-hand-mode'; // this device stays in hand mode

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
  return (
    <DominoRoom code={code} isHost={isHost} name={name.trim()} avatar={avatar} onLeave={onLeave}
      onProfile={(next) => { setName(next.name); saveName(next.name); setAvatar(next.avatar); saveAvatar(next.avatar); }} />
  );
}

function DominoRoom({ code, isHost = false, tv = false, name, avatar, onLeave, onProfile }) {
  const [editingProfile, setEditingProfile] = useState(null); // { name, avatar } while the "You" sheet is open
  const keys = useKeys();
  const [deviceId] = useState(() => stableId(tv ? TV_ID_KEY : ID_KEY));
  // (the TV uses the same role as a Spades TV, so video chat treats it the same: it plays everyone's sound)
  const [me, setMe] = useDevice(code, { role: isHost ? 'dhost' : tv ? 'otv' : 'dplayer', name, id: deviceId, pub: keys?.pub ?? null });
  const toast = useToast();
  const [view, setView] = useState(null);
  const viewRef = useRef(null);
  const [myTiles, setMyTiles] = useState(null); // { hand: hand number, tiles }
  const [closed, setClosed] = useState(null);
  const [aim, setAim] = useState(null);
  // (a phone that's gone quiet stops highlighting: it repeats its aim every couple of seconds while it lasts)
  useEffect(() => {
    if (!aim) return undefined;
    const timer = setTimeout(() => setAim(null), 5000);
    return () => clearTimeout(timer);
  }, [aim]);
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
  const [icons, handleAvatar] = useAvatars(room, me, avatar);
  const hostPeer = isHost ? null : room.peers.find((p) => p.role === 'dhost');
  const hostRef = useRef(hostPeer);
  hostRef.current = hostPeer;
  const seatOf = (t, id) => (t?.seats ?? []).findIndex((s) => s && !s.bot && s.id === id);

  function onMessage(m, from) {
    if (handleAvatar(m, from)) return;
    if (m.type === 'rtc') { call.handle(m); return; }
    // hand mode: the spots a player is aiming at, in their colours (shown on the TV)
    if (m.type === 'd-aim') {
      if (tv && from) setAim(Array.isArray(m.spots) && m.spots.length ? { id: from.id, hand: m.hand, moves: m.moves, spots: m.spots, at: Date.now() } : null);
      return;
    }
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
      else if (seat >= 0 && m.type === 'd-rename') error = act((x) => renameSeat(x, seat, m.name));
      else if (seat >= 0 && m.type === 'd-play') error = act((x) => (handNo(x) === m.hand ? playTile(x, seat, m.tile, m.arm, m.style, Boolean(m.thrown)) : x));
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
  const shownRef = useRef(shown);
  shownRef.current = shown;
  const mySeat = shown ? seatOf(shown, me.id) : -1;
  mySeatRef.current = mySeat;
  // A new name shows on your seat for everyone (the host changes the table; others ask the host)
  const myShownName = mySeat >= 0 ? shown?.seats[mySeat]?.name : null;
  useEffect(() => {
    if (tv || mySeat < 0 || !myShownName || myShownName === seatName(name)) return;
    if (isHost) act((x) => renameSeat(x, mySeat, name));
    else if (hostPeer) room.send({ type: 'd-rename', name: seatName(name) }, hostPeer.id);
  }, [name, mySeat, myShownName, hostPeer?.id]);
  const sendAim = useCallback((spots) => {
    const t = shownRef.current;
    room.send({ type: 'd-aim', hand: handNo(t), moves: t?.round?.moves ?? 0, spots });
  }, [room.send]);
  const editProfile = tv || !onProfile ? null : () => setEditingProfile({ name, avatar });
  const profileSheet = editingProfile && (
    <Sheet title="You" onClose={() => setEditingProfile(null)}
      action={{ label: 'Done', onClick: () => { if (editingProfile.name.trim()) onProfile({ ...editingProfile, name: editingProfile.name.trim() }); setEditingProfile(null); } }}>
      <ProfileEditor name={editingProfile.name} avatar={editingProfile.avatar}
        onName={(n) => setEditingProfile((x) => ({ ...x, name: n }))} onAvatar={(a) => setEditingProfile((x) => ({ ...x, avatar: a }))} />
      <p className="footnote center">Everyone at the table sees the change straight away.</p>
    </Sheet>
  );
  const tiles = isHost ? (mySeat >= 0 ? table?.round?.hands?.[mySeat] ?? null : null) : (myTiles && shown?.round && myTiles.hand === handNo(shown) ? myTiles.tiles : null);
  useWakeLock(Boolean(shown && shown.phase !== 'lobby'));
  const tvFit = useTvFit(tv);
  const tableLayout = useTableLayout();

  /** Send a move to the host (or make it, on the host). */
  const send = (type, body = {}) => {
    if (isHost) {
      const fn = { 'd-play': (x) => playTile(x, mySeat, body.tile, body.arm, body.style, Boolean(body.thrown)), 'd-draw': (x) => drawTile(x, mySeat), 'd-pass': (x) => pass(x, mySeat) }[type];
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
              call={call} me={me} reactions={reactions} tv aim={aim} />}
        <TvControls call={call} onLeave={() => { call.leave(); onLeave(); }} view={null} onView={() => {}} />
      </div>
    );
  }

  // A laptop, desktop or iPad: the table drawn as on a phone, scaled up to fill the window (as in Spades).
  const deskFit = shown.phase !== 'lobby' && tableLayout.zoom > 1
    ? { zoom: tableLayout.zoom, height: window.innerHeight / tableLayout.zoom, minHeight: 0 } : undefined;
  return (
    <div className={`app online dominoes${shown.phase === 'lobby' ? '' : ' at-table'}`} style={deskFit}>
      {shown.phase === 'lobby'
        ? <DominoLobby code={code} table={shown} isHost={isHost} me={me} icons={icons} act={act}
            onSit={(s) => { if (!isHost) { room.send({ type: 'd-sit', seat: s, name }, hostPeer?.id); return; } const e = act((x) => sit(x, s, { id: me.id, name })); if (e) toast.show(e); }}
            onStand={() => (isHost ? act((x) => ({ ...x, seats: x.seats.map((s) => (s?.id === me.id ? null : s)) })) : room.send({ type: 'd-stand' }, hostPeer?.id))}
            onStart={() => { const e = act((x) => startMatch(x)); if (e) toast.show(e); }} onLeave={leave}
            profile={{ name, avatar }} onEditProfile={editProfile} />
        : <DominoTable table={shown} mySeat={mySeat} tiles={tiles} icons={icons} isHost={isHost} send={send} act={act} onLeave={leave}
            call={call} me={me} code={code} reactions={reactions} react={react} alerts={alerts} toast={toast} onSave={isHost ? saveForLater : null}
            onEditProfile={mySeat >= 0 ? editProfile : null} sendAim={sendAim} />}
      {profileSheet}
      <ConnectionBanner room={room} isHost={isHost} hostPeer={hostPeer} onLeave={onLeave} />
      {toast.node}
    </div>
  );
}

const handNo = (t) => t?.match?.hands.length ?? 0;

const seatName = (name) => String(name ?? '').trim().slice(0, 14);
/** A player changed their name: it shows on their seat (any time, mid-game too). */
function renameSeat(t, seat, name) {
  const n = seatName(name);
  if (!n || !t.seats[seat] || t.seats[seat].name === n) return t;
  return { ...t, seats: t.seats.map((x, i) => (i === seat ? { ...x, name: n } : x)) };
}

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
  return { ...t, seats, settings: { ...t.settings, teams: t.settings.teams && teamsPossible(n) } };
}
/** New rules or set: fewer seats if the game takes fewer players, and the right score settings. */
function setRules(t, patch) {
  const settings = { ...t.settings, ...patch };
  const next = { ...t, settings: { ...settings, target: VARIANTS[settings.variant].target ?? 0, rounds: null } };
  const most = maxPlayers(settings.variant, settings.setMax);
  return setPlayers(next, Math.min(t.seats.length, most));
}
const roundChoices = (setMax) => [...new Set([setMax + 1, Math.ceil((setMax + 1) / 2), 3])];

// ---------- Lobby ----------

function DominoLobby({ code, table, isHost, me, icons, act, onSit, onStand, onStart, onLeave, profile, onEditProfile }) {
  const { settings } = table;
  const mine = table.seats.findIndex((s) => s?.id === me.id);
  const full = table.seats.every(Boolean);
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
        {onEditProfile && (
          <div className="wrap lobby-me">
            <button type="button" className="profile-chip" onClick={onEditProfile} aria-label="Change your name and picture">
              <Avatar value={profile.avatar} name={profile.name} /> {profile.name} <Icon name="edit" size={14} />
            </button>
          </div>
        )}
        <p className="wrap muted-light">Game {code}{isHost ? ' · You’re the host' : ''}</p>
      </header>
      <main className="wrap dom-lobby">
        <div className="section-title">Game</div>
        <div className="card group">
          {isHost ? (
            <>
              <div className="field-block"><span>Rules</span>
                <div className="dom-variants">
                  {Object.entries(VARIANTS).map(([id, v]) => (
                    <button key={id} type="button" className={`dom-variant${settings.variant === id ? ' on' : ''}`} aria-pressed={settings.variant === id}
                      onClick={() => act((t) => setRules(t, { variant: id }))}>{v.name}</button>
                  ))}
                </div>
              </div>
              <div className="field-block"><span>Set</span>
                <Segmented value={settings.setMax} onChange={(v) => act((t) => setRules(t, { setMax: v }))} options={SETS.map((m) => ({ id: m, label: `Double ${m}` }))} />
              </div>
              {settings.setMax === 6 && kindOf(table) === 'line' && VARIANTS[settings.variant].draws && (
                <div className="field-block"><span>Start with</span>
                  <Segmented value={startingTiles(table)} onChange={(v) => set({ startTiles: v })}
                    options={[{ id: 7, label: '7 tiles' }, { id: 5, label: '5 + boneyard' }]} />
                  <small className="dom-teams-note">{startingTiles(table) * table.seats.length >= 28 ? 'Every tile is dealt, so there’s nothing to draw.' : `${28 - startingTiles(table) * table.seats.length} tiles left in the boneyard to draw from.`}</small>
                </div>
              )}
              <div className="field-block"><span>Players</span>
                <Segmented value={table.seats.length} onChange={(n) => act((t) => setPlayers(t, n))} options={Array.from({ length: maxPlayers(settings.variant, settings.setMax) - 1 }, (_, i) => i + 2).map((n) => ({ id: n, label: String(n) }))} />
              </div>
              {teamsPossible(table.seats.length) && (
                <div className="field-block"><span>Play as</span>
                  <Segmented value={settings.teams ? 'teams' : 'solo'} onChange={(v) => set({ teams: v === 'teams' })}
                    options={[{ id: 'solo', label: 'Individuals' }, { id: 'teams', label: `${table.seats.length / 2} teams of 2` }]} />
                  {settings.teams && <small className="dom-teams-note">Partners sit across the table from each other and score together.</small>}
                </div>
              )}
              <div className="field-block"><span>Scoring</span>
                <Segmented value={settings.scoring ?? 'points'} onChange={(v) => set({ scoring: v })}
                  options={[{ id: 'points', label: VARIANTS[settings.variant].lowWins ? 'Lowest total' : 'Points' }, { id: 'rounds', label: 'Rounds won' }]} />
              </div>
              {byRounds(table) ? (
                <div className="field-block"><span>Match</span>
                  <Segmented value={settings.bestOf ?? 3} onChange={(v) => set({ bestOf: v })}
                    options={[{ id: 3, label: 'Best of 3' }, { id: 5, label: 'Best of 5' }, { id: 0, label: 'Just count' }]} />
                </div>
              ) : kindOf(table) === 'line' ? (
                <div className="field-block"><span>Play to</span>
                  <Segmented value={settings.target} onChange={(v) => set({ target: v })} options={[100, 150, 200, 250].map((n) => ({ id: n, label: String(n) }))} />
                </div>
              ) : (
                <div className="field-block"><span>Rounds</span>
                  <Segmented value={roundsOf(table)} onChange={(v) => set({ rounds: v })}
                    options={roundChoices(settings.setMax).map((n) => ({ id: n, label: n === settings.setMax + 1 ? `All ${n}` : String(n) }))} />
                </div>
              )}
            </>
          ) : (
            <p className="dom-rules-line">{VARIANTS[settings.variant].name} · Double {settings.setMax} · {startingTiles(table)} tiles each · {settings.teams ? `${table.seats.length / 2} teams of 2` : 'Each for themselves'} · {scoringText(table)}</p>
          )}
        </div>
        <p className="footnote">{byRounds(table) ? RULES_PLAY[settings.variant] : RULES_NOTE[settings.variant]}{byRounds(table) ? ` Scoring by rounds: each hand is a round, won by whoever goes out first, or if nobody can play, by the player with the fewest dots left.${settings.bestOf ? ` First to win ${roundsToWin(table)} rounds wins the set; the app keeps count of sets won.` : ' The app counts rounds won until you end the game.'}` : ''}</p>

        <div className="section-title">Seats</div>
        <div className={`dom-seats n${table.seats.length}`}>
          {table.seats.map((s, i) => (
            <div key={i} className={`card dom-seat${settings.teams ? ` t${sideOf(table, i)}` : ''}${s?.id === me.id ? ' mine' : ''}`}>
              {s ? <Avatar value={icons[s.id]} name={s.name} bot={s.bot} className="lobby-avatar" /> : <span className="dom-empty">+</span>}
              <b>{s ? (s.id === me.id ? 'You' : s.name) : `Seat ${i + 1}`}</b>
              {settings.teams && <small>Team {sideOf(table, i) + 1}</small>}
              {!s && <button type="button" className="soft small" onClick={() => onSit(i)}>Sit here</button>}
              {!s && isHost && <button type="button" className="text-btn small" onClick={() => addBot(i)}>Add computer</button>}
              {s?.id === me.id && <button type="button" className="text-btn small" onClick={onStand}>Stand up</button>}
              {s?.bot && isHost && <button type="button" className="text-btn small" onClick={() => act((t) => ({ ...t, seats: t.seats.map((x, j) => (j === i ? null : x)) }))}>Remove</button>}
            </div>
          ))}
        </div>
        {mine < 0 && <p className="muted center">Tap “Sit here” to take a seat.</p>}

        <div className="section-title">Invite</div>
        <DomInvite code={code} />
        <div className="section-title">Companion TV</div>
        <TvInviteCard code={code} as="dtv" what="tiles" />

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

/** The game's code, a QR code of the join link (point a phone's camera at it) and a share button. */
function DomInvite({ code }) {
  const link = joinLink(code);
  const [qr, setQr] = useState(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => { QRCode.toDataURL(link, { margin: 1, width: 320 }).then(setQr).catch(() => setQr(null)); }, [link]);
  const share = () => {
    if (navigator.share) navigator.share({ title: 'Dominoes', url: link }).catch(() => {});
    else navigator.clipboard?.writeText(link).then(() => setCopied(true)).catch(() => {});
  };
  return (
    <div className="card dom-invite">
      <div className="dom-code">{code.split('').map((c, i) => <span key={i}>{c}</span>)}</div>
      {qr && <img className="qr" src={qr} alt="QR code to join this game" />}
      <p className="muted small">Point a phone’s camera at the QR code to join, or open Family Games → Dominoes → Join a game and type the letters.</p>
      <button type="button" className="soft" onClick={share}><Icon name="share" size={18} /> {copied ? 'Link copied' : 'Share the link'}</button>
    </div>
  );
}

/** How this game is won, in a few words ("Best of 3 · sets 1–0", "to 100", "13 rounds, lowest wins"). */
function scoringText(table) {
  const st = table.settings;
  if (byRounds(table)) {
    const sets = table.match?.sets;
    const setText = sets && sets.length === 2 && sets.some((n) => n > 0) ? ` · sets ${sets.join('–')}` : ''; // (more sides: each score box shows its own)
    return `${st.bestOf ? `Best of ${st.bestOf}` : 'Rounds won'}${setText}`;
  }
  return kindOf(table) === 'line' ? `to ${st.target}` : `${roundsOf(table)} rounds, lowest wins`;
}

/** Just how to play (no scoring), for games scored by rounds. */
const RULES_PLAY = {
  draw: 'Match a number on either end. Can’t play? Draw from the boneyard until you can.',
  block: 'Match a number on either end. Can’t play? You pass (no drawing).',
  allfives: 'Like Draw, but the first double is a spinner: play off all four sides.',
  train: 'The round’s double goes in the middle. Build your own train off it, or the Mexican Train anyone can use. Can’t play? Draw one; still stuck, and your train opens to everyone until you play on it. Play a double and you go again, and it must be covered first.',
  foot: 'The round’s double goes in the middle and takes six tiles round it before anything else. Play a double and it becomes a chicken foot: three tiles go on it before play carries on anywhere else. Can’t play? Draw one, or pass.',
};

const RULES_NOTE = {
  draw: 'Match a number on either end. Can’t play? Draw from the boneyard until you can. First out scores everyone else’s pips.',
  block: 'Match a number on either end. Can’t play? You pass (no drawing). First out scores everyone else’s pips; if nobody can play, the lowest hand wins.',
  train: 'The round’s double goes in the middle. Build your own train off it, or the Mexican Train anyone can use. Can’t play? Draw one; still stuck, and your train opens to everyone until you play on it. Play a double and you go again, and it must be covered first. One round per double, highest first; pips left count against you (0|0 = 50), lowest total wins.',
  foot: 'The round’s double goes in the middle and takes six tiles round it before anything else. Play a double and it becomes a chicken foot: three tiles go on it before play carries on anywhere else. Can’t play? Draw one, or pass. One round per double; pips left count against you (0|0 = 50), lowest total wins.',
  allfives: 'Like Draw, but the first double is a spinner (play off all four sides), and whenever the ends add up to 5, 10, 15… you score that many.',
};

// ---------- The table ----------

// Where each seat sits around the table, from your seat (you're always at the bottom).
const AROUND = { 2: ['bottom', 'top'], 3: ['bottom', 'left', 'right'], 4: ['bottom', 'left', 'top', 'right'] };

// Hold a tile to choose how it goes down (as in Spades, without the Papi Flip)
const TILE_STYLE_CHOICES = [
  { id: 'slam', icon: '💥', name: 'Slam', note: 'Bang it down on the table' },
  { id: 'spin', icon: '🌀', name: 'Spin', note: 'Twirl it in' },
  { id: 'toss', icon: '✋', name: 'Toss', note: 'Just play it' },
];
const styleWord = (style) => { const c = TILE_STYLE_CHOICES.find((x) => x.id === style); return c ? `${c.icon} ${c.name}` : ''; };
const HOLD_MS = 480;
// Where a thrown tile comes from, relative to where it lands
const FLY_FROM = { bottom: ['0px', '46vh', '-24deg'], top: ['0px', '-46vh', '24deg'], left: ['-52vw', '0px', '30deg'], right: ['52vw', '0px', '-30deg'] };

function TileStyleSheet({ tile, onPick, onClose }) {
  const [a, b] = halves(tile);
  return (
    <Sheet title={`Play the ${a}–${b} with…`} short onClose={onClose} closeLabel="Cancel">
      <div className="play-styles dom-play-styles">
        {TILE_STYLE_CHOICES.map((p) => (
          <button key={p.id} type="button" className={`play-style style-${p.id}`} onClick={() => onPick(p.id === 'toss' ? null : p.id)}>
            <span className="play-style-icon">{p.icon}</span>
            <b>{p.name}</b>
            <span>{p.note}</span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}

function DominoTable({ table, mySeat, tiles, icons, isHost, send, act, onLeave, call, me, code, reactions = [], react, alerts, toast, onSave, onEditProfile, sendAim, aim, tv = false }) {
  const r = table.round;
  const deck = useDeck();
  const sound = useSoundSettings();
  const [callOpen, setCallOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [tvOpen, setTvOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [decksOpen, setDecksOpen] = useState(false);
  const [reactTo, setReactTo] = useState(null);
  const [lastTest, setLastTest] = useState(null);
  const [handMode, setHandModeState] = useState(() => read(HAND_MODE_KEY) === true);
  const setHandMode = (on) => { setHandModeState(on); write(HAND_MODE_KEY, on); };
  const inHandMode = handMode && mySeat >= 0 && !tv;
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
    mySeat >= 0 && !tv && { icon: 'hand', label: 'Hand mode', note: 'Just your tiles: swipe to play on the TV', on: handMode, onClick: () => setHandMode(!handMode) },
    onEditProfile && { icon: 'edit', label: 'My name & picture', onClick: onEditProfile },
    { icon: 'share', label: 'Game code & QR', note: 'Rejoin on another phone', onClick: () => setInviteOpen(true) },
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
  // A newly played tile: its sound, and its flight onto the table if it was thrown, spun or slammed. (New to this
  // device, so a tile doesn't fly in again when the table is resent or someone comes back to the game.)
  const seenPlay = useRef(lastAt);
  const flyTimer = useRef(null);
  const [fly, setFly] = useState(null);
  useLayoutEffect(() => {
    if (!lastAt || lastAt === seenPlay.current) return;
    seenPlay.current = lastAt;
    const kind = r.last.style ?? (r.last.thrown ? 'thrown' : null);
    clearTimeout(flyTimer.current);
    setFly(kind ? { tile: r.last.tile, seat: r.last.seat, kind } : null);
    if (kind) flyTimer.current = setTimeout(() => setFly(null), 1000);
    if (kind === 'slam') setTimeout(() => { thud(); if (document.visibilityState === 'visible') buzz([70, 40, 120]); }, 400);
    else cardSound(kind ? { delay: kind === 'spin' ? 0.6 : 0.35 } : undefined);
  }, [lastAt]);
  useEffect(() => () => clearTimeout(flyTimer.current), []);

  // The table fills whatever the hand area (fixed along the bottom) leaves: measure it rather than guess.
  const dockRef = useRef(null);
  const [dockH, setDockH] = useState(0);
  const hasDock = mySeat >= 0 && !tv;
  useLayoutEffect(() => {
    const el = dockRef.current;
    if (!hasDock || !el) { setDockH(0); return undefined; }
    const ro = new ResizeObserver(() => setDockH(el.offsetHeight));
    ro.observe(el);
    setDockH(el.offsetHeight);
    return () => ro.disconnect();
  }, [hasDock]);
  const lines = kindOf(table) !== 'line'; // Mexican Train / Chicken Foot: rows of lines, players along the top
  // (the score boxes along the top use first names, so four of them fit on a small phone)
  const sides = table.match ? table.match.scores.map((score, i) => ({ score, name: firstNames(table, i) })) : [];
  // a seat's picture (or their video, when they're in the video chat); tap it to send emojis
  const seatAvatar = (who, s) => {
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
  };
  // In a video chat: bigger videos across the top instead of the round pictures
  const videoMode = call.joined || call.videos.length > 0;
  const seatMedia = (who, s) => {
    const stream = who && !who.bot ? videoOf(who.id) : null;
    const showVideo = stream && hasVideo(stream) && (who.id !== me.id || call.camOn);
    return (
      <div className={`dom-vmedia${canReact && who && s !== mySeat ? ' tappable' : ''}`} data-seat={s} onClick={() => tapSeat(s)}>
        {stream && <VideoTile stream={stream} muted={who.id === me.id || !call.speakerOn} mirrored={who.id === me.id} className={showVideo ? '' : 'no-video'} />}
        {!showVideo && <Avatar value={who ? icons[who.id] : null} name={who?.name ?? '?'} bot={who?.bot} className="seat-icon" />}
        {stream && <SpeakingRings stream={stream} tile />}
      </div>
    );
  };
  // Hand mode on someone's phone: where their picked tile can go, in the colours lit on their screen (TV only)
  const aimSpots = tv && aim && r && aim.hand === handNo(table) && aim.moves === r.moves && table.seats[r.turn]?.id === aim.id ? aim.spots : [];
  const said = (s) => r?.last?.seat === s && (r.last.passed || r.last.drew) && Date.now() - r.last.at < 4000
    && <span className="dom-said">{r.last.passed ? (kindOf(table) === 'train' ? 'Pass · train open' : 'Pass') : 'Drew'}</span>;
  const counts = r?.counts ?? r?.hands?.map((h) => h.length) ?? [];
  const boneyard = r?.boneyardCount ?? r?.boneyard?.length ?? 0;

  // Where a thrown tile starts: from the player's side, or from their place along the top when the players are up there
  const flyVars = (() => {
    if (!fly || fly.kind === 'slam') return undefined;
    let from;
    if (!lines && !videoMode) from = FLY_FROM[posOf(fly.seat)];
    else if (fly.seat === mySeat) from = FLY_FROM.bottom;
    else from = [`${((fly.seat + 0.5) / n - 0.5) * 90}vw`, '-46vh', '24deg'];
    return { '--fx': from[0], '--fy': from[1], '--spin': fly.kind === 'spin' ? '-1080deg' : from[2] };
  })();
  const flight = fly && { tile: fly.tile, className: ` dom-fly fly-${fly.kind}`, style: flyVars };

  // Hold a tile to choose how to play it. The choice stays with the tile until it's played or another is picked.
  const [held, setHeld] = useState(null);
  const [playStyle, setPlayStyle] = useState(null);
  useEffect(() => { setPlayStyle(null); }, [selected]);
  useEffect(() => { if (!myTurn) setHeld(null); }, [myTurn]);
  const holdTimer = useRef(null);
  const holdAt = useRef(null);
  const didHold = useRef(false);
  const stopHold = () => { clearTimeout(holdTimer.current); holdTimer.current = null; };
  const holdTile = (t) => {
    stopHold();
    didHold.current = true;
    if (!myTurn) { toast.show(`It’s ${table.seats[r?.turn]?.name ?? 'someone else'}’s turn`); return; }
    if (!playable.has(t)) { toast.show('That one doesn’t fit anywhere yet'); return; }
    buzz(30);
    setSelected(t);
    setHeld(t);
  };
  const holdHandlers = (t) => ({
    onPointerDown: (e) => {
      didHold.current = false;
      holdAt.current = { x: e.clientX, y: e.clientY };
      holdTimer.current = setTimeout(() => holdTile(t), HOLD_MS);
    },
    onPointerMove: (e) => { if (holdTimer.current && Math.hypot(e.clientX - holdAt.current.x, e.clientY - holdAt.current.y) > 10) stopHold(); },
    onPointerUp: stopHold,
    onPointerCancel: stopHold,
    onPointerLeave: stopHold,
    onContextMenu: (e) => { e.preventDefault(); if (holdTimer.current || !didHold.current) holdTile(t); },
  });
  const play = (tile, arm, style = playStyle) => { setSelected(null); setPlayStyle(null); send('d-play', { tile, arm, ...(style ? { style } : {}) }); };
  const pickStyle = (style) => {
    const t = held;
    setHeld(null);
    const options = moves.filter((m) => m.tile === t);
    if (options.length === 1) play(t, options[0].arm, style); // one place it can go: off it goes
    else setPlayStyle(style);
  };
  const tapTile = (t) => {
    if (didHold.current) { didHold.current = false; return; }
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
          {lines && <div className="dom-round"><b>{VARIANTS[table.settings.variant].name}</b><span>{byRounds(table) ? `Round ${handNo(table) + (table.phase === 'playing' ? 1 : 0)} · ${scoringText(table)}` : `Round ${Math.min(handNo(table) + (table.phase === 'playing' ? 1 : 0), roundsOf(table))} of ${roundsOf(table)} · lowest wins`}</span></div>}
          {lines && r?.engine != null && (
            <div className="dom-head-engine" title={kindOf(table) === 'train' ? 'The engine (middle double)' : 'The middle double'}>
              <Domino a={r.engine} b={r.engine} size={tv ? 64 : 40} />
              {boneyard > 0 && <span title="Tiles left to draw"><Domino a={0} b={0} faceDown size={tv ? 40 : 26} />{boneyard}</span>}
            </div>
          )}
          {!lines && sides.map((s, i) => (
            <div key={i} className={`dom-score${table.settings.teams ? ` t${i}` : ''}`}>
              <span>{s.name}</span><b>{s.score}</b>
              {setsWon(table, i) > 0 && <i className="dom-sets" title="Sets won">{setsWon(table, i)} set{setsWon(table, i) === 1 ? '' : 's'}</i>}
            </div>
          ))}
          {!lines && <span className="dom-caption">{VARIANTS[table.settings.variant].name} · {scoringText(table)}{videoMode && !lines && VARIANTS[table.settings.variant].draws && table.phase === 'playing' ? ` · ${boneyard} to draw` : ''}</span>}
        </div>
        <div className="online-meta">
          {!lines && <span>{VARIANTS[table.settings.variant].name} · {scoringText(table)}{videoMode && !lines && VARIANTS[table.settings.variant].draws && table.phase === 'playing' ? ` · ${boneyard} to draw` : ''}</span>}
          {!tv && <TableMenu items={menu} />}
        </div>
      </header>

      <div className={`felt dom-felt${lines ? ' dom-lines' : ''}${videoMode ? ' dom-video' : ''}`} style={{ marginBottom: dockH }}>
        <div className="table-oval" aria-hidden="true" />
        {videoMode && (
          <div className={`dom-vstrip n${n}`}>
            {table.seats.map((who, s) => (
              <div key={s} className={`dom-vtile${table.settings.teams ? ` t${sideOf(table, s)}` : ''}${r?.turn === s && table.phase === 'playing' ? ' turn' : ''}${s === mySeat ? ' me' : ''}`}>
                {seatMedia(who, s)}
                <div className="dom-vbar">
                  <span className="dom-vname">{s === mySeat ? 'You' : who?.name}</span>
                  {r?.markers?.[s] && <span title="Train open to everyone">🚂</span>}
                  <b title="Tiles in hand">{counts[s] ?? 0}</b>
                </div>
                {lines && <span className="dom-vscore">{table.settings.teams ? `T${sideOf(table, s) + 1} · ` : ''}{table.match?.scores[sideOf(table, s)] ?? 0}{byRounds(table) ? ' won' : ' pts'}</span>}
                {s === mySeat && call.joined && <div className="dom-vcall"><MyCallButtons call={call} onMore={() => setCallOpen(true)} /></div>}
                {who?.standIn && <span className="dp-away">computer</span>}
                {said(s)}
              </div>
            ))}
          </div>
        )}
        {lines && (
          <>
            {!videoMode && <div className={`dom-players n${n}`}>
              {table.seats.map((who, s) => (
                <div key={s} className={`dom-player${table.settings.teams ? ` team t${sideOf(table, s)}` : ''}${r?.turn === s && table.phase === 'playing' ? ' turn' : ''}${s === mySeat ? ' me' : ''}`}>
                  {seatAvatar(who, s)}
                  {table.settings.teams && <span className="dp-team" title={`Team ${sideOf(table, s) + 1} (the score is the team’s)`}>T{sideOf(table, s) + 1}</span>}
                  <span className="dp-name">{s === mySeat ? 'You' : who?.name}</span>
                  <span className="dp-info">
                    <b title="Tiles in hand">{counts[s] ?? 0}</b>
                    <small title={byRounds(table) ? 'Rounds won' : 'Score so far'}>{table.match?.scores[sideOf(table, s)] ?? 0} {byRounds(table) ? 'won' : 'pts'}{setsWon(table, sideOf(table, s)) > 0 ? ` · ${setsWon(table, sideOf(table, s))} set${setsWon(table, sideOf(table, s)) === 1 ? '' : 's'}` : ''}</small>
                  </span>
                  {r?.markers?.[s] && <span className="dp-open" title="Train open to everyone">🚂</span>}
                  {who?.standIn && <span className="dp-away">computer</span>}
                  {said(s)}
                </div>
              ))}
            </div>}
            <LinesBoard table={table} mySeat={mySeat} icons={icons} selectedMoves={forSelected} onEnd={(arm) => play(selected, arm)} tv={tv} aimSpots={aimSpots} flight={flight} />
          </>
        )}
        {!lines && <Board table={table} selectedMoves={forSelected} onEnd={(arm) => play(selected, arm)} maxUnit={tv ? 60 : 38} aimSpots={aimSpots} flight={flight} />}
        {!lines && !videoMode && table.seats.map((who, s) => (
          <div key={s} className={`player-spot ${posOf(s)}${table.settings.teams ? ` t${sideOf(table, s)}` : ''}${r?.turn === s && table.phase === 'playing' ? ' turn' : ''}${s === mySeat ? ' me' : ''}`}>
            {seatAvatar(who, s)}
            <div className="nameplate">
              <span className="spot-name">{s === mySeat ? 'You' : who?.name}</span>
              <span className="spot-score dom-count" title="Tiles in hand">{counts[s] ?? 0}</span>
            </div>
            {s === mySeat && call.joined && <MyCallButtons call={call} onMore={() => setCallOpen(true)} />}
            {who && who.standIn && <div className="away">computer playing</div>}
            {said(s)}
          </div>
        ))}
        {!lines && !videoMode && VARIANTS[table.settings.variant].draws && table.phase === 'playing' && <div className="dom-boneyard"><Domino a={0} b={0} faceDown size={34} /> {boneyard}</div>}
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
      {inviteOpen && <Sheet title={`Game ${code}`} short onClose={() => setInviteOpen(false)} closeLabel="Done"><DomInvite code={code} /></Sheet>}
      {tvOpen && <Sheet title="Companion TV" short onClose={() => setTvOpen(false)} closeLabel="Done"><TvInviteCard code={code} as="dtv" what="tiles" /></Sheet>}
      {decksOpen && <DeckPicker onClose={() => setDecksOpen(false)} />}
      {reactTo != null && canReact && (
        <ReactSheet table={table} mySeat={mySeat} icons={icons} to={reactTo} onTo={setReactTo}
          onSend={(to, item, gift) => { react(to, item, gift); setReactTo(null); }} onClose={() => setReactTo(null)} />
      )}

      {mySeat >= 0 && !tv && (
        <div className="hand-dock online-dock dom-dock" ref={dockRef}>
          <div className="dock-head">
            <span>{table.phase === 'playing' ? (myTurn ? `Your turn${playStyle ? ` · ${styleWord(playStyle)}` : ''}` : `${table.seats[r.turn]?.name ?? '…'}’s turn`) : ''}</span>
            <span>{tiles ? `${tiles.length} tile${tiles.length === 1 ? '' : 's'}` : ''}</span>
          </div>
          {/* tiles share the row (two even rows past 10), sized to the space: see .dom-hand in styles.css */}
          <div className="dom-hand" style={{ '--per': (tiles?.length ?? 0) > 10 ? Math.ceil(tiles.length / 2) : Math.max(tiles?.length ?? 1, 1) }}>
            {(tiles ?? []).map((t) => {
              const [a, b] = halves(t);
              return (
                <button key={t} type="button" className={`dom-tile${selected === t ? ' sel' : ''}${myTurn && !playable.has(t) ? ' dim' : ''}`} onClick={() => tapTile(t)} {...holdHandlers(t)} aria-label={`${a} and ${b}`}>
                  <Domino a={a} b={b} vertical size={86} />
                </button>
              );
            })}
          </div>
          <div className="dock-action dom-actions">
            {myTurn && selected && forSelected.length > 0 && forSelected.length <= 3 && forSelected.map((m) => (
              <button key={m.arm ?? 'first'} type="button" className="primary big go" onClick={() => play(selected, m.arm)}>
                {m.arm == null ? 'Play it' : forSelected.length === 1 ? 'Play' : lines ? lineName(table, m.arm, mySeat) : `On the ${openEnds(table).find((e) => e.arm === m.arm)?.value} ${ARM_NAMES[m.arm]}`}
              </button>
            ))}
            {myTurn && selected && forSelected.length > 3 && <p className="dock-hint">Tap the line to put it on.</p>}
            {myTurn && !selected && lines && r?.openDouble && moves.length > 0 && <p className="dock-hint">Cover the double first.</p>}
            {myTurn && moves.length === 0 && canDrawPublic(table) && <button type="button" className="primary big go" onClick={() => send('d-draw')}>Draw a tile</button>}
            {myTurn && moves.length === 0 && !canDrawPublic(table) && <button type="button" className="secondary big" onClick={() => send('d-pass')}>{kindOf(table) === 'train' ? 'Pass (your train opens)' : 'Pass'}</button>}
            {myTurn && !selected && moves.length > 0 && <p className="dock-hint">Tap a tile to play it. Hold it to slam or spin.</p>}
          </div>
        </div>
      )}

      {held && myTurn && !inHandMode && <TileStyleSheet tile={held} onPick={pickStyle} onClose={() => setHeld(null)} />}
      {inHandMode && (
        <DomHandView table={table} mySeat={mySeat} tiles={tiles ?? []} moves={moves} myTurn={myTurn} boneyard={boneyard} call={call}
          send={send} sendAim={sendAim} onExit={() => setHandMode(false)} onMore={() => setCallOpen(true)} />
      )}
      {(table.phase === 'scored' || table.phase === 'over') && !fly && <HandResult table={table} isHost={isHost} act={act} onLeave={onLeave} />}
    </>
  );
}

const ARM_NAMES = { L: '(left)', R: '(right)', U: '(top)', D: '(bottom)' };

/** Your legal moves, worked out from the public table plus your own tiles. */
function movesFor(table, seat, tiles) {
  const t = { ...table, round: { ...table.round, hands: table.round.hands ?? table.seats.map((_, s) => (s === seat ? tiles : [])), boneyard: [] } };
  return legalMoves(t, seat);
}
const canDrawPublic = (table) => VARIANTS[table.settings.variant].draws && (table.round.boneyardCount ?? table.round.boneyard?.length ?? 0) > 0
  && !(VARIANTS[table.settings.variant].drawOne && table.round.drew);


/** A side's name with first names only ("Nick & Ann"), for the small score boxes. */
const firstNames = (table, i) => (table.settings.teams
  ? table.seats.filter((_, s) => sideOf(table, s) === i).map((x) => x?.name?.split(' ')[0]).filter(Boolean).join(' & ') || `Team ${i + 1}`
  : sideName(table, i).split(' ')[0]);
const setsWon = (table, i) => table.match?.sets?.[i] ?? 0;
const sideName = (table, i) => {
  if (table.settings.teams) {
    const names = table.seats.filter((_, s) => sideOf(table, s) === i).map((x) => x?.name).filter(Boolean);
    return names.join(' & ') || `Team ${i + 1}`;
  }
  return table.seats[i]?.name ?? `Player ${i + 1}`;
};

/** The line of play, scaled to fit the table, with buttons on the ends the picked tile can go. */
function Board({ table, selectedMoves, onEnd, maxUnit = 38, aimSpots = [], flight = null }) {
  const box = useRef(null);
  const [size, setSize] = useState({ w: 360, h: 300 });
  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // the longest runs before turning that still keep the tiles a good size
  const { L: { tiles, ends, box: b }, unit } = fitBoard(table.round?.layout, size.w, size.h, maxUnit);
  const unitW = (b.x1 - b.x0), unitH = (b.y1 - b.y0);
  const ox = (size.w - unitW * unit) / 2 - b.x0 * unit;
  const oy = (size.h - unitH * unit) / 2 - b.y0 * unit;
  const last = table.round?.last?.tile;
  const pickArms = new Set(selectedMoves.map((m) => m.arm));
  return (
    <div className="dom-board" ref={box}>
      {tiles.map((t) => (
        <div key={t.t} className={`dom-placed${t.t === last ? ' last' : ''}${flight?.tile === t.t ? flight.className : ''}`} style={{ left: ox + t.cx * unit, top: oy + t.cy * unit, ...(flight?.tile === t.t ? flight.style : {}) }}>
          <Domino a={t.a} b={t.b} vertical={t.vertical} size={unit * 2} />
        </div>
      ))}
      {Object.entries(ends).filter(([arm]) => pickArms.has(arm)).map(([arm, e]) => (
        <button key={arm} type="button" className="dom-end" style={{ left: ox + e.x * unit, top: oy + e.y * unit, width: unit * 1.6, height: unit * 1.6 }} onClick={() => onEnd(arm)} aria-label="Play here">+</button>
      ))}
      {aimSpots.map((sp) => {
        const e = sp.arm == null ? { x: 0, y: 0 } : ends[sp.arm];
        if (!e || !AIM[sp.dir]) return null;
        const px = Math.max(unit * 2, 44);
        return (
          <span key={sp.dir} className="dom-aim" style={{ left: tiles.length ? Math.min(size.w - px / 2, Math.max(px / 2, ox + e.x * unit)) : size.w / 2, top: tiles.length ? Math.min(size.h - px / 2, Math.max(px / 2, oy + e.y * unit)) : size.h / 2, width: px, height: px, '--aim': AIM[sp.dir].color, fontSize: px * 0.5 }}>{AIM[sp.dir].arrow}</span>
        );
      })}
      {!tiles.length && !aimSpots.length && table.phase === 'playing' && <p className="dom-board-hint">{table.round.mustPlay ? `${table.seats[table.round.turn]?.name ?? 'Someone'} starts with the ${table.round.mustPlay.replace('-', '|')}` : 'First tile: anything goes'}</p>}
    </div>
  );
}

/**
 * Mexican Train and Chicken Foot: one row per line, each starting from what it comes off (the middle double, or a
 * chicken foot's double), showing the newest tiles. When your picked tile fits a line, tap that row to play it.
 */
function LinesBoard({ table, mySeat, icons, selectedMoves, onEnd, tv, aimSpots = [], flight = null }) {
  const box = useRef(null);
  const [size, setSize] = useState({ w: 340, h: 300 });
  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const r = table.round;
  if (!r?.layout?.lines) return null;
  const train = kindOf(table) === 'train';
  let rows = r.layout.lines.filter((l) => !l.closed);
  if (train) {
    // the Mexican Train, then yours, then everyone else's in turn order
    const order = (l) => (l.owner == null ? -1 : l.owner === mySeat ? -0.5 : (l.owner - Math.max(mySeat, 0) + table.seats.length) % table.seats.length);
    rows = [...rows].sort((x, y) => order(x) - order(y));
  }
  const fits = new Set(selectedMoves.map((m) => m.arm));
  const mustFill = !train && rows.some((l) => !l.tiles.length);
  // two columns of rows on wide screens, and for Chicken Foot's many short lines (only their ends matter)
  const cols = rows.length > 3 && (size.w > 460 || (!train && rows.length > 7)) ? 2 : 1;
  const rowH = Math.max(24, Math.min(tv ? 70 : 46, (size.h + 4) / Math.max(Math.ceil(rows.length / cols), 1) - 4));
  const colW = (size.w - (cols - 1) * 6) / cols;
  const tileLong = Math.round(rowH * 1.3);
  const labelW = train ? Math.min(118, colW * 0.3) : rowH * 0.9;
  const room = Math.max(1, Math.floor((colW - labelW - 18 - (fits.size ? 34 : 0)) / (tileLong + 3)));
  const lastTile = r.last?.tile;
  return (
    <div className={`dom-lines-board${cols > 1 ? ' two' : ''}`} ref={box}>
      {rows.map((l) => {
        const who = l.owner != null ? table.seats[l.owner] : null;
        const open = train && (l.owner == null || r.markers?.[l.owner]);
        const shown = l.tiles.length > room ? l.tiles.slice(l.tiles.length - (room - 1)) : l.tiles;
        const hidden = l.tiles.length - shown.length;
        const can = fits.has(l.id);
        const aimed = AIM[aimSpots.find((sp) => sp.arm === l.id)?.dir];
        return (
          <div key={l.id} role={can ? 'button' : undefined} tabIndex={can ? 0 : undefined}
            className={`dom-row${table.settings.teams && l.owner != null ? ` team t${sideOf(table, l.owner)}` : ''}${can ? ' can' : ''}${r.openDouble === l.id ? ' cover' : ''}${l.owner != null && l.owner === mySeat ? ' mine' : ''}${l.owner != null && r.turn === l.owner ? ' turn' : ''}`}
            style={{ height: rowH, ...(aimed ? { '--aim': aimed.color, borderColor: aimed.color, boxShadow: `0 0 14px ${aimed.color}`, background: `color-mix(in srgb, ${aimed.color} 35%, transparent)` } : {}) }} onClick={can ? () => onEnd(l.id) : undefined}>
            <span className="dom-row-label" style={{ width: labelW }}>
              {train
                ? (l.owner == null
                  ? <><span className="dom-row-icon">🚂</span><span className="dom-row-mex">Mexican<br />Train</span></>
                  : <><Avatar value={who ? icons[who.id] : null} name={who?.name ?? '?'} bot={who?.bot} className="dom-row-avatar" /><span>{l.owner === mySeat ? 'You' : who?.name}</span>{open && <span className="dom-row-open" title="Open to everyone">🚂</span>}</>)
                : (() => { const [a, b] = halves(l.on); return <Domino a={a} b={b} vertical size={rowH * 0.95} />; })()}
            </span>
            <span className="dom-row-tiles">
              {hidden > 0 && <span className="dom-row-more">+{hidden}</span>}
              {!l.tiles.length && <span className="dom-row-empty">{mustFill ? `needs a ${l.start}` : `starts with a ${l.start}`}</span>}
              {shown.map((p) => (
                <span key={p.t} className={`dom-row-tile${p.t === lastTile ? ' last' : ''}${p.inner === p.outer ? ' double' : ''}${flight?.tile === p.t ? flight.className : ''}`} style={flight?.tile === p.t ? flight.style : undefined}>
                  <Domino a={p.inner} b={p.outer} size={tileLong} />
                </span>
              ))}
              {can && <span className="dom-row-go" aria-label="Play here">+</span>}
              {aimed && <span className="dom-row-aim" style={{ background: aimed.color }}>{aimed.arrow}</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Hand mode: this device shows only your dominoes. Pick one and the screen's edges light up, a colour for each
 * place it can go (a TV shows the same colours on those spots). Swipe toward a colour, or tap it, to play there.
 */
function DomHandView({ table, mySeat, tiles, moves, myTurn, boneyard, call, send, sendAim, onExit, onMore }) {
  const r = table.round;
  const lines = kindOf(table) !== 'line';
  const [selected, setSelected] = useState(null);
  const [page, setPage] = useState(0);
  const [drag, setDrag] = useState(null);
  const [note, setNote] = useState(null);
  const [held, setHeld] = useState(null); // holding a tile: choosing how to play it
  const [playStyle, setPlayStyle] = useState(null);
  const holdTimer = useRef(null);
  const stopHold = () => { clearTimeout(holdTimer.current); holdTimer.current = null; };
  useEffect(() => { setPlayStyle(null); }, [selected]);
  useEffect(() => { if (!myTurn) setHeld(null); }, [myTurn]);
  useEffect(() => stopHold, []);
  const area = useRef(null);
  const root = useRef(null);
  const start = useRef(null);
  const [box, setBox] = useState({ w: 300, h: 300 });
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return undefined;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const playing = table.phase === 'playing';
  const playable = useMemo(() => new Set(moves.map((m) => m.tile)), [moves]);
  // the picked tile can stop being playable (turn over, someone else's tile changed the ends)
  useEffect(() => { if (selected && (!myTurn || !playable.has(selected))) { setSelected(null); setPage(0); } }, [myTurn, playable, selected]);
  useEffect(() => { if (!note) return undefined; const t = setTimeout(() => setNote(null), 2200); return () => clearTimeout(t); }, [note]);

  const pages = selected ? aimPages(moves, selected) : [];
  const spots = pages[page] ?? pages[0] ?? [];
  const byDir = Object.fromEntries(spots.map((sp) => [sp.dir, sp]));
  // tell the TV where this tile can go; repeated while it's picked (and cleared when it's not)
  const aimKey = `${r?.moves}:${spots.map((sp) => `${sp.arm}${sp.dir}`).join(',')}`;
  useEffect(() => {
    sendAim(spots);
    if (!spots.length) return undefined;
    const timer = setInterval(() => sendAim(spots), 2000);
    return () => clearInterval(timer);
  }, [aimKey]);
  useEffect(() => () => sendAim([]), []);

  const playTo = (dir) => {
    const sp = byDir[dir];
    if (!selected || !sp) return false;
    buzz(40);
    send('d-play', { tile: selected, arm: sp.arm, thrown: true, ...(playStyle ? { style: playStyle } : {}) });
    setSelected(null); setPage(0); setDrag(null); setPlayStyle(null);
    return true;
  };
  const pickStyle = (style) => {
    const t = held;
    setHeld(null);
    const options = moves.filter((m) => m.tile === t);
    if (options.length === 1) { // one place it can go: off it goes
      send('d-play', { tile: t, arm: options[0].arm, thrown: true, ...(style ? { style } : {}) });
      setSelected(null); setPage(0);
    } else setPlayStyle(style);
  };
  const label = (sp) => {
    if (sp.arm == null) return 'Play it here';
    if (lines) return lineName(table, sp.arm, mySeat);
    return `On the ${openEnds(table).find((e) => e.arm === sp.arm)?.value} ${ARM_NAMES[sp.arm]}`;
  };
  // arrow keys on a computer
  useEffect(() => {
    const onKey = (e) => {
      const dir = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[e.key];
      if (dir && playTo(dir)) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // A swipe can start on a tile (it's picked up in the same move) or anywhere once one is picked.
  const onDown = (e) => {
    // (video sound needs a tap to start on some phones; the videos are behind this screen)
    document.querySelectorAll('video').forEach((v) => { if (v.paused) v.play?.().catch(() => {}); });
    const el = e.target.closest?.('button');
    if (el && !el.dataset.tile) return;
    const tile = el?.dataset.tile ?? null;
    let picked = selected;
    if (tile) {
      if (!myTurn) { setNote(`It’s ${table.seats[r?.turn]?.name ?? 'someone else'}’s turn`); return; }
      if (!playable.has(tile)) { setNote(moves.length ? 'That one doesn’t fit anywhere yet' : 'None of your tiles fit'); return; }
      if (tile !== selected) { buzz(15); setSelected(tile); setPage(0); }
      picked = tile;
    }
    if (!picked) return;
    const k = root.current ? root.current.getBoundingClientRect().width / (root.current.offsetWidth || 1) : 1;
    start.current = { x: e.clientX, y: e.clientY, k: k || 1, moved: false, onTile: Boolean(tile) };
    root.current?.setPointerCapture?.(e.pointerId);
    // held still on a tile: choose how to play it
    if (tile) {
      const { pointerId } = e;
      stopHold();
      holdTimer.current = setTimeout(() => {
        holdTimer.current = null;
        start.current = null;
        setDrag(null);
        try { root.current?.releasePointerCapture?.(pointerId); } catch { /* already let go */ }
        buzz(30);
        setHeld(tile);
      }, HOLD_MS);
    }
  };
  const onMove = (e) => {
    const s = start.current;
    if (!s) return;
    if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > 10) stopHold();
    setDrag({ x: (e.clientX - s.x) / s.k, y: (e.clientY - s.y) / s.k });
  };
  const onUp = (e) => {
    stopHold();
    const s = start.current;
    start.current = null;
    setDrag(null);
    if (!s) return;
    const dir = swipeDirection(e.clientX - s.x, e.clientY - s.y);
    if (dir) { if (!playTo(dir)) setNote('No color that way'); return; }
    if (!s.onTile) { setSelected(null); setPage(0); } // a tap off the tiles: put it back
  };
  const dragDir = drag ? swipeDirection(drag.x, drag.y, 16) : null;

  const { width, perRow } = handTileWidth(tiles.length, box.w, box.h);
  const message = note ?? (!playing ? '' : !myTurn ? `${table.seats[r?.turn]?.name ?? '…'}’s turn`
    : selected ? `${playStyle ? `${styleWord(playStyle)}: ` : ''}${spots.length > 1 ? 'Swipe toward a color' : `Swipe ${spots[0]?.dir ?? 'up'} to play`}`
      : moves.length ? 'Your turn: pick a domino, or hold one to slam or spin' : canDrawPublic(table) ? 'Nothing fits: draw a tile' : 'Nothing fits: pass');
  return (
    <>
    <div className={`dom-handview${myTurn && playing ? ' my-turn' : ''}`} ref={root} onContextMenu={(e) => e.preventDefault()} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => { stopHold(); start.current = null; setDrag(null); }}>
      {Object.entries(AIM).map(([dir, a]) => (
        <button key={dir} type="button" className={`dh-edge ${dir}${byDir[dir] ? ' lit' : ''}${dragDir === dir && byDir[dir] ? ' hot' : ''}`} style={{ '--aim': a.color }}
          disabled={!byDir[dir]} tabIndex={byDir[dir] ? 0 : -1} aria-hidden={!byDir[dir]} onClick={() => playTo(dir)}>
          {byDir[dir] && <span><i aria-hidden="true">{a.arrow}</i> {label(byDir[dir])}</span>}
        </button>
      ))}
      <div className="dh-top">
        <button type="button" className="dh-exit" onClick={onExit}><Icon name="close" size={16} /> Table</button>
        <span className={`dh-count${byDir.up ? ' hide' : ''}`}>{tiles.length} tile{tiles.length === 1 ? '' : 's'}{VARIANTS[table.settings.variant].draws ? ` · ${boneyard} to draw` : ''}</span>
        {call.joined && <MyCallButtons call={call} onMore={onMore} />}
      </div>
      <p className={`dh-status${myTurn && playing ? ' turn' : ''}`} role="status">{message}</p>
      <div className="dh-tiles" ref={area}>
        <div className="dh-grid" style={{ width: perRow * width + (perRow - 1) * 8, '--w': `${width}px` }}>
          {tiles.map((t) => {
            const [a, b] = halves(t);
            const sel = selected === t;
            return (
              <button key={t} type="button" data-tile={t} className={`dh-tile${sel ? ' sel' : ''}${myTurn && !playable.has(t) ? ' dim' : ''}`} aria-label={`${a} and ${b}`} aria-pressed={sel}
                style={sel && drag ? { transform: `translate(${drag.x}px, ${drag.y}px) scale(1.06)`, transition: 'none' } : undefined}>
                <Domino a={a} b={b} vertical size={width * 2} />
              </button>
            );
          })}
        </div>
      </div>
      <div className="dh-actions">
        {pages.length > 1 && <button type="button" className="secondary" onClick={() => setPage((p) => (p + 1) % pages.length)}>More spots ({page + 1} of {pages.length})</button>}
        {myTurn && playing && moves.length === 0 && canDrawPublic(table) && <button type="button" className="primary big go" onClick={() => send('d-draw')}>Draw a tile</button>}
        {myTurn && playing && moves.length === 0 && !canDrawPublic(table) && <button type="button" className="secondary big" onClick={() => send('d-pass')}>{kindOf(table) === 'train' ? 'Pass (your train opens)' : 'Pass'}</button>}
      </div>
    </div>
    {held && myTurn && <TileStyleSheet tile={held} onPick={pickStyle} onClose={() => setHeld(null)} />}
    </>
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
  const plural = table.settings.teams ? '' : 's';
  if (byRounds(table)) {
    const champ = table.match.winner;
    const need = roundsToWin(table);
    const blocked = res.reason === 'blocked';
    const fewest = Math.min(...res.seatPips);
    return (
      <div className="dom-result">
        {over && <Confetti />}
        <div className="card dom-result-card">
          <h2>{over ? `${sideName(table, champ)} win${plural} the set!` : res.reason === 'domino' ? `${table.seats[res.outSeat]?.name} went out!` : 'Blocked: nobody can play'}</h2>
          <p className="muted">
            {winnerName
              ? `${winnerName} win${plural} the round${blocked ? ` with the fewest dots (${fewest})` : ''}.`
              : 'A tie for the fewest dots: nobody wins this round.'}
            {!over && need ? ` First to ${need} wins the set.` : ''}
          </p>
          {blocked && (
            <div className="dom-dots">
              <div className="section-title">Dots left</div>
              {res.seatPips.map((p, s) => (
                <div key={s} className={`dom-dots-row${p === fewest ? ' best' : ''}`}><span>{table.seats[s]?.name}</span><b>{p}</b></div>
              ))}
            </div>
          )}
          <div className="dom-result-rows">
            {table.match.scores.map((sc, i) => (
              <div key={i} className={`dom-result-row${res.winner === i ? ' best' : ''}`}>
                <span>{sideName(table, i)}</span>
                <b>{sc}<small> {sc === 1 ? 'round' : 'rounds'}</small></b>
                <small>{setsWon(table, i) ? `${setsWon(table, i)} set${setsWon(table, i) === 1 ? '' : 's'}` : ''}</small>
              </div>
            ))}
          </div>
          {over
            ? (isHost
              ? <button type="button" className="primary big go" onClick={() => act((t) => startMatch(t))}>Next set</button>
              : <p className="muted">The host can start the next set.</p>)
            : <p className="muted small">Next round in {left}…</p>}
          {over && <button type="button" className="text-btn" onClick={onLeave}>Leave</button>}
        </div>
      </div>
    );
  }
  if (VARIANTS[table.settings.variant].lowWins) {
    const order = table.match.scores.map((sc, i) => ({ sc, i })).sort((x, y) => x.sc - y.sc);
    const champ = table.match.winner;
    return (
      <div className="dom-result">
        {over && <Confetti />}
        <div className="card dom-result-card">
          <h2>{over ? (champ != null ? `${sideName(table, champ)} win${table.settings.teams ? '' : 's'} the game!` : 'It’s a tie!') : res.reason === 'domino' ? `${table.seats[res.outSeat]?.name} went out!` : 'Blocked: nobody can play'}</h2>
          <p className="muted">{over ? 'Lowest total wins.' : `${res.reason === 'blocked' && winnerName ? `${winnerName} had the lowest hand. ` : ''}Round ${table.match.hands.length} of ${roundsOf(table)} done. Pips left in your hand count against you.`}</p>
          <div className="dom-result-rows">
            {order.map(({ sc, i }) => (
              <div key={i} className={`dom-result-row${over && i === champ ? ' best' : ''}`}><span>{sideName(table, i)}</span><b>{sc}</b><small>{res.points[i] > 0 ? `+${res.points[i]}` : 'out'}</small></div>
            ))}
          </div>
          {over
            ? (isHost
              ? <button type="button" className="primary big go" onClick={() => act((t) => startMatch(t))}>Play again</button>
              : <p className="muted">The host can start another game.</p>)
            : <p className="muted small">Next round ({Math.max(0, table.settings.setMax - table.match.hands.length)}|{Math.max(0, table.settings.setMax - table.match.hands.length)} in the middle) in {left}…</p>}
          {over && <button type="button" className="text-btn" onClick={onLeave}>Leave</button>}
        </div>
      </div>
    );
  }
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
