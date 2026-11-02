import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { SEATS, playerName, teamOf, remoteSeats } from './lib/table.js';
import { makeCode, joinLink, onlineReady } from './lib/room.js';
import { Sheet, Icon, StatusDot } from './components.jsx';

async function share(text, url, onCopied) {
  try {
    if (navigator.share) await navigator.share({ title: 'Spades', text, url });
    else {
      await navigator.clipboard.writeText(`${text} ${url}`);
      onCopied();
    }
  } catch { /* closed the share sheet */ }
}

/** Invite remote players (one link per seat), video guests, and TV screens. */
export default function Invite({ game, peers, onSet, onClose }) {
  const remote = game.remote;
  const seats = remoteSeats(game);
  const code = remote?.code;
  const [qr, setQr] = useState(null);
  const [copied, setCopied] = useState('');

  // Make a game code as soon as the sheet opens, so any of the links work.
  useEffect(() => { if (!code) onSet({ code: makeCode(), seats: [] }); }, [code]);
  useEffect(() => {
    if (code) QRCode.toDataURL(joinLink(code), { margin: 1, width: 360 }).then(setQr).catch(() => setQr(null));
  }, [code]);
  if (!code) return null;

  const toggleSeat = (s) => onSet({ code, seats: seats.includes(s) ? seats.filter((x) => x !== s) : [...seats, s].sort() });
  const done = (what) => () => { setCopied(what); setTimeout(() => setCopied(''), 2500); };
  const guests = peers.filter((p) => p.role === 'guest');
  const tvs = peers.filter((p) => p.role === 'tv');

  return (
    <Sheet title="Invite" onClose={onClose} closeLabel="Done">
      <div className="section-title">Remote players</div>
      <p className="footnote">Who’s playing from somewhere else? Their phone shows their cards, bids and books.</p>
      <div className="seat-pick">
        {SEATS.map((_, s) => (
          <button key={s} type="button" className={`seat-choice t${teamOf(s)}${seats.includes(s) ? ' on' : ''}`}
            aria-pressed={seats.includes(s)} onClick={() => toggleSeat(s)}>
            {playerName(game, s)}
            <small>{seats.includes(s) ? 'remote' : game.teams[teamOf(s)].name}</small>
          </button>
        ))}
      </div>
      {seats.length > 0 && (
        <div className="card group invite-list">
          {seats.map((s) => {
            const name = playerName(game, s);
            const here = peers.some((p) => p.role === 'player' && p.seat === s);
            return (
              <div key={s} className="invite-row">
                <div><b>{name}</b><StatusDot on={here} label={here ? 'connected' : 'not connected yet'} /></div>
                <button type="button" className="soft"
                  onClick={() => share(`${name}, join our spades game! You’ll see your cards on your phone.`, joinLink(code, { seat: s }), done(name))}>
                  <Icon name="share" size={18} /> {copied === name ? 'Copied' : 'Send link'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="section-title">Video chat</div>
      <p className="footnote">
        Extra phones or iPads at the table put more faces around the table picture. Family at home can watch and
        talk too. Devices on the same Wi-Fi as this phone start with their mic and speaker off, so nothing squeals.
      </p>
      <div className="card group invite-list">
        <div className="invite-row">
          <div>
            <b>Video guests</b>
            <StatusDot on={guests.length > 0} label={guests.length ? guests.map((g) => g.name || 'Guest').join(', ') : 'nobody yet'} />
          </div>
          <button type="button" className="soft"
            onClick={() => share('Join our spades game on video!', joinLink(code, { as: 'guest' }), done('guest'))}>
            <Icon name="share" size={18} /> {copied === 'guest' ? 'Copied' : 'Send link'}
          </button>
        </div>
        <div className="invite-row">
          <div>
            <b>TV view</b>
            <StatusDot on={tvs.length > 0} label={tvs.length ? `${tvs.length} connected` : 'for a remote player’s TV'} />
          </div>
          <button type="button" className="soft"
            onClick={() => share('Open this on the TV (smart-TV browser, laptop, or iPad on AirPlay) to see the table big:', joinLink(code, { as: 'tv' }), done('tv'))}>
            <Icon name="share" size={18} /> {copied === 'tv' ? 'Copied' : 'Send link'}
          </button>
        </div>
      </div>

      <div className="invite-card card">
        <div className="eyebrow">Or join with the code</div>
        <div className="code">{code.split('').map((c, i) => <span key={i}>{c}</span>)}</div>
        {qr && <img className="qr" src={qr} alt="QR code to join this game" />}
        <p className="footnote center">Open Spades, tap <b>Join a game</b>, type the code, then choose a player, video chat or TV view.</p>
      </div>
      {!onlineReady && (
        <p className="scan-msg">Remote play isn’t connected to the internet in this copy of the app, so this only works between tabs on this device.</p>
      )}
      <button type="button" className="danger-link" onClick={() => { if (confirm('Stop remote play and video for everyone?')) { onSet(null); onClose(); } }}>
        Stop remote play
      </button>
    </Sheet>
  );
}
