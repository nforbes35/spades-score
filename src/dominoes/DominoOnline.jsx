// Dominoes online: everyone on their own phone, like Spades online. The host's device runs the game
// (engine.js), sends everyone the table (no hands, just counts) and each player their own tiles, locked for
// their device. Players send moves; the host checks them. Computer players fill empty seats.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { read, write, tabRead, tabWrite } from '../lib/store.js';
import { useRoom, joinLink } from '../lib/room.js';
import { useDevice } from '../lib/device.js';
import { useKeys, seal, unseal } from '../lib/secret.js';
import { useWakeLock, buzz, dealSound, cardSound } from '../lib/fx.js';
import { pickBotNames } from '../lib/bots.js';
import { Avatar, ProfileEditor } from '../Avatar.jsx';
import { loadName, saveName, loadAvatar, saveAvatar, useAvatars } from '../lib/profile.js';
import { Icon, Segmented, Toggle, useToast, Confetti } from '../components.jsx';
import Domino from './Domino.jsx';
import { boardLayout } from './board.js';
import {
  VARIANTS, SETS, halves, newDominoTable, startMatch, deal, legalMoves, playTile, drawTile, pass, publicTable, botMove, openEnds,
} from './engine.js';

const ID_KEY = 'spades-device-id'; // the same device id as Spades online, so a reload rejoins the same seat
const BOT_DELAY_MS = 1100;
const NEXT_HAND_MS = 7000;
const RESYNC_MS = 5000;
const LAST_KEY = 'dominoes-last-online';

function stableId() {
  let id = tabRead(ID_KEY);
  if (!id) id = Math.random().toString(36).slice(2, 10);
  tabWrite(ID_KEY, id);
  return id;
}

/** Name and icon first (shared with Spades), then the game room. */
export default function DominoOnline({ code, isHost, onLeave }) {
  const [name, setName] = useState(loadName);
  const [avatar, setAvatar] = useState(loadAvatar);
  const [named, setNamed] = useState(() => Boolean(loadName()));
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

function DominoRoom({ code, isHost, name, avatar, onLeave }) {
  const keys = useKeys();
  const [deviceId] = useState(stableId);
  const [me] = useDevice(code, { role: isHost ? 'dhost' : 'dplayer', name, id: deviceId, pub: keys?.pub ?? null });
  const toast = useToast();
  const [view, setView] = useState(null);
  const [myTiles, setMyTiles] = useState(null); // { hand: hand number, tiles }
  const [closed, setClosed] = useState(null);

  // ----- Host: runs the game -----
  const tableKey = `dominoes-online-table-${code}`;
  const [table, setTable] = useState(() => (isHost ? read(tableKey) ?? newDominoTable() : null));
  useEffect(() => { if (isHost) write(tableKey, table); }, [isHost, table]);
  useEffect(() => { write(LAST_KEY, { code, host: isHost, at: Date.now() }); }, [code, isHost]);
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
  const [icons] = useAvatars(room, me, avatar);
  const hostPeer = isHost ? null : room.peers.find((p) => p.role === 'dhost');
  const hostRef = useRef(hostPeer);
  hostRef.current = hostPeer;
  const seatOf = (t, id) => (t?.seats ?? []).findIndex((s) => s && !s.bot && s.id === id);

  function onMessage(m, from) {
    if (isHost) {
      if (!from) return;
      const t = tableRef.current;
      const seat = seatOf(t, from.id);
      let error = null;
      if (m.type === 'd-hello') sendAll(t, from);
      else if (m.type === 'd-sit') error = act((x) => sit(x, m.seat, { id: from.id, name: String(m.name || from.name || 'Player').slice(0, 14) }));
      else if (m.type === 'd-stand') error = act((x) => ({ ...x, seats: x.seats.map((s) => (s?.id !== from.id ? s : x.phase === 'lobby' ? null : { ...s, standIn: true })) }));
      else if (seat >= 0 && m.type === 'd-play') error = act((x) => (handNo(x) === m.hand ? playTile(x, seat, m.tile, m.arm) : x));
      else if (seat >= 0 && m.type === 'd-draw') error = act((x) => (handNo(x) === m.hand ? drawTile(x, seat) : x));
      else if (seat >= 0 && m.type === 'd-pass') error = act((x) => (handNo(x) === m.hand ? pass(x, seat) : x));
      if (error) room.send({ type: 'd-error', text: error }, from.id);
      return;
    }
    if (from?.role !== 'dhost') return;
    if (m.type === 'd-table') setView(m.table);
    else if (m.type === 'd-hand' && keys && hostRef.current?.pub) unseal(keys, hostRef.current.pub, m.box).then((tiles) => setMyTiles({ hand: m.hand, tiles })).catch(() => {});
    else if (m.type === 'd-error') toast.show(m.text);
    else if (m.type === 'd-closed') setClosed({ by: m.by });
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
  const tiles = isHost ? (mySeat >= 0 ? table?.round?.hands?.[mySeat] ?? null : null) : (myTiles && shown?.round && myTiles.hand === handNo(shown) ? myTiles.tiles : null);
  useWakeLock(Boolean(shown && shown.phase !== 'lobby'));

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
    if (!isHost) { room.send({ type: 'd-stand' }, hostPeer?.id); onLeave(); return; }
    write(tableKey, null);
    write(LAST_KEY, null);
    room.send({ type: 'd-closed', by: name });
    setTimeout(() => room.send({ type: 'd-closed', by: name }), 250);
    setTimeout(onLeave, 500);
  };

  if (closed) {
    return (
      <div className="app game-ended"><main className="wrap"><div className="card waiting-card ended-card">
        <span className="brand-mark">🁫</span><h2>{closed.by ? `${closed.by} closed the game` : 'The game has ended'}</h2>
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

  return (
    <div className={`app online dominoes${shown.phase === 'lobby' ? '' : ' at-table'}`}>
      {shown.phase === 'lobby'
        ? <DominoLobby code={code} table={shown} isHost={isHost} me={me} icons={icons} act={act}
            onSit={(s) => { if (!isHost) { room.send({ type: 'd-sit', seat: s, name }, hostPeer?.id); return; } const e = act((x) => sit(x, s, { id: me.id, name })); if (e) toast.show(e); }}
            onStand={() => (isHost ? act((x) => ({ ...x, seats: x.seats.map((s) => (s?.id === me.id ? null : s)) })) : room.send({ type: 'd-stand' }, hostPeer?.id))}
            onStart={() => { const e = act((x) => startMatch(x)); if (e) toast.show(e); }} onLeave={leave} />
        : <DominoTable table={shown} mySeat={mySeat} tiles={tiles} icons={icons} isHost={isHost} send={send} act={act} onLeave={leave} />}
      {toast.node}
    </div>
  );
}

const handNo = (t) => t?.match?.hands.length ?? 0;

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

function DominoTable({ table, mySeat, tiles, icons, isHost, send, act, onLeave }) {
  const r = table.round;
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
          <button type="button" className="icon-btn round small" aria-label="Leave" onClick={onLeave}><Icon name="close" size={18} /></button>
        </div>
      </header>

      <div className="felt dom-felt">
        <Board table={table} selectedMoves={forSelected} onEnd={(arm) => play(selected, arm)} />
        {table.seats.map((who, s) => (
          <div key={s} className={`player-spot ${posOf(s)}${table.settings.teams ? ` t${s % 2}` : ''}${r?.turn === s && table.phase === 'playing' ? ' turn' : ''}${s === mySeat ? ' me' : ''}`}>
            <div className="avatar" data-seat={s}>
              <Avatar value={who ? icons[who.id] : null} name={who?.name ?? '?'} bot={who?.bot} className="seat-icon" />
            </div>
            <div className="nameplate">
              <span className="spot-name">{s === mySeat ? 'You' : who?.name}</span>
              <span className="spot-score dom-count" title="Tiles in hand">{counts[s] ?? 0}</span>
            </div>
            {r?.last?.seat === s && (r.last.passed || r.last.drew) && Date.now() - r.last.at < 4000 && <span className="dom-said">{r.last.passed ? 'Pass' : 'Drew'}</span>}
          </div>
        ))}
        {VARIANTS[table.settings.variant].draws && table.phase === 'playing' && <div className="dom-boneyard"><Domino a={0} b={0} faceDown size={34} /> {boneyard}</div>}
        {r?.events?.length > 0 && <FivesPop key={r.events.length} event={r.events.at(-1)} table={table} />}
      </div>

      {mySeat >= 0 && (
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
function Board({ table, selectedMoves, onEnd }) {
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
  const unit = Math.min(38, size.w / unitW, size.h / unitH);
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
