import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { SEATS, playerName, teamOf } from './lib/table.js';
import { makeCode, joinLink, onlineReady } from './lib/room.js';
import { Sheet, Icon, StatusDot } from './components.jsx';

/** Pick who's playing remotely and share a code / link / QR code with them. */
export default function Invite({ game, peer, onSet, onClose }) {
  const remote = game.remote;
  const [qr, setQr] = useState(null);
  const [copied, setCopied] = useState(false);
  const link = remote ? joinLink(remote.code) : '';

  useEffect(() => {
    if (!link) return;
    QRCode.toDataURL(link, { margin: 1, width: 360 }).then(setQr).catch(() => setQr(null));
  }, [link]);

  const choose = (seat) => onSet({ code: remote?.code ?? makeCode(), seat });
  const name = remote ? playerName(game, remote.seat) : '';

  async function share() {
    const text = `Join our spades game! Open this link, or open Spades and enter code ${remote.code}.`;
    try {
      if (navigator.share) await navigator.share({ title: 'Spades', text, url: link });
      else {
        await navigator.clipboard.writeText(`${text} ${link}`);
        setCopied(true);
      }
    } catch { /* closed the share sheet */ }
  }

  return (
    <Sheet title="Remote player" onClose={onClose} closeLabel="Done">
      <div className="section-title">Who's playing from somewhere else?</div>
      <div className="seat-pick">
        {SEATS.map((_, s) => (
          <button key={s} type="button" className={`seat-choice t${teamOf(s)}${remote?.seat === s ? ' on' : ''}`} onClick={() => choose(s)}>
            {playerName(game, s)}
            <small>{game.teams[teamOf(s)].name}</small>
          </button>
        ))}
      </div>

      {remote && (
        <>
          <div className="invite-card card">
            <div className="row between">
              <span className="eyebrow">Send this to {name}</span>
              <StatusDot on={peer} label={peer ? 'Connected' : 'Not connected yet'} />
            </div>
            <div className="code">{remote.code.split('').map((c, i) => <span key={i}>{c}</span>)}</div>
            {qr && <img className="qr" src={qr} alt={`QR code to join as ${name}`} />}
            <button type="button" className="primary big" onClick={share}>
              <Icon name="share" /> {copied ? 'Link copied' : `Send link to ${name}`}
            </button>
            <p className="footnote center">
              {name} opens the link on their phone (or opens Spades, taps <b>Join a game</b> and types the code).
              They'll see their cards, everyone's bids and books, and can video chat.
            </p>
          </div>
          {!onlineReady && (
            <p className="scan-msg">Remote play isn't connected to the internet yet, so this only works between tabs on this device.</p>
          )}
          <button type="button" className="danger-link" onClick={() => { onSet(null); onClose(); }}>Stop remote play</button>
        </>
      )}
    </Sheet>
  );
}
