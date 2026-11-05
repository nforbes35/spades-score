// The feel of mixing face-down tiles on a table (pure, so it can be tested). A hand moving through the pile carries the
// tiles it touches along with it and turns them; they bump their neighbours; the table's friction stops them quickly.
// A hand that isn't moving does nothing, and however fast it moves it can't fling tiles away: their speed is capped
// and the pile drifts back together, so there's always something left to mix.

const HOLD_MS = 130; // a hand keeps stirring this long after its last touch sample
export const newHand = () => ({ x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, at: -Infinity });

/** A new touch at (x, y) for this hand, at time `now` (ms). `L` is a tile's length in pixels. */
export function moveHand(hand, x, y, now, L) {
  const fresh = now - hand.at < 250;
  const gap = Math.max(8, now - hand.at);
  let vx = fresh ? ((x - hand.x) / gap) * 16.7 : 0;
  let vy = fresh ? ((y - hand.y) / gap) * 16.7 : 0;
  const top = L * 0.6;
  const speed = Math.hypot(vx, vy);
  if (speed > top) { vx *= top / speed; vy *= top / speed; }
  return { x, y, px: fresh ? hand.x : x, py: fresh ? hand.y : y, vx, vy, at: now };
}

/** How far a point is from the stretch the hand just moved along (so a fast swipe doesn't skip over tiles). */
function reachOf(hand, x, y) {
  const ax = hand.px, ay = hand.py;
  const bx = hand.x - ax, by = hand.y - ay;
  const len = bx * bx + by * by;
  const u = len ? Math.max(0, Math.min(1, ((x - ax) * bx + (y - ay) * by) / len)) : 1;
  return { dx: x - (ax + bx * u), dy: y - (ay + by * u) };
}

/** Moves the tiles one frame (dt = 1 at 60 frames a second). */
export function stepWash(tiles, hands, { W, H, L, dt = 1, now = 0 }) {
  const reach = L * 1.3;
  const maxSpeed = L * 0.42;
  for (const hand of hands) {
    const age = now - hand.at;
    if (age > HOLD_MS) continue;
    const fade = hand.soft ?? 1 - age / HOLD_MS;
    for (const t of tiles) {
      const { dx, dy } = reachOf(hand, t.x, t.y);
      const d = Math.hypot(dx, dy);
      if (d > reach) continue;
      const w = (1 - d / reach) * fade;
      // carried along with the hand
      const grip = Math.min(1, w * 0.4 * dt);
      t.vx += (hand.vx - t.vx) * grip;
      t.vy += (hand.vy - t.vy) * grip;
      // and turned: a tile caught off-centre spins the way the hand drags it
      t.vr += ((dx * hand.vy - dy * hand.vx) / (reach * reach)) * w * 0.28 * dt;
    }
  }
  // tiles bump their neighbours rather than sliding through them
  const room = L * 0.62;
  for (let i = 0; i < tiles.length; i++) {
    for (let j = i + 1; j < tiles.length; j++) {
      const a = tiles[i], b = tiles[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 0.01;
      if (d >= room) continue;
      const shove = ((room - d) / room) * 0.32 * dt;
      const nx = dx / d, ny = dy / d;
      a.vx -= nx * shove; a.vy -= ny * shove;
      b.vx += nx * shove; b.vy += ny * shove;
      // some of a moving tile's motion passes to the one it hits
      const share = ((a.vx - b.vx) * nx + (a.vy - b.vy) * ny) * 0.12;
      if (share > 0) { a.vx -= nx * share; a.vy -= ny * share; b.vx += nx * share; b.vy += ny * share; }
    }
  }
  const cx = W / 2, cy = H / 2;
  const rx = W * 0.4, ry = H * 0.36;
  const friction = 0.87 ** dt;
  for (const t of tiles) {
    // past the edge of the pile, the tile eases back in
    const out = Math.hypot((t.x - cx) / rx, (t.y - cy) / ry);
    if (out > 1) {
      t.vx -= ((t.x - cx) / out) * (out - 1) * 0.02 * dt;
      t.vy -= ((t.y - cy) / out) * (out - 1) * 0.02 * dt;
    }
    const speed = Math.hypot(t.vx, t.vy);
    if (speed > maxSpeed) { t.vx *= maxSpeed / speed; t.vy *= maxSpeed / speed; }
    t.vr = Math.max(-0.2, Math.min(0.2, t.vr));
    t.x += t.vx * dt; t.y += t.vy * dt; t.r += t.vr * dt;
    t.vx *= friction; t.vy *= friction; t.vr *= friction;
    if (t.x < L / 2 || t.x > W - L / 2) { t.vx *= -0.3; t.x = Math.max(L / 2, Math.min(W - L / 2, t.x)); }
    if (t.y < L / 2 || t.y > H - L / 2) { t.vy *= -0.3; t.y = Math.max(L / 2, Math.min(H - L / 2, t.y)); }
  }
}
