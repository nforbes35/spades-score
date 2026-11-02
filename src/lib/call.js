// Group video chat for everyone in the game room, over WebRTC. Each pair of devices in the call gets
// its own direct connection (fine for the handful of people at a card table); the game room carries
// the connection details ("perfect negotiation", the device with the larger id being polite).
import { useCallback, useEffect, useRef, useState } from 'react';
import { soundDevice } from './place.js';

const ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
// Optional relay for networks that block direct connections (some cellular carriers).
if (import.meta.env.VITE_TURN_URL) {
  ICE.push({
    urls: import.meta.env.VITE_TURN_URL,
    username: import.meta.env.VITE_TURN_USERNAME,
    credential: import.meta.env.VITE_TURN_CREDENTIAL,
  });
}

const videoConstraints = (facing) => ({ facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } });

/**
 * `room` is useRoom's result, `me`/`setMe` this device's room identity (the call sets me.call and
 * me.mic). `facing` is the camera to start with: 'environment' (rear) for the table, 'user' for faces.
 * TV screens join with `receiveOnly`.
 */
export function useCall({ room, me, setMe, facing = 'user', receiveOnly = false }) {
  const [local, setLocal] = useState(null);
  const [remotes, setRemotes] = useState({});
  const [micOn, setMicOn] = useState(true);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState('');
  const pcs = useRef(new Map());
  const localRef = useRef(null);
  const facingRef = useRef(facing);
  const sendRef = useRef(room.send);
  sendRef.current = room.send;
  const meRef = useRef(me);
  meRef.current = me;

  const close = useCallback((id) => {
    const s = pcs.current.get(id);
    if (!s) return;
    s.pc.close();
    pcs.current.delete(id);
    setRemotes((r) => {
      const next = { ...r };
      delete next[id];
      return next;
    });
  }, []);

  const connect = useCallback((id) => {
    let s = pcs.current.get(id);
    if (s) return s;
    const pc = new RTCPeerConnection({ iceServers: ICE });
    s = { pc, makingOffer: false, ignoreOffer: false, polite: meRef.current.id > id };
    pcs.current.set(id, s);
    const rtc = (m) => sendRef.current({ type: 'rtc', ...m }, id);
    pc.ontrack = (e) => setRemotes((r) => ({ ...r, [id]: e.streams[0] ?? new MediaStream([e.track]) }));
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
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') pc.restartIce();
    };
    const stream = localRef.current;
    stream?.getTracks().forEach((t) => pc.addTrack(t, stream));
    return s;
  }, []);

  // Keep one connection to every other device that's in the call.
  const inCall = me.call;
  const peerKey = room.peers.filter((p) => p.call).map((p) => p.id).sort().join(',');
  useEffect(() => {
    if (!inCall) return;
    const wanted = new Set(peerKey ? peerKey.split(',') : []);
    for (const id of wanted) connect(id);
    for (const id of [...pcs.current.keys()]) if (!wanted.has(id)) close(id);
  }, [inCall, peerKey, connect, close]);

  /** Messages of type "rtc" from the room come here. */
  const handle = useCallback(async (m) => {
    if (m.kind === 'leave') { close(m.from); return; }
    if (!meRef.current.call) return;
    const s = connect(m.from);
    const { pc } = s;
    try {
      if (m.description) {
        const collision = m.description.type === 'offer' && (s.makingOffer || pc.signalingState !== 'stable');
        s.ignoreOffer = !s.polite && collision;
        if (s.ignoreOffer) return;
        await pc.setRemoteDescription(m.description);
        if (m.description.type === 'offer') {
          await pc.setLocalDescription();
          sendRef.current({ type: 'rtc', description: pc.localDescription.toJSON() }, m.from);
        }
      } else if (m.candidate) {
        await pc.addIceCandidate(m.candidate);
      }
    } catch (err) {
      if (!s.ignoreOffer) console.warn('video signal failed', err);
    }
  }, [connect, close]);

  /** Turn on the camera (unless this is a TV) and join the call. `audioOnly` joins with just the mic. */
  const join = useCallback(async ({ audioOnly = false } = {}) => {
    setError('');
    if (!receiveOnly) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: audioOnly ? false : videoConstraints(facingRef.current),
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        localRef.current = stream;
        setLocal(stream);
        setCamOn(!audioOnly);
      } catch {
        setError('The camera or microphone was blocked. Allow them in this browser’s settings, then try again.');
        return;
      }
    }
    setMe((m) => ({ ...m, call: true, since: m.since ?? Date.now() }));
  }, [receiveOnly, setMe]);

  const leave = useCallback(() => {
    sendRef.current({ type: 'rtc', kind: 'leave' });
    for (const id of [...pcs.current.keys()]) close(id);
    localRef.current?.getTracks().forEach((t) => t.stop());
    localRef.current = null;
    setLocal(null);
    setTouched(false);
    setMe((m) => ({ ...m, call: false, mic: false }));
  }, [close, setMe]);

  // One device per place handles sound (see place.js). Until someone changes it by hand, follow that.
  const leader = me.call ? soundDevice(me, room.peers) : null;
  const handlesSound = !leader || leader.id === me.id;
  useEffect(() => {
    if (touched || !me.call) return;
    setMicOn(handlesSound && !receiveOnly);
    setSpeakerOn(handlesSound);
  }, [handlesSound, touched, me.call, receiveOnly]);

  useEffect(() => {
    localRef.current?.getAudioTracks().forEach((t) => { t.enabled = micOn; });
    if (me.call && me.mic !== (micOn && !receiveOnly)) setMe((m) => ({ ...m, mic: micOn && !receiveOnly }));
  }, [micOn, local, me.call, me.mic, receiveOnly, setMe]);

  const toggleMic = () => { setTouched(true); setMicOn((v) => !v); };
  const toggleSpeaker = () => { setTouched(true); setSpeakerOn((v) => !v); };
  const toggleCam = () => {
    const t = localRef.current?.getVideoTracks()[0];
    if (t) { t.enabled = !t.enabled; setCamOn(t.enabled); }
  };
  /** Switch between the rear camera (the table) and the front one (faces). */
  const flip = async () => {
    const stream = localRef.current;
    if (!stream) return;
    const next = facingRef.current === 'user' ? 'environment' : 'user';
    try {
      const fresh = await navigator.mediaDevices.getUserMedia({ video: videoConstraints(next) });
      const track = fresh.getVideoTracks()[0];
      const old = stream.getVideoTracks()[0];
      await Promise.all([...pcs.current.values()].map(({ pc }) =>
        pc.getSenders().find((x) => x.track?.kind === 'video')?.replaceTrack(track)));
      stream.removeTrack(old);
      old.stop();
      stream.addTrack(track);
      track.enabled = camOn;
      facingRef.current = next;
      setLocal(new MediaStream(stream.getTracks()));
    } catch { /* that camera isn't available */ }
  };

  useEffect(() => () => {
    for (const { pc } of pcs.current.values()) pc.close();
    localRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  // The other devices' videos, with who they are.
  const videos = room.peers
    .filter((p) => remotes[p.id])
    .map((p) => ({ peer: p, stream: remotes[p.id] }));

  return {
    joined: Boolean(me.call), local, videos, micOn, speakerOn, camOn, error,
    mirrored: facingRef.current === 'user',
    soundBy: handlesSound ? null : leader,
    join, leave, handle, toggleMic, toggleSpeaker, toggleCam, flip,
  };
}
