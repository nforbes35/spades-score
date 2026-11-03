import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bigLayout } from '../src/lib/bigLayout.js';

// Played cards in a cross around (cx, cy): w × h cards, `spread` from the middle.
const cross = (cx, cy, w = 70, h = 100, spread = 60) => [
  { left: cx - w / 2, right: cx + w / 2, top: cy + spread - h / 2, bottom: cy + spread + h / 2 }, // bottom
  { left: cx - spread - w / 2, right: cx - spread + w / 2, top: cy - h / 2, bottom: cy + h / 2 }, // left
  { left: cx - w / 2, right: cx + w / 2, top: cy - spread - h / 2, bottom: cy - spread + h / 2 }, // top
  { left: cx + spread - w / 2, right: cx + spread + w / 2, top: cy - h / 2, bottom: cy + h / 2 }, // right
];
const overlaps = (r, c) => r.left < c.right && r.left + r.width > c.left && r.top < c.bottom && r.top + r.height > c.top;

for (const [name, W, H, bottom] of [['upright phone', 390, 470, 0], ['sideways phone', 844, 200, 0], ['TV', 1280, 640, 50], ['small phone', 375, 390, 0]]) {
  test(`big video tiles stay off the played cards and inside the table: ${name}`, () => {
    const cards = cross(W / 2, (H - bottom) / 2);
    const { rects } = bigLayout({ width: W, height: H, cards, bottom });
    const all = Object.values(rects);
    assert.equal(all.length, 4);
    for (const r of all) {
      for (const c of cards) assert.ok(!overlaps(r, c), `${JSON.stringify(r)} covers a card`);
      assert.ok(r.left >= 0 && r.top >= 0 && r.left + r.width <= W && r.top + r.height <= H - bottom);
      assert.ok(r.width / r.height <= 1.5 + 1e-9 && r.width / r.height >= 0.62 - 1e-9);
    }
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) assert.ok(!overlaps(all[i], all[j]), 'tiles overlap');
  });
}

test('very wide tables put two tiles side by side on each side', () => {
  assert.equal(bigLayout({ width: 844, height: 200, cards: cross(422, 100) }).kind, 'pairs');
});
