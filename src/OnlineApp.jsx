import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { read, write, tabRead, tabWrite } from './lib/store.js';
import { bigLayout, gridLayout } from './lib/bigLayout.js';
import { useTurnAlerts, sendTurnAlert, alertPermission } from './lib/push.js';
import { saveGame, savedSummary } from './lib/saved.js';
import { standings, winner, signed, scoreTeam, isNil, nilLabel, STANDARD_RULES } from './lib/scoring.js';
import { SEATS, teamOf, seatEntry } from './lib/table.js';
import { sortHand, cardLabel } from './lib/cards.js';
import { newTable, startGame, deal, placeBid, playCard, playCardAsHost, papiPick, papiGuess, papiFinish, legalCards, backToLobby, publicTable, currentHand, ONLINE_RULES } from './lib/online.js';
import { botBid, botPlay, pickBotNames } from './lib/bots.js';
import { useRoom, joinLink } from './lib/room.js';
import { useDevice, rememberTvScreen } from './lib/device.js';
import { useCall } from './lib/call.js';
import { useKeys, seal, unseal } from './lib/secret.js';
import { useWakeLock, chime, buzz, dealSound, thud, glassBreak, cardSound, sweepSound, setSoundSetting, useSoundSettings } from './lib/fx.js';
import { recordGame, useStatsSync, nameKey } from './lib/stats.js';
import Stats from './Stats.jsx';
import DeckPicker from './DeckPicker.jsx';
import { useDeck } from './lib/decks.js';
import { Avatar, ProfileEditor } from './Avatar.jsx';
import { loadName, saveName, loadAvatar, saveAvatar, useAvatars } from './lib/profile.js';
import { useTableLayout, Icon, FannedHand, BagMeter, PlayingCard, CardBack, Sheet, RulesFields, Toggle, Segmented, useToast, Confetti, StatusDot, CardText, useCountUp } from './components.jsx';
import { VideoTile, CallButtons, SoundNote, useTvStart, SoundPrompt } from './Video.jsx';
import { HandRow } from './Scoreboard.jsx';
import { history } from './lib/scoring.js';

const ID_KEY = 'spades-device-id';
const TV_ID_KEY = 'spades-tv-id';
// The last online game on this device, for the home screen's Rejoin button.
const TABLE_MODE_KEY = 'spades-table-mode'; // 'full', 'backdrop' (no table, just the theme) or 'video' (just the video chat)
const TV_GRID_KEY = 'spades-tv-grid'; // video chat only on the TV: '4x1' (four across) or '2x2'
const TV_VIEW_KEY = 'spades-tv-view'; // the TV remembers its own view: 'table', 'chat' (table + chat) or 'video' (video chat only)
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
// A hand dealt longer ago than this isn't animated: you've opened the app or come back to it mid-hand.
// (A little slack: the host's clock and this phone's may differ by a second or two.)
const JUST_DEALT_MS = 6000;
const TRICK_SHOW_MS = 1600;
const TURN_ALERT_AFTER_MS = 3000;
const BOOK_FLY_DELAY_MS = 450;
const BOOK_FLY_MS = 800;
// A book ending in a Papi Flip stays up until the card has flipped and been seen.
const PAPI_FLIP_MS = 3000;
const showMs = (lastTrick) => (lastTrick?.cards.at(-1)?.style === 'papi' ? PAPI_FLIP_MS + 1200 : TRICK_SHOW_MS);
const BANNER_DELAY_MS = 4000;
const REACTION_MS = 3200;
const PAPI_ANSWER_MS = 30000;
const PAPI_REVEAL_MS = 5500;
const BOT_GUESS_MS = 1800;
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
  // Emojis and gifts on their way across the table: { id, from, to, item, gift }
  const [reactions, setReactions] = useState([]);
  const addReaction = (x) => {
    const id = Math.random().toString(36).slice(2);
    setReactions((list) => [...list.slice(-12), { ...x, id }]);
    setTimeout(() => setReactions((list) => list.filter((y) => y.id !== id)), REACTION_MS);
  };
  const lastReaction = useRef(0);
  /** Send an emoji (it pops up over you) or a gift (it flies to seat `to`). One every second at most. */
  const react = (to, item, gift) => {
    if (Date.now() - lastReaction.current < 1000 || mySeatRef.current < 0) return;
    lastReaction.current = Date.now();
    room.send({ type: 'o-react', to, item, gift });
    addReaction({ from: mySeatRef.current, to, item, gift });
  };
  const mySeatRef = useRef(-1);
  const hostRef = useRef(null);
  // The spade bluff: how strongly a ♠ shows over each seat's video (0 to 1), set with the slider under your
  // cards so people think you're about to throw a spade. Sent to everyone as you slide (a few times a second).
  const [teases, setTeases] = useState({});
  const teaseOut = useRef({ at: 0, timer: null, level: 0 });
  const tease = (level) => {
    const seat = mySeatRef.current;
    if (seat < 0) return;
    setTeases((x) => ({ ...x, [seat]: level }));
    const q = teaseOut.current;
    q.level = level;
    const go = () => { q.at = Date.now(); q.timer = null; room.send({ type: 'o-tease', level: q.level }); };
    if (Date.now() - q.at > 80) go(); else if (!q.timer) q.timer = setTimeout(go, 80);
  };

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
    if (m.type === 'o-tease') {
      const seatFrom = from && shown ? seatOf(shown, from.id) : -1;
      if (seatFrom >= 0) setTeases((x) => ({ ...x, [seatFrom]: Math.min(1, Math.max(0, Number(m.level) || 0)) }));
      return;
    }
    if (m.type === 'o-react') {
      const seatFrom = from && shown ? seatOf(shown, from.id) : -1;
      if (seatFrom >= 0) addReaction({ from: seatFrom, to: m.to, item: String(m.item).slice(0, 8), gift: Boolean(m.gift) });
      return;
    }
    if (isHost) {
      if (!from) return;
      // Turn alerts: how to reach a player's phone, and whether their app is on screen right now
      if (m.type === 'o-alerts') { if (m.sub?.endpoint) pushSubs.current[from.id] = m.sub; else delete pushSubs.current[from.id]; return; }
      if (m.type === 'o-vis') { if (m.visible) awayIds.current.delete(from.id); else awayIds.current.add(from.id); return; }
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
        error = act((x) => playCardAsHost(x, seat, m.card, m.style, undefined, Boolean(m.thrown)));
      } else if (m.type === 'o-papi-pick' && seat >= 0) {
        error = act((x) => (x.round?.papiGame?.phase === 'pick' ? papiPick(x, seat, m.n) : x));
      } else if (m.type === 'o-papi-guess' && seat >= 0) {
        error = act((x) => (x.round?.papiGame?.guesses?.[seat] == null ? papiGuess(x, seat, m.n) : x));
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
      setClosed({ by: m.by || from.name, saved: Boolean(m.saved) });
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

  // ----- Turn alerts: a push notification when it's your turn and the app isn't on screen -----
  const alerts = useTurnAlerts();
  const pushSubs = useRef({}); // host: player id → their phone's push subscription
  const awayIds = useRef(new Set()); // host: players whose app is off screen
  // Players tell the host how to reach this phone (if alerts are on), and when the app goes off screen.
  useEffect(() => {
    if (!isHost && !tv && hostPeer) room.send({ type: 'o-alerts', sub: alerts.on ? alerts.sub : null }, hostPeer.id);
  }, [isHost, tv, hostPeer?.id, alerts.on, alerts.sub?.endpoint]);
  useEffect(() => {
    if (isHost || tv) return undefined;
    const tell = () => { if (hostRef.current) room.send({ type: 'o-vis', visible: document.visibilityState === 'visible' }, hostRef.current.id); };
    document.addEventListener('visibilitychange', tell);
    return () => document.removeEventListener('visibilitychange', tell);
  }, [isHost, tv]);
  // Host: when it's someone's turn and they've been away (app off screen or disconnected) for a few seconds,
  // send their phone the alert.
  const turnSeat = isHost && table && ['bidding', 'playing'].includes(table.phase) ? table.round?.turn : null;
  const alertKey = turnSeat != null ? `${table.game?.hands.length}:${table.round?.tricks.length}:${table.round?.trick.length}:${table.phase}:${turnSeat}` : null;
  useEffect(() => {
    if (alertKey == null) return undefined;
    const who = table.seats[turnSeat];
    if (!who || who.bot || who.standIn || who.id === me.id || !pushSubs.current[who.id]) return undefined;
    const timer = setTimeout(() => {
      const now = tableRef.current;
      if (now.round?.turn !== turnSeat || !['bidding', 'playing'].includes(now.phase)) return;
      const away = awayIds.current.has(who.id) || !room.peers.some((p) => p.id === who.id);
      const sub = pushSubs.current[who.id];
      if (!away || !sub) return;
      sendTurnAlert(sub, { body: now.phase === 'bidding' ? `${who.name}, it’s your bid` : `${who.name}, it’s your turn`, tag: `turn-${code}` })
        .then((r) => { if (r.gone) delete pushSubs.current[who.id]; });
    }, TURN_ALERT_AFTER_MS);
    return () => clearTimeout(timer);
  }, [alertKey]);
  const autoSeat = (t, s) => t.seats[s]?.bot || (t.seats[s] && !present.has(t.seats[s].id) && t.seats[s].standIn);
  useEffect(() => {
    if (!isHost || !table || !['bidding', 'playing'].includes(table.phase) || table.round.papiGame) return undefined;
    const s = table.round.turn;
    if (!autoSeat(table, s)) return undefined;
    const lastShow = showMs(table.round.lastTrick);
    let wait = table.round.trick.length === 0 && table.round.lastTrick && Date.now() - table.round.lastTrick.at < lastShow ? lastShow : BOT_DELAY_MS;
    // A bot doesn't play on top of a Papi Flip that hasn't flipped yet.
    const flipping = table.round.trick.at(-1)?.style === 'papi';
    if (flipping) wait = Math.max(wait, PAPI_FLIP_MS + 300);
    // Just after the Papi Flip mini game, give everyone a look at the card that turned over.
    if (table.round.trick.some((t) => t.style === 'papi-now') && table.round.trick.length < 4) wait = Math.max(wait, 2200);
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

  // Host: the Papi Flip mini game. Computer players (and anyone away) answer after a moment, anyone who doesn't
  // answer gets a random pick after PAPI_ANSWER_MS, and the card flips PAPI_REVEAL_MS after the reveal.
  const papiGame = table?.round?.papiGame;
  const papiStep = papiGame ? `${papiGame.phase}:${Object.keys(papiGame.guesses).length}` : null;
  useEffect(() => {
    if (!isHost || !papiGame) return undefined;
    const pickFor = (g) => g.numbers[Math.floor(Math.random() * 2)];
    const timers = [];
    const later = (ms, fn) => timers.push(setTimeout(() => act(fn), ms));
    if (papiGame.phase === 'pick') {
      const ms = autoSeat(table, papiGame.seat) ? BOT_GUESS_MS : PAPI_ANSWER_MS;
      later(ms, (x) => (x.round?.papiGame?.phase === 'pick' ? papiPick(x, papiGame.seat, pickFor(x.round.papiGame)) : x));
    } else if (papiGame.phase === 'guess') {
      for (const s of papiGame.guessers) {
        if (papiGame.guesses[s] != null) continue;
        const ms = autoSeat(table, s) ? BOT_GUESS_MS + Math.random() * 1200 : PAPI_ANSWER_MS;
        later(ms, (x) => (x.round?.papiGame?.phase === 'guess' && x.round.papiGame.guesses[s] == null ? papiGuess(x, s, pickFor(x.round.papiGame)) : x));
      }
    } else if (papiGame.phase === 'reveal') {
      later(PAPI_REVEAL_MS, (x) => papiFinish(x));
    }
    return () => timers.forEach(clearTimeout);
  }, [isHost, papiStep]);

  // Host: once the last book has been seen, show the score for a few seconds, then deal the next hand.
  useEffect(() => {
    if (!isHost || table?.phase !== 'scored') return undefined;
    const timer = setTimeout(() => act((x) => (x.phase === 'scored' ? deal(x) : x)), showMs(tableRef.current.round?.lastTrick) + NEXT_HAND_MS);
    return () => clearTimeout(timer);
  }, [isHost, table?.phase, table?.game?.hands.length]);

  // ----- What this device shows -----
  const shown = isHost ? (table ? publicTable(table) : null) : view;
  const mySeat = shown && !tv ? seatOf(shown, me.id) : -1;
  mySeatRef.current = mySeat;
  // Every device keeps the game for stats as hands are scored (computer players noted).
  const scoredHands = shown?.game ? shown.game.hands.filter((h) => !h.inPlay).length : 0;
  useEffect(() => {
    if (shown?.game && !tv) recordGame(shown.game, { mode: 'online', bots: shown.seats.filter((s) => s?.bot).map((s) => s.name) });
  }, [scoredHands, shown?.game?.id, shown?.phase]);
  const handNo = shown?.game?.hands.length ?? 0;
  useEffect(() => setTeases({}), [handNo]); // every hand starts with no spade showing
  const cards = isHost
    ? (mySeat >= 0 && table?.round?.hands ? table.round.hands[mySeat] : null)
    : (myHand && myHand.hand === handNo ? myHand.cards : null);
  useWakeLock(true);
  const tvFit = useTvFit(tv);
  const [tvView, setTvViewState] = useState(() => read(TV_VIEW_KEY) ?? (read('spades-tv-big-video') === true ? 'chat' : 'table'));
  const setTvView = (v) => { setTvViewState(v); write(TV_VIEW_KEY, v); };
  const [tvGrid, setTvGridState] = useState(() => read(TV_GRID_KEY) ?? '4x1');
  const setTvGrid = (g) => { setTvGridState(g); write(TV_GRID_KEY, g); };
  const tableLayout = useTableLayout();
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
      const err = act((x) => (type === 'o-bid' ? placeBid(x, mySeat, body) : type === 'o-play' ? playCardAsHost(x, mySeat, body.card, body.style, undefined, Boolean(body.thrown))
        : type === 'o-papi-pick' ? papiPick(x, mySeat, body.n) : type === 'o-papi-guess' ? papiGuess(x, mySeat, body.n) : x));
      if (err) toast.show(err);
      return err;
    }
    const move = { type, ...body, hand: handNo };
    setPending(move);
    if (hostRef.current) room.send(move, hostRef.current.id);
  };
  const pg = shown?.round?.papiGame;
  const turnKey = shown ? `${shown.phase}:${shown.round?.turn}:${shown.round?.tricks.length}:${shown.round?.trick.length}:${shown.round?.bidsIn}:${pg?.phase}:${Object.keys(pg?.guesses ?? {}).length}` : '';
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

  if (closed) return <GameEnded by={closed.by} saved={closed.saved} code={code} game={shown?.game} onHome={onLeave} />;

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
  // Host: save the game for later. It stays on this phone (under its code) and goes on the home screen's
  // Saved games list; starting it again from there, everyone rejoins with the same code.
  const saveForLater = () => {
    if (!confirm(`Save this game for later? Everyone goes back to the home screen. Start it again from Saved games on this phone, and everyone can rejoin with code ${code}.`)) return;
    const players = [0, 1].map((t) => shown.seats.map((x, s) => (teamOf(s) === t ? x?.name : null)));
    saveGame({ id: `online-${code}`, kind: 'online', code, ...savedSummary(shown.game, players) });
    call.leave();
    forgetGame(code);
    room.send({ type: 'o-closed', by: name, saved: true });
    setTimeout(() => room.send({ type: 'o-closed', by: name, saved: true }), 250);
    setTimeout(onLeave, 600);
  };

  if (tv) {
    return (
      <div className={`app online tv-mode${shown.phase === 'lobby' ? '' : ' at-table'}`} style={tvFit}>
        {shown.phase === 'lobby'
          ? <TvLobby code={code} table={shown} icons={icons} onPlayHere={() => { rememberTvScreen(false); call.leave(); onPlayHere(); }} />
          : <OnlineTable code={code} table={shown} mySeat={-1} cards={null} me={me} isHost={false} call={call} room={room} icons={icons}
              present={present} send={() => {}} toast={toast} waiting={false} tv tvView={tvView} tvGrid={tvGrid} onLeave={onLeave} reactions={reactions} teases={teases} />}
        <TvControls call={call} onLeave={() => { call.leave(); onLeave(); }}
          view={shown.phase === 'lobby' ? null : tvView} onView={setTvView} grid={tvGrid} onGrid={setTvGrid} />
      </div>
    );
  }

  // A laptop or desktop: the table drawn as on a sideways phone, scaled up to fill the window.
  const deskFit = shown.phase !== 'lobby' && tableLayout.zoom > 1
    ? { zoom: tableLayout.zoom, height: window.innerHeight / tableLayout.zoom, minHeight: 0 } : undefined;
  return (
    <div className={`app online${shown.phase === 'lobby' ? '' : ' at-table'}`} style={deskFit}>
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
            present={present} send={send} toast={toast} waiting={Boolean(pending)} reactions={reactions} react={react} teases={teases} tease={tease} alerts={alerts}
            hostActions={isHost ? hostGameActions(act) : null} onLeave={leave} onSave={isHost ? saveForLater : null} />}
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
function GameEnded({ by, saved, code, game, onHome }) {
  const st = game ? standings(game) : null;
  const played = game ? game.hands.filter((h) => !h.inPlay).length : 0;
  return (
    <div className="app game-ended">
      <main className="wrap">
        <div className="card waiting-card ended-card">
          <span className="brand-mark">♠</span>
          <h2>{saved ? `${by ?? 'The host'} saved the game for later` : by ? `${by} closed the game` : 'The game has ended'}</h2>
          {saved && <p className="muted">When they start it again, join with code <b>{code}</b> and you’ll get your seat back.</p>}
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

function OnlineTable({ reactions = [], react, teases = {}, tease, alerts = null, code, table, mySeat, cards, me, isHost, call, room, icons, present, send, toast, waiting, hostActions, onLeave, onSave = null, tv = false, tvView = 'table', tvGrid = null }) {
  const r = table.round;
  const game = table.game;
  const hand = currentHand(table);
  const base = mySeat >= 0 ? mySeat : 0;
  const posOf = (s) => AREAS[(s - base + 4) % 4];
  const myTurn = mySeat >= 0 && r?.turn === mySeat && ['bidding', 'playing'].includes(table.phase) && !r?.papiGame;
  const [selected, setSelected] = useState(null);
  const [sending, setSending] = useState(false);
  const [peeked, setPeeked] = useState(null); // hand number whose cards I've looked at
  const [blindAsk, setBlindAsk] = useState(false); // confirming a blind nil bid
  const [decksOpen, setDecksOpen] = useState(false);
  const [tvOpen, setTvOpen] = useState(false);
  const [callOpen, setCallOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false); // choosing video or audio only
  // Hand view: just your cards, big, for playing with the table on a TV. Always starts in the table view.
  const [handView, setHandView] = useState(false);
  // How much of the table to show on this device (••• menu), remembered for next time.
  const [tableMode, setTableModeState] = useState(() => (tv ? 'full' : read(TABLE_MODE_KEY) ?? 'full'));
  const setTableMode = (m) => { setTableModeState(m); write(TABLE_MODE_KEY, m); };
  const videoOnly = tv ? tvView === 'video' : tableMode === 'video';
  const sound = useSoundSettings();
  const [lastTest, setLastTest] = useState(null); // the test alert's result (shown in the menu)
  const big = videoOnly || (tv && tvView === 'chat'); // video tiles: video chat only, or the TV's table + chat
  // A seat's books/bid ('bidding…' or '–' until they've bid), for its nameplate or its big video tile.
  const scoreText = (s) => {
    const entry = seatEntry(hand, s);
    const call = isNil(entry.call) ? nilLabel(entry.call) : entry.bid;
    if (table.phase !== 'bidding') {
      // The winner's new book only shows once the gold has flown into it (see BookFly), then pops in
      const flying = flyUntil && s === r.lastTrick.winner;
      const books = entry.books - (flying && Date.now() < flyUntil ? 1 : 0);
      return <><span key={books} className={`sc-books${flying && Date.now() >= flyUntil ? ' bump' : ''}`}>{books}</span><small>/{call}</small></>;
    }
    if (hasBid(table, s)) return isNil(entry.call) ? call : `bid ${call}`;
    return table.round?.turn === s ? 'bidding…' : '–';
  };
  const deck = useDeck();
  const [now, setNow] = useState(Date.now());
  const st = standings(game);

  // Let the finished book sit on the table for a moment.
  const lastShow = showMs(r?.lastTrick);
  const showingLast = r?.lastTrick && r.trick.length === 0 && now - r.lastTrick.at < lastShow;
  // When a book is won, the winning card's gold outline flies into the winner's books count
  // (BOOK_FLY_DELAY_MS after the trick ends, for BOOK_FLY_MS), and the count goes up as it lands.
  const flyUntil = showingLast && r.lastTrick.cards?.length === 4 ? r.lastTrick.at + BOOK_FLY_DELAY_MS + BOOK_FLY_MS : 0;
  const [, setFlyTick] = useState(0);
  useEffect(() => {
    if (!flyUntil) return undefined;
    const t = setTimeout(() => setFlyTick((x) => x + 1), Math.max(0, flyUntil - Date.now()) + 20);
    return () => clearTimeout(t);
  }, [flyUntil]);
  useEffect(() => {
    if (!r?.lastTrick) return undefined;
    const t = setTimeout(() => setNow(Date.now()), Math.max(0, lastShow - (Date.now() - r.lastTrick.at)) + 30);
    return () => clearTimeout(t);
  }, [r?.lastTrick?.at]);

  useEffect(() => { setSelected(null); setSending(false); }, [r?.trick.length, r?.tricks.length, table.phase]);
  // If a move hasn't gone through and nothing is being resent, let them try again.
  useEffect(() => { if (!waiting) setSending(false); }, [waiting]);
  useEffect(() => { if (myTurn) { buzz(60); } }, [myTurn, r?.tricks.length, table.phase]);

  const handNo = game.hands.length;
  // A slammed card lands with a thud (on every screen, as it lands).
  const lastPlayed = r?.trick.at(-1) ?? (r?.lastTrick && Date.now() - r.lastTrick.at < 1000 ? r.lastTrick.cards.at(-1) : null);
  const slamKey = lastPlayed?.style === 'slam' ? `${handNo}:${r.tricks.length}:${lastPlayed.seat}` : null;
  // Glass breaking when spades are broken (the moment it happens, not when joining a hand already broken).
  const broken = Boolean(r?.spadesBroken);
  const wasBroken = useRef({ hand: handNo, broken });
  useEffect(() => {
    const w = wasBroken.current;
    if (broken && !(w.hand === handNo && w.broken)) glassBreak({ delay: 0.25 });
    wasBroken.current = { hand: handNo, broken };
  }, [broken, handNo]);
  // A real card slide as each card lands (thrown and fancy plays land later; slams have their thud), and a
  // soft sweep when the finished trick is cleared away.
  const landDelay = (c) => (c?.style || c?.thrown ? 0.45 : 0.18);
  const trickLen = r?.trick.length ?? 0;
  const seenLen = useRef(trickLen);
  useEffect(() => {
    if (trickLen > seenLen.current) { const c = r.trick.at(-1); if (c?.style !== 'slam') cardSound({ delay: landDelay(c) }); }
    seenLen.current = trickLen;
  }, [trickLen, handNo]);
  const doneAt = r?.lastTrick?.at;
  useEffect(() => {
    if (!doneAt || Date.now() - doneAt > 1200) return;
    const c = r.lastTrick.cards.at(-1);
    if (c?.style !== 'slam') cardSound({ delay: landDelay(c) });
    sweepSound({ delay: Math.max(0.5, showMs(r.lastTrick) / 1000 - 0.1) });
  }, [doneAt]);
  // The thud, and a hard double buzz on anything that can vibrate, as the slammed card hits the table.
  useEffect(() => {
    if (slamKey) setTimeout(() => { thud(); if (document.visibilityState === 'visible') buzz([70, 40, 120]); }, 400);
  }, [slamKey]);
  const dealing = useDealing(`${game.id}:${handNo}`, table.phase === 'bidding' && r?.bidsIn === 0 && Date.now() - (r?.dealtAt ?? 0) < JUST_DEALT_MS);
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

  const canAct = table.phase === 'playing' && myTurn && !sending && !r?.papiGame;
  const playCardNow = (card, style) => {
    if (!legal.includes(card)) return;
    setSelected(null);
    setSending(true);
    // The host's own play is applied at once: if it was refused, let them try again straight away.
    if (send('o-play', { card, ...(style ? { style } : {}), ...(handView ? { thrown: true } : {}) })) setSending(false);
  };
  // Holding a card: pick a fancier way to play it.
  const [holdCard, setHoldCard] = useState(null);
  const [reactTo, setReactTo] = useState(null); // the seat a gift is for (yourself: just emojis)
  const canReact = Boolean(react) && mySeat >= 0;
  const tapSeat = (s) => { if (canReact && table.seats[s]) setReactTo(s); };
  const onHold = (card) => (legal.includes(card) ? setHoldCard(card) : toast.show(refuseReason(table, cards)));
  const play = () => { if (selected) playCardNow(selected); };
  const videoOf = (id) => (id === me.id ? call.local : call.videos.find((v) => v.peer.id === id)?.stream);
  const peerOf = (id) => room.peers.find((p) => p.id === id);
  const trickCards = showingLast ? r.lastTrick.cards : r?.trick ?? [];

  const { layout } = useTableLayout();
  // The spade bluff slider: under your cards when upright, just to their right when sideways.
  const bluff = tease && cards && !dealing && !coverCards && ['bidding', 'playing'].includes(table.phase) && (
    <label className="spade-bluff">
      <span className="sb-min" aria-hidden="true">♠</span>
      <input type="range" min="0" max="1" step="0.01" value={teases[mySeat] ?? 0} onChange={(e) => tease(Number(e.target.value))}
        aria-label="Spade bluff: fade a spade in over your video" />
      <span className="sb-max" aria-hidden="true">♠</span>
    </label>
  );
  const fan = (list, row) => (
    <FannedHand key={row} cards={list} selected={selected} dealKey={`${handNo}${row}`} big={handView} aside={layout === 'wide' ? bluff : null}
      onSelect={canAct ? (c) => setSelected(c && legal.includes(c) ? c : null) : undefined}
      onPlay={canAct ? playCardNow : undefined} playable={legal} onHold={canAct ? onHold : undefined}
      onRefuse={() => toast.show(refuseReason(table, cards))}
      dim={table.phase === 'playing' && myTurn ? list.filter((c) => !legal.includes(c)) : []} />
  );
  // Your cards (or the dealing / face-down step) and what you can do now: shared by the table view's hand
  // strip and the hand view.
  const handArea = (dealing ? (
            <p className="dock-hint">Dealing…</p>
          ) : coverCards ? (
            // Your new hand, face down until you look (blind nil has to be bid before looking).
            <div className="blind-choice">
              <div className="facedown-fan" aria-hidden="true">
                {Array.from({ length: 13 }, (_, k) => <CardBack key={k} size="sm" style={{ '--k': k - 6 }} />)}
              </div>
              <button type="button" className="primary big" onClick={() => setPeeked(handNo)}>Show my cards</button>
              {myTurn && <button type="button" className="text-btn blind-link" onClick={() => setBlindAsk(true)}>Bid blind nil…</button>}
            </div>
          ) : cards ? (
            // Hand view on an upright phone: two overlapping rows, so the cards can be big.
            handView && layout === 'tall' && sorted.length > 7
              ? <div className="hv-rows">{fan(sorted.slice(0, Math.ceil(sorted.length / 2)), 'a')}{fan(sorted.slice(Math.ceil(sorted.length / 2)), 'b')}</div>
              : fan(sorted, '')
          ) : (
            <p className="dock-hint">Getting your cards…</p>
          ));
  const actionArea = (
    <>
            {myTurn && table.phase === 'bidding' && !coverCards && <BidPad onBid={(b) => send('o-bid', b)} />}
            {myTurn && table.phase === 'playing' && (selected
              ? <button type="button" className="primary big go" disabled={sending} onClick={play}>Play <CardText code={selected} /></button>
              : null)}
    </>
  );

  return (
    <>
      {handView ? (
        <HandView reactions={reactions} onReact={canReact ? () => setReactTo(mySeat) : null} mySeat={mySeat} table={table} st={st} myTurn={myTurn} left={left} hurry={hurry} call={call}
          handArea={<>{handArea}{layout !== 'wide' && bluff}</>} actionArea={actionArea} onTable={() => setHandView(false)} onMore={() => setCallOpen(true)}
          onJoinCall={() => setJoinOpen(true)} entry={seatEntry(hand, mySeat)} />
      ) : <>
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
                {game.rules.bagsEnabled && <BagMeter bags={st[t].bags} limit={game.rules.bagsLimit} />}
              </span>
            </div>
          ))}
        </div>
        <div className="online-meta">
          <span>Hand {handNo} · to {game.target}</span>
          {!tv && (
            <TableMenu items={[
              call.joined
                ? { icon: 'video', label: 'Video chat settings', onClick: () => setCallOpen(true) }
                : { icon: 'video', label: 'Join A/V Chat', onClick: () => setJoinOpen(true) },
              { icon: 'users', label: 'Video chat only', note: 'Hide the table, fill it with video', on: tableMode === 'video', onClick: () => setTableMode(tableMode === 'video' ? 'full' : 'video') },
              { icon: 'expand', label: 'Hide the table', note: 'Just the backdrop', on: tableMode === 'backdrop', onClick: () => setTableMode(tableMode === 'backdrop' ? 'full' : 'backdrop') },
              mySeat >= 0 && { icon: 'hand', label: 'Hand view', note: 'Just your cards, big', onClick: () => setHandView(true) },
              { icon: 'tv', label: 'Add a TV', onClick: () => setTvOpen(true) },
              { icon: 'cards', label: 'Cards & table', onClick: () => setDecksOpen(true) },
              // Turn alerts: always listed, with a note saying what's needed when they can't work here
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
                onClick: () => {
                  const perm = alertPermission();
                  if (perm !== 'granted') { setLastTest(`notifications are ${perm}`); toast.show(`Notifications for Family Spades are ${perm === 'denied' ? 'blocked' : 'not allowed yet'}: allow them in Settings → Notifications → Family Spades.`); return; }
                  if (!alerts.sub) { alerts.retry().then((why) => { setLastTest(why ?? 'signed up: try the test again'); toast.show(why ?? 'Signed up: tap Send a test alert again.'); }); return; }
                  toast.show('Test alert on its way: lock your phone or go to the home screen');
                  // (the result shows when you come back to the app)
                  setLastTest('sending…');
                  sendTurnAlert(alerts.sub, { body: 'Test: this is your turn alert', tag: 'test', delay: 6 }).then((r) => { setLastTest(r.why); toast.show(r.why); });
                },
              },
              { icon: sound.effects ? 'speaker' : 'speakerOff', label: 'Sound effects', on: sound.effects, onClick: () => setSoundSetting('effects', !sound.effects) },
              { icon: sound.glass ? 'speaker' : 'speakerOff', label: 'Glass break sound', note: 'When spades are broken', on: sound.glass, onClick: () => setSoundSetting('glass', !sound.glass) },
              onSave && { icon: 'home', label: 'Save for later', note: 'Pick it up again from the home screen', onClick: onSave },
              { icon: 'close', label: isHost ? 'End game' : 'Leave game', danger: true, onClick: onLeave },
            ]} />
          )}
        </div>
      </header>

      <div className={`felt${big ? ' big-on' : ''}${tableMode !== 'full' || videoOnly ? ' no-table' : ''}${videoOnly ? ' video-only' : ''}`}>
        <div className="table-oval" aria-hidden="true">
          <span className="table-logo">♠</span>
          {deck.verse && <p className="table-verse">“{deck.verse}”<small>{deck.verseRef}</small></p>}
        </div>
        {SEATS.map((_, s) => {
          const who = table.seats[s];
          const away = who && !who.bot && !present.has(who.id);
          const turn = r?.turn === s && ['bidding', 'playing'].includes(table.phase);
          // With big videos on, faces move to the corner tiles (so nobody's video, or sound, plays twice).
          const stream = who && !who.bot && !big ? videoOf(who.id) : null;
          const held = s !== mySeat && !dealing && table.phase !== 'scored' && table.phase !== 'over' ? r?.counts?.[s] ?? 0 : 0;
          return (
            <div key={s} className={`player-spot ${posOf(s)} t${teamOf(s)}${turn ? ' turn' : ''}${showingLast && r.lastTrick.winner === s ? ' won' : ''}${s === mySeat ? ' me' : ''}`}>
              {held > 0 && !big && (
                <div className="spot-backs" aria-label={`${held} cards`}>
                  {Array.from({ length: Math.min(held, 7) }, (_, k) => <CardBack key={k} size="xs" style={{ '--k': k - (Math.min(held, 7) - 1) / 2 }} />)}
                  <span className="held-count">{held}</span>
                </div>
              )}
              <div className={`avatar${canReact ? ' tappable' : ''}`} data-seat={s} onClick={() => tapSeat(s)}>
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
                  <>
                    <Avatar value={who ? icons[who.id] : null} name={who?.name ?? '?'} bot={who?.bot} className="seat-icon" />
                    {stream && <SpeakingRings stream={stream} />}
                  </>
                )}
                {teases[s] > 0 && <SpadeTease level={teases[s]} />}
                {r?.dealer === s && <span className="dealer-chip">D</span>}
              </div>
              {/* With big videos on, each player's name and books/bid are in the title bar over their tile instead */}
              {!big && (
                <div className="nameplate">
                  <span className="spot-name">{s === mySeat ? 'You' : who?.name}</span>
                  <span className="spot-score">{scoreText(s)}</span>
                </div>
              )}
              {s === mySeat && call.joined && !big && <MyCallButtons call={call} onMore={() => setCallOpen(true)} />}
              {away && (
                <div className="away">
                  {who.standIn ? 'computer playing' : 'reconnecting…'}
                  {isHost && <button type="button" className="text-btn small" onClick={() => hostActions.standIn(s, !who.standIn)}>{who.standIn ? 'Wait instead' : 'Computer plays'}</button>}
                </div>
              )}
            </div>
          );
        })}

        {big && (
          <BigVideos onTap={tapSeat} table={table} posOf={posOf} mySeat={mySeat} me={me} call={call} icons={icons}
            videoOf={videoOf} peerOf={peerOf} left={left} hurry={hurry} scoreText={scoreText} tv={tv} teases={teases} fill={videoOnly} shape={tv ? tvGrid : null}
            played={videoOnly ? Object.fromEntries(trickCards.map((t) => [t.seat, t.card])) : null}
            wonBy={showingLast ? r.lastTrick.winner : null}
            onMore={() => setCallOpen(true)} />
        )}
        {dealing && <DealAnimation dealer={r.dealer} posOf={posOf} />}
        <ReactionsLayer reactions={reactions} names={table.seats.map((w, s) => (s === mySeat ? 'You' : w?.name))} />
        {flyUntil > 0 && Date.now() < flyUntil && <BookFly key={r.lastTrick.at} />}
        {big && (
          <div className="trick trick-ghost" aria-hidden="true">
            {['bottom', 'left', 'top', 'right'].map((p) => <div key={p} className={`trick-card ${p}`}><PlayingCard code="AS" size="md" /></div>)}
          </div>
        )}
        <div className="trick">
          {trickCards.map(({ seat, card, style, thrown }) => (
            <div key={seat} className={`trick-card ${posOf(seat)}${style ? ` play-${style}` : ''}${thrown && !style ? ' thrown' : ''}${showingLast && r.lastTrick.winner === seat ? ' won' : ''}`}>
              {style?.startsWith('papi') ? (
                // The Papi Flip: lands face down, turns over after 3 seconds ('papi'), or stays down for the mini
                // game ('papi-wait') and turns over when it's done ('papi-now').
                <div className={`papi ${style}`}><PlayingCard code={card} size="md" /><CardBack size="md" /></div>
              ) : <PlayingCard code={card} size="md" />}
            </div>
          ))}
          {!trickCards.length && table.phase === 'playing' && (
            <div className="trick-msg">{r.spadesBroken ? '♠ broken' : 'Spades not broken'}</div>
          )}
          {showingLast && <div className="trick-msg winner-msg">{r.lastTrick.winner === mySeat ? 'You take it' : `${table.seats[r.lastTrick.winner]?.name} takes it`}</div>}
        </div>
      </div>

      {/* Not seated (watching): the call controls sit under the top bar instead of on a seat. */}
      {call.joined && !tv && mySeat < 0 && (
        <div className="online-call watching"><CallButtons call={call} size={18} /><SoundNote call={call} /></div>
      )}
      {callOpen && call.joined && (
        <Sheet title="Video chat" short onClose={() => setCallOpen(false)} closeLabel="Done">
          <div className="call-sheet">
            <CallButtons call={{ ...call, leave: () => { setCallOpen(false); call.leave(); } }} size={22} />
            <div className="card group call-options">
              <Toggle label="Video chat only" checked={videoOnly}
                onChange={(on) => setTableMode(on ? 'video' : 'full')} />
            </div>
            <SoundNote call={call} />
          </div>
        </Sheet>
      )}

      {/* This player's hand and controls */}
      {mySeat >= 0 && (
        <div className="hand-dock online-dock">
          <div className="dock-head">
            <span>{myTurn ? (table.phase === 'bidding' ? 'Your bid' : 'Your turn') : turnText(table)}
              {left != null && <b className={`dock-clock${hurry ? ' hurry' : ''}`}> · {left}s</b>}</span>
            <span>{cards ? `${cards.length} cards` : ''}</span>
          </div>
          {handArea}
          {layout !== 'wide' && bluff}
          <div className="dock-action">{actionArea}</div>
        </div>
      )}
      </>}

      {decksOpen && <DeckPicker onClose={() => setDecksOpen(false)} />}
      {blindAsk && myTurn && table.phase === 'bidding' && (
        <Sheet title="Are you sure?" short onClose={() => setBlindAsk(false)} closeLabel="Cancel">
          <div className="blind-confirm">
            <button type="button" className="danger big" onClick={() => { setBlindAsk(false); send('o-bid', { call: 'blind' }); }}>Yes, bid blind nil</button>
            <button type="button" className="secondary big" onClick={() => { setBlindAsk(false); setPeeked(handNo); }}>No, show my cards</button>
          </div>
        </Sheet>
      )}
      {r?.papiGame && <PapiGame g={r.papiGame} table={table} mySeat={mySeat} icons={icons} send={send} />}
      {reactTo != null && canReact && (
        <ReactSheet table={table} mySeat={mySeat} icons={icons} to={reactTo} onTo={setReactTo}
          onSend={(to, item, gift) => { react(to, item, gift); setReactTo(null); }} onClose={() => setReactTo(null)} />
      )}
      {holdCard && canAct && (
        <Sheet title={`Play ${cardLabel(holdCard)} with…`} short onClose={() => setHoldCard(null)} closeLabel="Cancel">
          <div className="play-styles">
            {PLAY_STYLE_CHOICES.map((p) => (
              <button key={p.id} type="button" className={`play-style style-${p.id}`} onClick={() => { const c = holdCard; setHoldCard(null); playCardNow(c, p.id === 'toss' ? null : p.id); }}>
                <span className="play-style-icon">{p.icon}</span>
                <b>{p.name}</b>
                <span>{p.note}</span>
              </button>
            ))}
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
      {tvOpen && <Sheet title="Companion TV" short onClose={() => setTvOpen(false)} closeLabel="Done"><TvInviteCard code={code} /></Sheet>}
      {(table.phase === 'scored' || table.phase === 'over') && !showingLast && (
        <HandResult table={table} isHost={isHost} hostActions={hostActions} />
      )}
    </>
  );
}

/**
 * The Papi Flip mini game, on every screen: Papi picks one of two numbers in secret, his partner and one
 * player from the other team guess it (+25 right, -25 wrong), then the card flips.
 */
function PapiGame({ g, table, mySeat, icons, send }) {
  const name = (s) => (s === mySeat ? 'You' : table.seats[s]?.name ?? '?');
  const papi = table.seats[g.seat]?.name ?? 'Papi';
  const [mine, setMine] = useState(null); // the number this device picked or guessed
  const iAmPapi = mySeat === g.seat;
  const iGuess = g.guessers.includes(mySeat);
  const choose = (type, n) => { setMine(n); send(type, { n }); };
  const numbers = (onPick) => (
    <div className="papi-numbers">
      {g.numbers.map((n) => (
        <button key={n} type="button" className={`papi-number${mine === n ? ' on' : ''}`} disabled={!onPick || mine != null} onClick={() => onPick?.(n)}>{n}</button>
      ))}
    </div>
  );
  let body;
  if (g.phase === 'pick') {
    body = iAmPapi
      ? <><p>Pick your secret number. Your partner and one of the other team will try to guess it.</p>{numbers((n) => choose('o-papi-pick', n))}</>
      : <><p><b>{papi}</b> is picking a secret number…</p>{numbers(null)}</>;
  } else if (g.phase === 'guess') {
    const waiting = g.guessers.filter((s) => g.guesses[s] == null);
    body = iGuess && g.guesses[mySeat] == null && mine == null
      ? <><p>Which number did <b>{papi}</b> pick? <span className="papi-stakes">+25 right · −25 wrong</span></p>{numbers((n) => choose('o-papi-guess', n))}</>
      : <>
          <p>{iAmPapi && mine != null ? <>You picked <b>{mine}</b>. </> : null}{waiting.length ? <>Waiting for {waiting.map(name).join(' and ')}…</> : 'Revealing…'}</p>
          <div className="papi-guessers">
            {g.guessers.map((s) => (
              <span key={s} className={`papi-guesser t${teamOf(s)}`}>
                <Avatar value={icons[table.seats[s]?.id]} name={table.seats[s]?.name ?? '?'} bot={table.seats[s]?.bot} />
                {name(s)} {g.guesses[s] != null ? '✓' : '…'}
              </span>
            ))}
          </div>
        </>;
  } else {
    body = <>
      <p className="papi-answer">{papi} picked <b>{g.pick}</b>!</p>
      <div className="papi-results">
        {g.guessers.map((s) => (
          <div key={s} className={`papi-result t${teamOf(s)} ${g.results[s] > 0 ? 'won' : 'lost'}`}>
            <Avatar value={icons[table.seats[s]?.id]} name={table.seats[s]?.name ?? '?'} bot={table.seats[s]?.bot} />
            <span>{name(s)} guessed {g.guesses[s]}</span>
            <b>{g.results[s] > 0 ? `✓ +${g.results[s]}` : `✗ ${g.results[s]}`}</b>
          </div>
        ))}
      </div>
    </>;
  }
  return (
    <div className={`papi-game ${g.phase}`} role="dialog" aria-label="The Papi Flip">
      <div className="papi-title">🃏 The Papi Flip!</div>
      {body}
    </div>
  );
}

// Emojis pop up over you; gifts fly to someone. Grouped for the picker; all clean.
const EMOJI_GROUPS = [
  ['Feelings', ['😂', '🤣', '😍', '🥰', '😎', '🥳', '😮', '😱', '🤯', '😬', '😢', '😭']],
  ['At the table', ['👏', '🔥', '💯', '🙏', '👍', '👎', '💪', '🤔', '🙄', '🤫', '😴', '🥶', '😤', '🤡', '🫡', '♠️', '💀', '🎉']],
];
const GIFT_GROUPS = [
  ['Treats', [['☕', 'Coffee'], ['🍩', 'Donut'], ['🍪', 'Cookie'], ['🧁', 'Cupcake'], ['🎂', 'Cake'], ['🍕', 'Pizza'],
    ['🌮', 'Taco'], ['🍿', 'Popcorn'], ['🍦', 'Ice cream'], ['🥤', 'Soda'], ['🍉', 'Watermelon'], ['🍫', 'Chocolate']]],
  ['Prizes', [['🏆', 'Trophy'], ['🥇', 'Gold medal'], ['👑', 'Crown'], ['💎', 'Diamond'], ['🐐', 'GOAT'], ['⭐', 'Star']]],
  ['Just for fun', [['🌹', 'Rose'], ['💐', 'Flowers'], ['🎈', 'Balloon'], ['🎁', 'Present'], ['🧸', 'Teddy bear'], ['🍀', 'Good luck'],
    ['🌈', 'Rainbow'], ['🚀', 'Rocket'], ['🧯', 'Cool off'], ['🧊', 'Ice cold'], ['🎺', 'Fanfare'], ['💖', 'Love']]],
];

/** Pick who and what: emojis and gifts fly to the player picked (emojis can also just pop up over you). */
function ReactSheet({ table, mySeat, icons, to, onTo, onSend, onClose }) {
  const others = SEATS.map((_, s) => s).filter((s) => s !== mySeat && table.seats[s]);
  const forMe = to === mySeat;
  return (
    <Sheet title="Emojis & gifts" short onClose={onClose} closeLabel="Close">
      <div className="react-sheet">
        <div className="section-title">Send to</div>
        <div className="react-to">
          {others.map((s) => (
            <button key={s} type="button" className={`react-person t${teamOf(s)}${to === s ? ' on' : ''}`} onClick={() => onTo(s)}>
              <Avatar value={icons[table.seats[s].id]} name={table.seats[s].name} bot={table.seats[s].bot} />
              <span>{table.seats[s].name}</span>
            </button>
          ))}
          <button type="button" className={`react-person me${forMe ? ' on' : ''}`} onClick={() => onTo(mySeat)}>
            <span className="react-me" aria-hidden="true">✨</span><span>Just me</span>
          </button>
        </div>
        {EMOJI_GROUPS.map(([title, list]) => (
          <div key={title}>
            <div className="react-subtitle">{title}</div>
            <div className="react-grid emojis">
              {list.map((e) => <button key={e} type="button" onClick={() => onSend(forMe ? null : to, e, false)} aria-label={`Send ${e}`}>{e}</button>)}
            </div>
          </div>
        ))}
        <div className="section-title">Gifts{forMe ? '' : ` for ${table.seats[to]?.name ?? ''}`}</div>
        {GIFT_GROUPS.map(([title, list]) => (
          <div key={title}>
            <div className="react-subtitle">{title}</div>
            <div className={`react-grid gifts${forMe ? ' waiting' : ''}`}>
              {list.map(([e, name]) => (
                <button key={e} type="button" disabled={forMe} onClick={() => onSend(to, e, true)} aria-label={`Send ${name}`}>
                  <span>{e}</span><small>{name}</small>
                </button>
              ))}
            </div>
          </div>
        ))}
        {forMe && <p className="footnote center">Pick who the gift is for.</p>}
      </div>
    </Sheet>
  );
}

/** Emojis popping up over whoever sent them; gifts flying from sender to receiver. */
function ReactionsLayer({ reactions, names = [] }) {
  return <div className="fx-layer" aria-hidden="true">{reactions.map((x) => <Reaction key={x.id} x={x} names={names} />)}</div>;
}

const SPARKS = Array.from({ length: 10 }, (_, i) => i);

/**
 * An emoji that moves: Google's animated Noto emoji (CC BY 4.0, loaded when needed), or the ordinary emoji if
 * there's no animated one (or no connection).
 */
const notoCode = (e) => [...e].map((c) => c.codePointAt(0).toString(16)).filter((h) => h !== 'fe0f').join('_');
function MovingEmoji({ emoji }) {
  const [failed, setFailed] = useState(false);
  if (failed) return emoji;
  return <img className="moving-emoji" src={`https://fonts.gstatic.com/s/e/notoemoji/latest/${notoCode(emoji)}/512.webp`} alt={emoji} draggable="false" onError={() => setFailed(true)} />;
}

function Reaction({ x, names }) {
  const ref = useRef(null);
  const [at, setAt] = useState(null);
  useLayoutEffect(() => {
    const layer = ref.current?.parentElement;
    if (!layer) return;
    const box = layer.getBoundingClientRect();
    const zoom = box.width / layer.offsetWidth || 1;
    // A seat's big video tile if it's showing, otherwise its picture.
    const spot = (s) => {
      const el = [...layer.parentElement.querySelectorAll(`[data-seat="${s}"]`)].find((e) => e.offsetWidth > 0);
      const r = el?.getBoundingClientRect();
      return r ? [(r.left + r.width / 2 - box.left) / zoom, (r.top + r.height / 2 - box.top) / zoom] : null;
    };
    const from = spot(x.from);
    const to = x.to != null && x.to !== x.from ? spot(x.to) : null;
    if (from) setAt({ from, to });
  }, []);
  const style = at ? {
    left: at.from[0], top: at.from[1],
    '--dx': `${at.to ? at.to[0] - at.from[0] : 0}px`, '--dy': `${at.to ? at.to[1] - at.from[1] : 0}px`,
  } : { visibility: 'hidden' };
  const gift = Boolean(at?.to); // flying to someone (a gift, or an emoji sent to them)
  // A burst of sparkles and a ring as it lands (gifts) or pops (emojis); gifts also say who sent them.
  return (
    <span ref={ref} className={`fx ${gift ? 'fx-gift' : 'fx-emoji'}`} style={style}>
      <span className="fx-ring" />
      {SPARKS.map((i) => <span key={i} className="fx-spark" style={{ '--a': `${i * 36 + (i % 2) * 14}deg`, '--d': `${44 + (i % 3) * 16}px` }} />)}
      <span className="fx-item"><MovingEmoji emoji={x.item} /></span>
      {gift && <span className="fx-tag">{names[x.from] ?? '?'} → {names[x.to] ?? '?'}</span>}
    </span>
  );
}

const PLAY_STYLE_CHOICES = [
  { id: 'slam', icon: '💥', name: 'Slam', note: 'Bang it down on the table' },
  { id: 'papi', icon: '🃏', name: 'The Papi Flip', note: 'Face down, flips over in 3 seconds' },
  { id: 'spin', icon: '🌀', name: 'Spin', note: 'Twirl it in' },
  { id: 'toss', icon: '✋', name: 'Toss', note: 'Just play it' },
];

/**
 * Hand view: only your cards, big, as if holding them, for when the table's on the TV. Swipe a card up to
 * throw it on the table. Bidding, the turn, the score and video chat are at hand; one tap goes back.
 */
function HandView({ reactions, onReact, mySeat, table, st, myTurn, left, hurry, call, handArea, actionArea, onTable, onMore, onJoinCall, entry }) {
  const game = table.game;
  const status = myTurn ? (table.phase === 'bidding' ? 'Your bid' : 'Your turn') : turnText(table);
  const mine = table.phase === 'bidding' ? null : `${entry.books}/${isNil(entry.call) ? nilLabel(entry.call) : entry.bid}`;
  return (
    <div className={`hand-view${myTurn ? ' my-turn' : ''}`}>
      <header className="hv-top">
        <button type="button" className="hv-back" onClick={onTable}><Icon name="tv" size={18} /> Table view</button>
        <div className="hv-scores">
          {[0, 1].map((t) => <span key={t} className={`hv-score t${t}`}>{st[t].score}</span>)}
        </div>
        <div className="row hv-call">
          {onReact && <button type="button" className="icon-btn round small hv-react" aria-label="Emojis and gifts" onClick={onReact}>😊</button>}
          {call.joined ? <MyCallButtons call={call} onMore={onMore} /> : (
            <button type="button" className="icon-btn round small" aria-label="Video chat" onClick={onJoinCall}><Icon name="video" size={18} /></button>
          )}
        </div>
      </header>
      <div className="hv-status">
        <b>{status}</b>{left != null && <span className={`dock-clock${hurry ? ' hurry' : ''}`}> · {left}s</span>}
        {mine && <span className="hv-mine">You {mine}</span>}
        <span className="hv-hand-no">Hand {game.hands.length}</span>
      </div>
      <div className="hv-feed" aria-live="polite">
        {reactions.slice(-3).map((x) => (
          <span key={x.id} className="hv-react-note">
            {table.seats[x.from]?.name ?? '?'}{x.to != null && x.to !== x.from ? <> → {x.to === mySeat ? 'you' : table.seats[x.to]?.name}</> : null} <b>{x.item}</b>
          </span>
        ))}
      </div>
      <div className="hv-hand">{handArea}</div>
      <div className="hv-action">{actionArea}</div>
    </div>
  );
}

/** Everything that used to sit in the top right, in one drop-down: tap ••• and pick. */
function TableMenu({ items }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return undefined;
    const key = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open]);
  return (
    <div className="table-menu">
      <button type="button" className={`icon-btn round small${open ? ' on' : ''}`} aria-label="Menu" aria-haspopup="menu" aria-expanded={open}
        onClick={() => setOpen(!open)}><Icon name="more" size={20} /></button>
      {open && (
        <>
          <div className="table-menu-shade" onClick={() => setOpen(false)} />
          <div className="table-menu-list" role="menu">
            {items.filter(Boolean).map((it) => (
              <button key={it.label} type="button" role={it.on != null ? 'menuitemcheckbox' : 'menuitem'} aria-checked={it.on ?? undefined}
                className={`${it.danger ? 'danger-item' : ''}${it.on ? ' on' : ''}`} onClick={() => { setOpen(false); it.onClick(); }}>
                <Icon name={it.icon} size={19} />
                <span>{it.label}{it.note && <small>{it.note}</small>}</span>
                {it.on != null && <span className={`menu-switch${it.on ? ' on' : ''}`} aria-hidden="true" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * How loud a call stream is right now, 0 to 1, checked about eight times a second (0 with no sound, or
 * until the page has been tapped once and sound is allowed).
 */
let levelContext;
function useLevel(stream) {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    if (!stream?.getAudioTracks().length) return undefined;
    let src, analyser, timer;
    try {
      levelContext ??= new (window.AudioContext || window.webkitAudioContext)();
      if (levelContext.state === 'suspended') levelContext.resume().catch(() => {});
      src = levelContext.createMediaStreamSource(stream);
      analyser = levelContext.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser); // (not to the speakers: the call's own audio element plays it)
      const buf = new Float32Array(analyser.fftSize);
      let smooth = 0;
      timer = setInterval(() => {
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length);
        // Quiet room noise counts as silence; normal talking lands around 0.3 to 0.8
        const now = Math.min(1, Math.max(0, (rms - 0.012) * 9));
        smooth = now > smooth ? now : smooth * 0.7 + now * 0.3;
        const q = Math.round(smooth * 10) / 10;
        setLevel((old) => (old === q ? old : q));
      }, 120);
    } catch { /* no level available */ }
    return () => { clearInterval(timer); try { src?.disconnect(); } catch { /* gone */ } };
  }, [stream]);
  return level;
}

/** Ripples spreading from someone's picture while they talk (audio only), stronger when louder. */
function SpeakingRings({ stream, tile = false }) {
  const level = useLevel(stream);
  if (level < 0.1) return null;
  return tile
    ? <span className="speak-glow" style={{ '--lv': level }} aria-hidden="true" />
    : (
      <span className="speak-rings" style={{ '--lv': level }} aria-hidden="true">
        <i /><i style={{ animationDelay: '0.4s' }} /><i style={{ animationDelay: '0.8s' }} />
      </span>
    );
}

/**
 * The gold outline of the winning card, flying into its player's books count: it starts as the card's box,
 * shrinks to a dot and turns white on the way, and is gone as the number goes up.
 */
function BookFly() {
  const ref = useRef(null);
  const [at, setAt] = useState(null);
  useLayoutEffect(() => {
    const felt = ref.current?.parentElement;
    if (!felt) return;
    // From: the winning card (its box in video chat only, or the card on the table).
    // To: the winner's books count (on their video tile, or their nameplate).
    const from = felt.querySelector('.big-tile.won .big-played') ?? felt.querySelector('.trick .trick-card.won .pcard');
    const to = felt.querySelector('.big-tile.won .sc-books') ?? felt.querySelector('.player-spot.won .sc-books');
    if (!from || !to) return;
    const t = felt.getBoundingClientRect(), a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
    const k = felt.offsetWidth / (t.width || 1); // (zoomed tables)
    setAt({
      '--fx': `${(a.left + a.width / 2 - t.left) * k}px`, '--fy': `${(a.top + a.height / 2 - t.top) * k}px`,
      '--fw': `${a.width * k}px`, '--fh': `${a.height * k}px`,
      '--tx': `${(b.left + b.width / 2 - t.left) * k}px`, '--ty': `${(b.top + b.height / 2 - t.top) * k}px`,
      '--delay': `${BOOK_FLY_DELAY_MS}ms`, '--dur': `${BOOK_FLY_MS}ms`,
    });
  }, []);
  return <span ref={ref} className="book-fly" style={at ?? { display: 'none' }} aria-hidden="true" />;
}

/** The spade bluff over a player's video or picture, as strong as their slider says. */
function SpadeTease({ level }) {
  return (
    <svg className="spade-tease" viewBox="0 0 100 100" style={{ opacity: level }} aria-hidden="true">
      <path d="M50 6C38 24 12 38 12 60c0 13 10 21 21 21 6 0 11-2 14-6-1 7-4 13-10 18h26c-6-5-9-11-10-18 3 4 8 6 14 6 11 0 21-8 21-21C88 38 62 24 50 6Z" />
    </svg>
  );
}

// Each seat's corner, going round the table the same way the seats do: you bottom left, then clockwise.
const CORNER = { bottom: 'bl', left: 'tl', top: 'tr', right: 'br' };

/** Big video tiles in the table's corners (or a player's icon, big, when their camera is off). */
function BigVideos({ onTap, table, posOf, mySeat, me, call, icons, videoOf, peerOf, left, hurry, scoreText, tv, onMore, teases = {}, fill = false, shape = null, played = null, wonBy = null }) {
  const r = table.round;
  const box = useRef(null);
  const [layout, setLayout] = useState(null);
  // Measure the table area and the played cards' spot in it, and fit the tiles around them.
  useLayoutEffect(() => {
    const el = box.current;
    const ghosts = el?.parentElement?.querySelector('.trick-ghost');
    if (!el || (!ghosts && !fill)) return undefined;
    const measure = () => {
      const a = el.getBoundingClientRect();
      const k = el.offsetWidth / (a.width || 1); // screen pixels to the page's own (zoomed tables)
      const pad = 6;
      const W = el.offsetWidth, H = el.offsetHeight;
      // Keep clear of your hand and bid buttons where they overlap the table (upright phones), and of the
      // TV's corner buttons; the played cards go in the middle of what's left.
      const dock = el.closest('.app')?.querySelector('.hand-dock')?.getBoundingClientRect();
      const bottom = Math.max(dock && dock.height ? Math.max(0, a.bottom - dock.top) * k : 0, tv ? 50 : 0);
      el.parentElement.style.setProperty('--big-bottom', `${bottom}px`);
      // Video chat only: the four tiles fill the table area, two by two.
      if (fill) {
        setLayout(gridLayout({ width: W, height: H, gap: 8, bottom, shape }));
        return;
      }
      // Where each player's card lands (invisible stand-ins, placed exactly like real played cards).
      const cards = [...ghosts.children].map((g) => {
        const r = g.firstElementChild.getBoundingClientRect();
        return { left: (r.left - a.left) * k - pad, right: (r.right - a.left) * k + pad, top: (r.top - a.top) * k - pad, bottom: (r.bottom - a.top) * k + pad };
      });
      setLayout(bigLayout({ width: W, height: H, gap: tv ? 12 : 6, bottom, cards }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const dockEl = el.closest('.app')?.querySelector('.hand-dock');
    if (ghosts) ro.observe(ghosts);
    if (dockEl) ro.observe(dockEl); // it grows and shrinks between bidding and playing
    return () => ro.disconnect();
  }, [tv, fill, shape]);
  return (
    <div className={`big-videos${layout ? ` ${layout.kind}` : ''}`} ref={box}>
      {SEATS.map((_, s) => {
        const who = table.seats[s];
        if (!who) return null;
        const mine = who.id === me.id;
        const stream = who.bot ? null : videoOf(who.id);
        const showVideo = stream && hasVideo(stream) && (!mine || call.camOn);
        const turn = r?.turn === s && ['bidding', 'playing'].includes(table.phase);
        const micOff = !mine && !who.bot && peerOf(who.id) && !peerOf(who.id).mic;
        const rect = layout?.rects[CORNER[posOf(s)]];
        if (!rect) return null;
        return (
          <div key={s} className={`big-tile ${CORNER[posOf(s)]} t${teamOf(s)}${turn ? ' turn' : ''}${wonBy === s ? ' won' : ''}`} data-seat={s} onClick={() => onTap(s)} style={rect}>
            {stream && !showVideo && <SpeakingRings stream={stream} tile />}
            {/* Audio plays from the video element even with the camera off, so it's always there. */}
            {stream && <VideoTile stream={stream} muted={mine || !call.speakerOn} mirrored={mine} className={showVideo ? '' : 'no-video'} />}
            {!showVideo && <Avatar value={icons[who.id]} name={who.name} bot={who.bot} className="big-icon" />}
            {teases[s] > 0 && <SpadeTease level={teases[s]} />}
            <div className="big-title">
              <span className="big-name">{micOff && <Icon name="micOff" size={13} />}{s === mySeat ? 'You' : who.name}{r?.dealer === s && <span className="big-dealer">D</span>}</span>
              {/* Video chat only: the card this player put down this trick (no table to see it on) */}
              {played?.[s] && <span className={`big-played${wonBy === s ? ' won' : ''}`}><CardText code={played[s]} /></span>}
              <span className="big-score">{scoreText(s)}</span>
            </div>
            {turn && left != null && <span className={`big-secs${hurry ? ' hurry' : ''}`}>{left}</span>}
            {/* your own mic, camera and ••• ride on your tile */}
            {mine && call.joined && <div className="big-mine" onClick={(e) => e.stopPropagation()}><MyCallButtons call={call} onMore={onMore} /></div>}
          </div>
        );
      })}
    </div>
  );
}

/** Your mic and camera, on your own seat so they're never in the way; the rest is one tap away. */
function MyCallButtons({ call, onMore }) {
  return (
    <div className="my-call">
      {call.local && (
        <button type="button" className={call.micOn ? '' : 'off'} onClick={call.toggleMic} aria-label={call.micOn ? 'Mute microphone' : 'Unmute microphone'}>
          <Icon name={call.micOn ? 'mic' : 'micOff'} size={16} />
        </button>
      )}
      {call.local && call.local.getVideoTracks().length > 0 && (
        <button type="button" className={call.camOn ? '' : 'off'} onClick={call.toggleCam} aria-label={call.camOn ? 'Turn camera off' : 'Turn camera on'}>
          <Icon name={call.camOn ? 'video' : 'videoOff'} size={16} />
        </button>
      )}
      <button type="button" onClick={onMore} aria-label="More video chat controls"><Icon name="more" size={16} /></button>
    </div>
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
  if (table.round?.papiGame) return 'The Papi Flip!';
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
                <span className="muted small">{r.lines.join(' · ')}{last[t].penalty ? ` · bag penalty −${last[t].penalty}` : ''}{hand.bonus?.[t] ? ` · Papi Flip ${signed(hand.bonus[t])}` : ''}</span>
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

/** True for a moment after a new hand arrives (not when you open the app or come back to it mid-hand). */
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
function TvControls({ call, onLeave, view, onView, grid, onGrid }) {
  const needsPress = useTvStart(call);
  // The TV's views: the table, the table with big videos round it, or just the videos (tap again: the table)
  const viewButton = (v, icon, label) => (
    <button type="button" className={`tv-big${view === v ? ' on' : ''}`} onClick={() => onView(view === v ? 'table' : v)} aria-pressed={view === v}>
      <Icon name={icon} size={18} /> {label}
    </button>
  );
  return (
    <>
      <div className="tv-corner">
        {view != null && <>{viewButton('chat', 'video', 'Table + Chat')}{viewButton('video', 'users', 'Video chat only')}</>}
        {view === 'video' && (
          <span className="tv-grid-pick" role="group" aria-label="Video layout">
            {[['4x1', '1×4'], ['2x2', '2×2']].map(([g, label]) => (
              <button key={g} type="button" className={grid === g ? 'on' : ''} aria-pressed={grid === g} onClick={() => onGrid(g)}>{label}</button>
            ))}
          </span>
        )}
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
