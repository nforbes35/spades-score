// A practice game against the computer with a coach talking you through it. Nothing is saved or sent anywhere: the
// engines run right here, one step at a time, and the bots wait while you read.
import { useEffect, useRef, useState } from 'react';
import { PlayingCard, FannedHand, CardBack } from '../components.jsx';
import Domino from '../dominoes/Domino.jsx';
import { Board, LinesBoard } from '../dominoes/DominoOnline.jsx';
import { newDominoTable, startMatch, deal as dealTiles, legalMoves, playTile, drawTile, pass, canDraw, botMove, VARIANTS, halves, isDouble, kindOf } from '../dominoes/engine.js';
import { newTable, startGame, deal as dealCards, placeBid, playCard, legalCards, currentHand } from '../lib/online.js';
import { botBid, botPlay } from '../lib/bots.js';
import { sortHand, cardLabel } from '../lib/cards.js';
import { seatEntry, SEATS } from '../lib/table.js';
import { scoreTeam, contractBid, totalBooks, isNil, standings } from '../lib/scoring.js';
import { getLang, tr } from '../lib/i18n.js';
import { adviseDomino, judgeDomino, whyNotTile, notedLacks, adviseBid, advisePlay, judgePlay, whyNotCard } from './coach.js';
import { gameById } from './rules.js';
import { OPENING, MOMENTS } from './lessons.js';

const BOT_MS = 1400;
const READ_MS = 3200; // the coach just praised your move: time to read it before the computer goes
const LAST_TRICK_MS = 2000;
const AUTO_HINTS = 2; // the coach shows its pick on your first turns without being asked

const say = (o) => o?.[getLang()] ?? '';
const showTile = (t) => t.replace('-', '|');

/** The lessons waiting to be read, one at a time, plus whichever ones have already been given. */
function useLessons(opening) {
  const [queue, setQueue] = useState(opening);
  const given = useRef(new Set());
  const once = (key, lesson) => {
    if (given.current.has(key)) return;
    given.current.add(key);
    setQueue((q) => [...q, lesson]);
  };
  return { lesson: queue[0] ?? null, next: () => setQueue((q) => q.slice(1)), once, tell: (text) => setQueue((q) => [...q, { en: text, es: text }]) };
}

function CoachBox({ lesson, onNext, note, tone, onHint, canHint, children }) {
  const text = lesson ? say(lesson) : note;
  return (
    <div className={`learn-coach${tone ? ` ${tone}` : ''}`} role="status">
      <span className="learn-coach-face" aria-hidden="true">🎓</span>
      <div className="learn-coach-body">
        {text && <p>{text}</p>}
        {lesson
          ? <button type="button" className="primary learn-next" onClick={onNext}>{tr('Got it')}</button>
          : <div className="learn-coach-actions">{canHint && <button type="button" className="secondary" onClick={onHint}>💡 {tr('Show me')}</button>}{children}</div>}
      </div>
    </div>
  );
}

const Header = ({ title, score, onExit }) => (
  <header className="learn-top">
    <button type="button" className="link" onClick={onExit}>{tr('Exit')}</button>
    <b>{title}</b>
    <span className="learn-score">{score}</span>
  </header>
);

// ---------- Dominoes ----------

const verdictText = (verdict, chosen) => {
  if (verdict.best.forced) return null;
  const why = say(verdict.best.why);
  if (verdict.rating === 'best') return `${tr('Nice move!')} ${why}`;
  if (verdict.rating === 'fine') return tr('That works too.');
  return `${tr('{tile} is allowed, but I’d have played {best}.', { tile: showTile(chosen), best: showTile(verdict.best.tile) })} ${why}`;
};

function newDominoGame(variant) {
  const t = newDominoTable({ players: 2, setMax: 6, variant });
  const table = { ...t, seats: [{ id: 'you', name: tr('You') }, { id: 'computer', name: tr('Computer'), bot: true }], settings: { ...t.settings, rounds: 3 } };
  return startMatch(table);
}

function DominoPractice({ variant, onExit }) {
  const [table, setTable] = useState(() => newDominoGame(variant));
  const { lesson, next, once, tell } = useLessons(OPENING[variant]);
  const [note, setNote] = useState(null);
  const [tone, setTone] = useState(null);
  const [selected, setSelected] = useState(null);
  const [hint, setHint] = useState(null);
  const [lacks, setLacks] = useState([]);
  const myTurns = useRef(0);
  const lines = kindOf(table) !== 'line';
  const r = table.round;
  const playing = table.phase === 'playing';
  const myTurn = playing && r.turn === 0;
  const moves = myTurn ? legalMoves(table, 0) : [];
  const fits = new Set(moves.map((m) => m.tile));
  const speak = (text, kind = null) => { setNote(text); setTone(kind); };

  // The computer's turn, once you've read what's on screen
  useEffect(() => {
    if (!playing || r.turn !== 1 || lesson) return undefined;
    const timer = setTimeout(() => {
      const m = botMove(table, 1);
      if (m.type === 'play') {
        setLacks((list) => list.filter((n) => !halves(m.tile).includes(n)));
        const after = playTile(table, 1, m.tile, m.arm);
        if (VARIANTS[variant].fives && after.round.last?.points) once('fives', MOMENTS.fives);
        speak(after.round.last?.points
          ? tr('The computer played {tile} and scored {n}.', { tile: showTile(m.tile), n: after.round.last.points })
          : tr('The computer played {tile}.', { tile: showTile(m.tile) }));
        setTable(after);
      } else if (m.type === 'draw') {
        if (!lines) setLacks((list) => notedLacks(table, list));
        once('botDraw', MOMENTS.botDraw);
        speak(tr('The computer drew a tile.'));
        setTable(drawTile(table, 1));
      } else {
        if (!lines) setLacks((list) => notedLacks(table, list));
        once('botPass', MOMENTS.botPass);
        speak(tr('The computer passed.'));
        setTable(pass(table, 1));
      }
    }, tone === 'good' ? READ_MS : BOT_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, lesson]);

  // Things worth saying when they first happen, and your turn starting
  useEffect(() => {
    if (!r) return;
    if (r.last?.tile && isDouble(r.last.tile) && !lines) once('double', MOMENTS.double);
    if (r.openDouble) once('coverDouble', MOMENTS.coverDouble);
    if (variant === 'foot' && r.layout?.feet > 0) once('foot', MOMENTS.foot);
    if (variant === 'train' && r.markers?.[0]) once('marker', MOMENTS.marker);
    if (!myTurn) return;
    if (!moves.length) once(canDraw(table, 0) ? 'draw' : 'pass', canDraw(table, 0) ? MOMENTS.draw : MOMENTS.pass);
    setSelected(null);
    setHint(null);
    myTurns.current += 1;
    if (myTurns.current <= AUTO_HINTS && moves.length) showHint();
    else setNote((n) => (n ? `${n} ${tr('Your turn.')}` : tr('Your turn.')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table]);

  const showHint = () => {
    const a = adviseDomino(table, 0, lacks);
    if (a.type === 'play') { setHint(a.tile); setSelected(a.tile); }
    speak(say(a.why), 'tip');
  };
  const play = (tile, arm) => {
    const verdict = judgeDomino(table, 0, { tile, arm }, lacks);
    const after = playTile(table, 0, tile, arm);
    if (after.round.last?.points) once('fives', MOMENTS.fives);
    const words = verdictText(verdict, tile);
    if (verdict.rating === 'better' && words) { tell(words); speak(null); } else speak(words, words ? 'good' : null);
    setSelected(null); setHint(null);
    setTable(after);
  };
  const tapTile = (tile) => {
    if (lesson) return;
    if (!myTurn) { speak(tr('Hold on, it’s the computer’s turn.')); return; }
    if (!fits.has(tile)) { speak(say(whyNotTile(table, 0, tile)), 'better'); return; }
    const arms = moves.filter((m) => m.tile === tile);
    if (arms.length === 1) { play(tile, arms[0].arm); return; }
    setSelected(tile);
    speak(tr('It fits in more than one place. Tap the spot you want.'));
  };
  const nextHand = () => {
    speak(null);
    if (table.phase === 'over') { setTable(newDominoGame(variant)); return; }
    setTable(dealTiles(table));
  };
  const selectedMoves = selected ? moves.filter((m) => m.tile === selected) : [];
  const hand = r.hands[0];
  const result = r.result;

  let summary = null;
  if (result) {
    const [mine, theirs] = result.seatPips;
    const won = result.winner === 0;
    const low = VARIANTS[variant].lowWins;
    summary = result.reason === 'domino'
      ? (won ? tr('You went out! The computer was left with {n} dots.', { n: theirs }) : tr('The computer went out. You were left with {n} dots.', { n: mine }))
      : tr('Nobody could play. You have {a} dots and the computer has {b}.', { a: mine, b: theirs });
    summary += ` ${low ? tr('Those dots go on each player’s total, and the lowest total wins.') : tr('Score: you {a}, computer {b}. First to {n} wins.', { a: table.match.scores[0], b: table.match.scores[1], n: table.settings.target })}`;
  }

  return (
    <div className="learn-play">
      <Header title={say(gameById(variant).name)} score={`${table.match.scores[0]} – ${table.match.scores[1]}`} onExit={onExit} />
      <div className="learn-opp">
        <span>🤖 {tr('Computer')}</span>
        <span className="learn-backs">{r.hands[1].slice(0, 12).map((t) => <Domino key={t} a={0} b={0} faceDown vertical size={22} />)}</span>
        <span className="muted small">{r.hands[1].length}{VARIANTS[variant].draws ? ` · ${tr('{n} to draw', { n: r.boneyard.length })}` : ''}</span>
      </div>
      <div className="learn-felt dom-felt">
        {lines
          ? <LinesBoard table={table} mySeat={0} icons={{}} selectedMoves={selectedMoves} onEnd={(arm) => play(selected, arm)} />
          : <Board table={table} selectedMoves={selectedMoves} onEnd={(arm) => play(selected, arm)} />}
      </div>
      <CoachBox lesson={result && !lesson ? null : lesson} onNext={next} note={result ? summary : (note ?? (myTurn ? tr('Your turn.') : tr('The computer’s turn.')))} tone={tone}
        canHint={myTurn && !result} onHint={showHint}>
        {myTurn && !moves.length && canDraw(table, 0) && <button type="button" className="primary" onClick={() => { speak(tr('You drew a tile.')); setTable(drawTile(table, 0)); }}>{tr('Draw a tile')}</button>}
        {myTurn && !moves.length && !canDraw(table, 0) && <button type="button" className="primary" onClick={() => { speak(tr('You knocked.')); setTable(pass(table, 0)); }}>✊ {tr('Knock')}</button>}
        {result && <button type="button" className="primary" onClick={nextHand}>{table.phase === 'over' ? tr('New game') : tr('Next hand')}</button>}
        {result && <button type="button" className="secondary" onClick={onExit}>{tr('Done')}</button>}
      </CoachBox>
      <div className="learn-hand">
        {hand.map((t) => {
          const [a, b] = halves(t);
          return (
            <button key={t} type="button" className={`dom-tile${selected === t ? ' sel' : ''}${hint === t ? ' learn-hint' : ''}${myTurn && !fits.has(t) ? ' dim' : ''}`} aria-label={showTile(t)} onClick={() => tapTile(t)}>
              <Domino a={a} b={b} vertical size={46} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Spades ----------

const SEAT_NAMES = ['You', 'Max', 'Partner', 'Sam']; // the two other names are the same in both languages
const seatName = (s) => tr(SEAT_NAMES[s]);

function newSpadesGame() {
  const t = newTable({ target: 500 });
  return startGame({ ...t, seats: SEAT_NAMES.map((name, s) => ({ id: `s${s}`, name, bot: s > 0 })) });
}

function SpadesPractice({ onExit }) {
  const [table, setTable] = useState(newSpadesGame);
  const { lesson, next, once, tell } = useLessons(OPENING.spades);
  const [note, setNote] = useState(null);
  const [tone, setTone] = useState(null);
  const [selected, setSelected] = useState(null);
  const [hintBid, setHintBid] = useState(null);
  const [showLast, setShowLast] = useState(false);
  const myTurns = useRef(0);
  const r = table.round;
  const hand = table.game ? currentHand(table) : null;
  const myTurn = r.turn === 0;
  const canAct = myTurn && table.phase === 'playing' && !lesson && !showLast;
  const legal = table.phase === 'playing' && myTurn ? legalCards(table, 0) : [];
  const speak = (text, kind = null) => { setNote(text); setTone(kind); };
  const team = (s) => hand.teams[SEATS[s][0]];

  // the computer players bid and play, once you've read what's on screen
  useEffect(() => {
    if (lesson || showLast || !['bidding', 'playing'].includes(table.phase) || r.turn === 0) return undefined;
    const timer = setTimeout(() => {
      const s = r.turn;
      if (table.phase === 'bidding') {
        const b = botBid(r.hands[s]);
        if (b.call === 'nil') once('botNil', MOMENTS.botNil);
        speak(b.call === 'nil' ? tr('{who} bid Nil.', { who: seatName(s) }) : tr('{who} bid {n}.', { who: seatName(s), n: b.bid }));
        setTable(placeBid(table, s, b));
      } else {
        const card = botPlay(table, s);
        const after = playCard(table, s, card);
        if (!r.spadesBroken && after.round.spadesBroken) once('broken', MOMENTS.broken);
        if (after.round.trick.length === 0) finishTrick(after);
        setTable(after);
      }
    }, tone === 'good' ? READ_MS : BOT_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, lesson, showLast]);

  const finishTrick = (after) => {
    setShowLast(true);
    const w = after.round.lastTrick.winner;
    speak(w === 0 ? tr('You won that book!') : w === 2 ? tr('Your partner won that book.') : tr('{who} won that book.', { who: seatName(w) }));
    setTimeout(() => setShowLast(false), LAST_TRICK_MS);
    const h = currentHand(after);
    const mine = h.teams[0];
    const theirs = h.teams[1];
    const left = 13 - after.round.tricks.length;
    if (contractBid(mine) > 0 && totalBooks(mine) >= contractBid(mine) && left > 0) once('madeBid', MOMENTS.madeBid);
    const short = contractBid(theirs) - totalBooks(theirs);
    if (short > 0 && short >= left - 1 && left > 0 && left <= 5) once('setThem', MOMENTS.setThem);
  };

  // what to say when your turn comes
  useEffect(() => {
    if (!myTurn || showLast) return;
    if (table.phase === 'bidding') {
      once('bid', MOMENTS.bid);
      setHintBid(null);
      speak(tr('Your bid. How many books will you win?'));
    } else if (table.phase === 'playing') {
      setSelected(null);
      once('tapCard', MOMENTS.tapCard);
      if (!r.trick.length) once('lead', MOMENTS.lead);
      else if (!r.hands[0].some((c) => c.slice(-1) === r.trick[0].card.slice(-1))) once('void', MOMENTS.void);
      myTurns.current += 1;
      if (myTurns.current <= AUTO_HINTS) showHint();
      else setNote((n) => (n ? `${n} ${tr('Your turn.')}` : tr('Your turn.')));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, showLast]);

  const showHint = () => {
    if (table.phase === 'bidding') {
      const a = adviseBid(r.hands[0]);
      setHintBid(a.call === 'nil' ? 'nil' : a.bid);
      speak(say(a.why), 'tip');
      return;
    }
    const a = advisePlay(table, 0);
    setSelected(a.card);
    speak(say(a.why), 'tip');
  };
  const bid = (choice) => {
    speak(null);
    setHintBid(null);
    setTable(placeBid(table, 0, choice));
  };
  const playNow = (card) => {
    if (!canAct || !legal.includes(card)) return;
    const verdict = judgePlay(table, 0, card);
    const why = say(verdict.best.why);
    const nice = verdict.best.forced ? null : verdict.rating === 'best' ? `${tr('Nice move!')} ${why}` : verdict.rating === 'fine' ? tr('That works too.')
      : `${tr('{tile} is allowed, but I’d have played {best}.', { tile: cardLabel(card), best: cardLabel(verdict.best.card) })} ${why}`;
    const after = playCard(table, 0, card);
    if (verdict.rating === 'better' && nice) { tell(nice); speak(null); } else speak(nice, nice ? 'good' : null);
    setSelected(null);
    if (!r.spadesBroken && after.round.spadesBroken) once('broken', MOMENTS.broken);
    if (after.round.trick.length === 0) finishTrick(after);
    setTable(after);
  };
  const scored = table.phase === 'scored' || table.phase === 'over';
  const trick = showLast && r.lastTrick ? r.lastTrick.cards : r.trick;
  const seatBox = (s) => {
    const e = seatEntry(hand, s);
    const said = r.bidsIn > 0 && (e.bid > 0 || isNil(e.call));
    return <span className={`learn-seat s${s}${r.turn === s && !scored ? ' turn' : ''}`}><b>{seatName(s)}</b><small>{said ? (isNil(e.call) ? 'Nil' : tr('Bid {n}', { n: e.bid })) : '–'}</small><small>{tr('{n} won', { n: e.books })}</small></span>;
  };
  let summary = null;
  if (scored) {
    const rules = table.game.rules;
    const lines = [0, 1].map((i) => {
      const s = scoreTeam(hand.teams[i], rules);
      const key = s.madeBid == null ? '{who}: {pts} points.' : s.madeBid ? '{who}: bid {bid}, took {took}. Made it: {pts} points.' : '{who}: bid {bid}, took {took}. Missed it: {pts} points.';
      return tr(key, { who: i === 0 ? tr('Your team') : tr('Their team'), bid: s.contractBid, took: totalBooks(hand.teams[i]), pts: s.total > 0 ? `+${s.total}` : s.total });
    });
    const st = standings(table.game);
    summary = `${lines.join(' ')} ${tr('Score: your team {a}, their team {b}. First to {n} wins.', { a: st[0].score, b: st[1].score, n: table.game.target })}`;
  }
  const again = () => { speak(null); setTable(table.phase === 'over' ? newSpadesGame() : dealCards(table)); };

  return (
    <div className="learn-play">
      <Header title={say(gameById('spades').name)} score={`${standings(table.game)[0].score} – ${standings(table.game)[1].score}`} onExit={onExit} />
      <div className="learn-table">
        {seatBox(2)}
        <div className="learn-mid">
          {seatBox(1)}
          <div className="learn-trick">
            {trick.map((x) => <span key={x.card} className={`pos${x.seat}`}><PlayingCard code={x.card} size="sm" /></span>)}
            {!trick.length && table.phase === 'bidding' && <CardBack size="sm" />}
          </div>
          {seatBox(3)}
        </div>
        <div className="learn-you">{seatBox(0)}<small className="muted">{tr('Team {a} of {b}', { a: totalBooks(team(0)), b: contractBid(team(0)) })}</small></div>
      </div>
      <CoachBox lesson={scored ? null : lesson} onNext={next} note={scored ? summary : note} tone={tone}
        canHint={myTurn && !scored && !showLast} onHint={showHint}>
        {canAct && selected && <button type="button" className="primary" onClick={() => playNow(selected)}>{tr('Play {card}', { card: cardLabel(selected) })}</button>}
        {scored && <button type="button" className="primary" onClick={again}>{table.phase === 'over' ? tr('New game') : tr('Next hand')}</button>}
        {scored && <button type="button" className="secondary" onClick={onExit}>{tr('Done')}</button>}
      </CoachBox>
      {table.phase === 'bidding' && myTurn && !lesson && (
        <div className="learn-bids">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((n) => <button key={n} type="button" className={`secondary${hintBid === n ? ' learn-hint' : ''}`} onClick={() => bid({ bid: n })}>{n}</button>)}
          <button type="button" className={`secondary learn-nil${hintBid === 'nil' ? ' learn-hint' : ''}`} onClick={() => bid({ call: 'nil' })}>Nil</button>
        </div>
      )}
      <div className="learn-cards">
        <FannedHand cards={sortHand(r.hands[0])} selected={selected} dealKey={table.game.hands.length}
          onSelect={canAct ? (c) => { if (c && !legal.includes(c)) speak(say(whyNotCard(table, 0, c)), 'better'); setSelected(c && legal.includes(c) ? c : null); } : undefined}
          onPlay={canAct ? playNow : undefined} playable={legal}
          onRefuse={() => { const bad = r.hands[0].find((c) => !legal.includes(c)); if (canAct && bad) speak(say(whyNotCard(table, 0, bad)), 'better'); }} />
      </div>
    </div>
  );
}

export default function Practice({ gameId, onExit }) {
  return gameId === 'spades' ? <SpadesPractice onExit={onExit} /> : <DominoPractice variant={gameId} onExit={onExit} />;
}
