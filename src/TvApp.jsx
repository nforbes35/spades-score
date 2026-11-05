import { useEffect, useRef, useState } from 'react';
import { standings, winner, isNil, nilLabel } from './lib/scoring.js';
import { SEATS, teamOf, playerName, seatEntry, stageOf, liveOf, leaderOf, booksPlayed } from './lib/table.js';
import { useRoom } from './lib/room.js';
import { useDevice } from './lib/device.js';
import { useCall } from './lib/call.js';
import { useWakeLock } from './lib/fx.js';
import { Icon, PlayingCard, BagMeter } from './components.jsx';
import { VideoTile, useTvStart, SoundPrompt } from './Video.jsx';
import { tr, getLang, setLang } from './lib/i18n.js';

/**
 * TV view: open on a smart TV's browser, a laptop on HDMI, or an iPad mirrored to an Apple TV.
 * The table's rear camera fills the middle, everyone else's faces sit down both sides, and the
 * scores, bids and books run along the top. It only watches: no camera or microphone.
 */
export default function TvApp({ code, onLeave }) {
  const [game, setGame] = useState(null);
  const [device, setDevice] = useDevice(code, { role: 'tv', name: 'TV' });
  const room = useRoom(code, device, (m) => {
    if (m.type === 'state') setGame(m.game);
    else if (m.type === 'rtc') call.handle(m);
  });
  const call = useCall({ room, me: device, setMe: setDevice, receiveOnly: true });
  const host = room.peers.find((p) => p.role === 'host');
  useEffect(() => { if (host) room.send({ type: 'hello' }, host.id); }, [host?.id, room.send]);
  useWakeLock(true);
  const idle = useIdleCursor();
  const needsPress = useTvStart(call);

  const table = call.videos.find((v) => v.peer.role === 'host');
  const faces = call.videos.filter((v) => v.peer.role !== 'host' && v.peer.role !== 'tv');
  const left = faces.filter((_, i) => i % 2 === 0);
  const right = faces.filter((_, i) => i % 2 === 1);

  return (
    <div className={`tv${idle ? ' idle' : ''}`}>
      {game && <TvScoreboard game={game} />}
      <div className={`tv-stage${faces.length ? '' : ' solo'}`}>
        <div className="tv-side">
          {left.map((v) => <Face key={v.peer.id} v={v} muted={!call.speakerOn} />)}
        </div>
        <div className="tv-center">
          {table
            ? <VideoTile stream={table.stream} muted={!call.speakerOn} fit="contain" label={tr('The table')} className="tv-table" />
            : <div className="tv-waiting">{host ? tr('Waiting for the table’s camera…') : tr('Waiting for the table to open game {code}…', { code })}</div>}
        </div>
        <div className="tv-side">
          {right.map((v) => <Face key={v.peer.id} v={v} muted={!call.speakerOn} />)}
        </div>
      </div>
      <div className="tv-corner">
        <span className={`tv-dot${host ? ' on' : ''}`} />
        {call.soundBy ? tr('Sound: {name}', { name: call.soundBy.name || tr('phone') }) : tr('Sound on this screen')}
        <button type="button" onClick={() => setLang(getLang() === 'es' ? 'en' : 'es')} aria-label="Language / Idioma">{getLang() === 'es' ? 'EN' : 'ES'}</button>
        <button type="button" onClick={call.toggleSpeaker} aria-label={call.speakerOn ? tr('Turn sound off') : tr('Turn sound on')}>
          <Icon name={call.speakerOn ? 'speaker' : 'speakerOff'} size={18} />
        </button>
        <button type="button" onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})} aria-label={tr('Full screen')}>
          <Icon name="expand" size={18} />
        </button>
        <button type="button" onClick={() => { if (confirm(tr('Close the TV view?'))) onLeave(); }} aria-label={tr('Close TV view')}>
          <Icon name="close" size={18} />
        </button>
      </div>
      {needsPress && <SoundPrompt />}
    </div>
  );
}

function Face({ v, muted }) {
  const seatName = v.peer.role === 'player' ? v.peer.name : v.peer.name || tr('Guest');
  return <VideoTile stream={v.stream} muted={muted} label={seatName} micOff={!v.peer.mic} className="tv-face" />;
}

/** Hide the mouse pointer after a few still seconds (laptops on HDMI). */
function useIdleCursor() {
  const [idle, setIdle] = useState(false);
  const timer = useRef();
  useEffect(() => {
    const wake = () => {
      setIdle(false);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setIdle(true), 3000);
    };
    wake();
    addEventListener('mousemove', wake);
    addEventListener('touchstart', wake);
    return () => { removeEventListener('mousemove', wake); removeEventListener('touchstart', wake); clearTimeout(timer.current); };
  }, []);
  return idle;
}

function TvScoreboard({ game }) {
  const stand = standings(game);
  const win = winner(game);
  const hand = game.hands.find((h) => h.inPlay);
  const stage = hand ? stageOf(hand) : null;
  const live = hand ? liveOf(hand) : null;
  const leader = stage === 'play' ? leaderOf(hand) : null;
  const played = Object.entries(live?.played ?? {}).filter(([, c]) => c);
  return (
    <div className="tv-top">
      <div className="tv-scores">
        {[0, 1].map((t) => (
          <div key={t} className={`tv-team t${t}${win === t ? ' won' : ''}`}>
            <span>{game.teams[t].name}</span>
            <b>{stand[t].score}{game.rules.bagsEnabled && <BagMeter bags={stand[t].bags} limit={game.rules.bagsLimit} />}</b>
          </div>
        ))}
      </div>
      {hand ? (
        <div className="tv-seats">
          {SEATS.map((_, s) => {
            const p = seatEntry(hand, s);
            return (
              <div key={s} className={`tv-seat t${teamOf(s)}${leader === s ? ' leading' : ''}`}>
                <span className="tv-seat-name">{playerName(game, s)}</span>
                <span className="tv-seat-num">
                  {stage === 'bids'
                    ? (isNil(p.call) ? tr(nilLabel(p.call)) : tr('bid {n}', { n: p.bid }))
                    : <>{p.books}<small>/{isNil(p.call) ? tr(nilLabel(p.call)) : p.bid}</small></>}
                </span>
                {leader === s && <span className="tv-lead">{tr('leads')}</span>}
              </div>
            );
          })}
          <div className="tv-book">
            {stage === 'bids' ? tr('Bidding') : booksPlayed(hand) >= 13 ? tr('All 13 played') : tr('Book {n} of 13', { n: booksPlayed(hand) + 1 })}
            {played.length > 0 && (
              <span className="tv-played">
                {played.map(([seat, card]) => (
                  <span key={seat}><PlayingCard code={card} size="xs" /> {playerName(game, Number(seat))}</span>
                ))}
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="tv-book">{win != null ? tr('{name} win!', { name: game.teams[win].name }) : tr('Playing to {target}', { target: game.target })}</div>
      )}
    </div>
  );
}
