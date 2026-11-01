// Video chat between the two phones over WebRTC, using the game room to exchange connection
// details ("perfect negotiation": the host is impolite, the remote player is polite).
import { useCallback, useEffect, useRef, useState } from 'react';

const ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
// Optional relay for networks that block direct connections (some cellular carriers).
if (import.meta.env.VITE_TURN_URL) {
  ICE.push({
    urls: import.meta.env.VITE_TURN_URL,
    username: import.meta.env.VITE_TURN_USERNAME,
    credential: import.meta.env.VITE_TURN_CREDENTIAL,
  });
}

const constraints = (facing) => ({
  video: { facingMode: facing, width: { ideal: 640 }, height: { ideal: 480 } },
  audio: { echoCancellation: true, noiseSuppression: true },
});

export function useVideoCall(send, polite) {
  const [local, setLocal] = useState(null);
  const [remote, setRemote] = useState(null);
  const [state, setState] = useState('idle');
  const [incoming, setIncoming] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [error, setError] = useState('');
  const r = useRef({ pc: null, local: null, makingOffer: false, ignoreOffer: false, facing: 'user' });
  const sendRef = useRef(send);
  sendRef.current = send;
  const rtc = (m) => sendRef.current({ type: 'rtc', ...m });

  const newPc = useCallback(() => {
    const s = r.current;
    s.pc?.close();
    const pc = new RTCPeerConnection({ iceServers: ICE });
    s.pc = pc;
    pc.ontrack = (e) => setRemote(e.streams[0] ?? new MediaStream([e.track]));
    pc.onicecandidate = (e) => { if (e.candidate) rtc({ candidate: e.candidate.toJSON() }); };
    pc.onnegotiationneeded = async () => {
      try {
        s.makingOffer = true;
        await pc.setLocalDescription();
        rtc({ description: pc.localDescription.toJSON() });
      } catch (err) {
        console.warn('video offer failed', err);
      } finally {
        s.makingOffer = false;
      }
    };
    pc.onconnectionstatechange = () => setState(pc.connectionState);
    s.local?.getTracks().forEach((t) => pc.addTrack(t, s.local));
    setState('connecting');
    return pc;
  }, []);

  const stopAll = useCallback(() => {
    const s = r.current;
    s.pc?.close();
    s.pc = null;
    s.local?.getTracks().forEach((t) => t.stop());
    s.local = null;
    setLocal(null);
    setRemote(null);
    setIncoming(false);
    setState('idle');
  }, []);

  /** Turn on this phone's camera and call (or join) the other phone. */
  const start = useCallback(async () => {
    const s = r.current;
    setError('');
    try {
      s.local = await navigator.mediaDevices.getUserMedia(constraints(s.facing));
    } catch {
      setError('Camera or microphone was blocked. Allow them in your browser settings and try again.');
      return;
    }
    setLocal(s.local);
    setMicOn(true);
    setCamOn(true);
    setIncoming(false);
    const live = s.pc && !['failed', 'closed'].includes(s.pc.connectionState);
    if (live) s.local.getTracks().forEach((t) => s.pc.addTrack(t, s.local));
    else {
      rtc({ kind: 'start' });
      newPc();
    }
  }, [newPc]);

  const hangUp = useCallback(() => {
    rtc({ kind: 'end' });
    stopAll();
  }, [stopAll]);

  /** Messages of type "rtc" from the room come here. */
  const handle = useCallback(async (m) => {
    const s = r.current;
    if (m.kind === 'end') { stopAll(); return; }
    if (m.kind === 'start') {
      newPc();
      if (!s.local) setIncoming(true);
      return;
    }
    const pc = s.pc ?? newPc();
    try {
      if (m.description) {
        const collision = m.description.type === 'offer' && (s.makingOffer || pc.signalingState !== 'stable');
        s.ignoreOffer = !polite && collision;
        if (s.ignoreOffer) return;
        await pc.setRemoteDescription(m.description);
        if (m.description.type === 'offer') {
          await pc.setLocalDescription();
          rtc({ description: pc.localDescription.toJSON() });
        }
      } else if (m.candidate) {
        await pc.addIceCandidate(m.candidate);
      }
    } catch (err) {
      if (!s.ignoreOffer) console.warn('video signal failed', err);
    }
  }, [newPc, stopAll, polite]);

  const toggleMic = () => {
    const t = r.current.local?.getAudioTracks()[0];
    if (t) { t.enabled = !t.enabled; setMicOn(t.enabled); }
  };
  const toggleCam = () => {
    const t = r.current.local?.getVideoTracks()[0];
    if (t) { t.enabled = !t.enabled; setCamOn(t.enabled); }
  };
  /** Switch between the front and back camera (e.g. to show the table). */
  const flip = async () => {
    const s = r.current;
    if (!s.local) return;
    s.facing = s.facing === 'user' ? 'environment' : 'user';
    try {
      const fresh = await navigator.mediaDevices.getUserMedia({ video: constraints(s.facing).video });
      const track = fresh.getVideoTracks()[0];
      const old = s.local.getVideoTracks()[0];
      await s.pc?.getSenders().find((x) => x.track?.kind === 'video')?.replaceTrack(track);
      s.local.removeTrack(old);
      old.stop();
      s.local.addTrack(track);
      track.enabled = camOn;
      setLocal(new MediaStream(s.local.getTracks()));
    } catch {
      s.facing = s.facing === 'user' ? 'environment' : 'user';
    }
  };

  useEffect(() => () => {
    r.current.pc?.close();
    r.current.local?.getTracks().forEach((t) => t.stop());
  }, []);

  return {
    local, remote, state, incoming, micOn, camOn, error, mirrored: r.current.facing === 'user',
    active: Boolean(local || remote || incoming),
    start, hangUp, handle, toggleMic, toggleCam, flip, dismiss: () => setIncoming(false),
  };
}
