import test from 'node:test';
import assert from 'node:assert/strict';
import { newHand, moveHand, stepWash } from '../src/dominoes/wash.js';

const W = 320, H = 640, L = 45;
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const pile = () => Array.from({ length: 28 }, () => { const a = rnd() * 6.28, d = rnd() * 90; return { x: W / 2 + Math.cos(a) * d, y: H / 2 + Math.sin(a) * d, r: rnd() * 6.28, vx: 0, vy: 0, vr: 0 }; });
const settle = (tiles, hands, from, n) => { for (let i = 0; i < n; i++) stepWash(tiles, hands, { W, H, L, now: from + i * 16.7 }); };
const nearWall = (tiles) => tiles.filter((t) => t.x <= L / 2 + 2 || t.x >= W - L / 2 - 2 || t.y <= L / 2 + 2 || t.y >= H - L / 2 - 2).length;

/** A finger going back and forth through the pile for `ms`. */
function stir(tiles, speedPxPerMs, ms) {
  let hand = newHand();
  let x = W / 2 - 80, dir = 1, now = 0;
  while (now < ms) {
    x += dir * speedPxPerMs * 16.7;
    if (x > W / 2 + 80) dir = -1;
    if (x < W / 2 - 80) dir = 1;
    hand = moveHand(hand, x, H / 2 + Math.sin(now / 200) * 50, now, L);
    stepWash(tiles, [hand], { W, H, L, now });
    now += 16.7;
  }
  return now;
}

test('settling: an untouched pile stays a pile', () => {
  const tiles = pile();
  settle(tiles, [], 0, 200);
  assert.equal(nearWall(tiles), 0);
});
test('a hand that isn’t moving doesn’t push anything', () => {
  const tiles = pile();
  settle(tiles, [], 0, 200);
  const before = tiles.map((t) => [t.x, t.y]);
  let hand = newHand();
  for (let i = 0; i < 30; i++) { hand = moveHand(hand, W / 2, H / 2, i * 16.7, L); stepWash(tiles, [hand], { W, H, L, now: i * 16.7 }); }
  const moved = Math.max(...tiles.map((t, i) => Math.hypot(t.x - before[i][0], t.y - before[i][1])));
  assert.ok(moved < L * 0.25, `moved ${moved}`);
});
for (const [name, speed] of [['slow', 0.4], ['fast', 3]]) {
  test(`a ${name} stir mixes the pile without blasting it apart`, () => {
    const tiles = pile();
    settle(tiles, [], 0, 200);
    const start = tiles.map((t) => [t.x, t.y, t.r]);
    const now = stir(tiles, speed, 4000);
    settle(tiles, [], now, 60);
    assert.ok(nearWall(tiles) <= 2, `${nearWall(tiles)} tiles against the wall`);
    const spread = Math.max(...tiles.map((t) => Math.hypot((t.x - W / 2), (t.y - H / 2))));
    assert.ok(spread < H * 0.45, `spread ${spread}`);
    const moved = tiles.filter((t, i) => Math.hypot(t.x - start[i][0], t.y - start[i][1]) > L * 0.5).length;
    const turned = tiles.filter((t, i) => Math.abs(t.r - start[i][2]) > 0.3).length;
    assert.ok(moved >= 10, `${moved} moved`);
    assert.ok(turned >= 8, `${turned} turned`);
  });
}
test('tiles move with the hand, not away from it', () => {
  const tiles = [{ x: 170, y: 320, r: 0, vx: 0, vy: 0, vr: 0 }];
  let hand = newHand();
  for (let i = 0; i < 12; i++) { hand = moveHand(hand, 120 + i * 8, 320, i * 16.7, L); stepWash(tiles, [hand], { W, H, L, now: i * 16.7 }); }
  assert.ok(tiles[0].x > 175, `x ${tiles[0].x}`);
});
