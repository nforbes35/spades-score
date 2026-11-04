// Where each domino on the table goes, as on a real table: the first tile in the middle, the line running out
// both ways and snaking back when it reaches the edge (the right side snakes downward, the left side upward, so
// they never cross), and a spinner's up/down arms running straight. The first tile, if it's a double, lies
// crosswise; later doubles lie in line so the snaking rows can sit close together.
// Units: a tile is 1 wide and 2 long. Returns tiles { t, cx, cy, vertical, a, b } (a = top/left half),
// the open ends' spots (where the next tile would go), and the bounding box.
import { halves } from './engine.js';

export function boardLayout(layout, { reach = 8 } = {}) {
  const tiles = [];
  const ends = {};
  if (!layout) return { tiles, ends, box: { x0: -1, y0: -1, x1: 1, y1: 1 } };
  const [ra, rb] = halves(layout.root);
  const rootDouble = ra === rb;
  tiles.push({ t: layout.root, cx: 0, cy: 0, vertical: rootDouble, a: ra, b: rb, root: true });
  const hw = rootDouble ? 0.5 : 1; // half the root's length along the line

  // L and R: rows of tiles that turn (one tile across) when they reach `reach`, and turn again near the middle
  const snake = (arm, side) => {
    const list = layout.arms[arm] ?? [];
    let dir = side; // +1 right, -1 left
    let x = side * hw; // the open edge of the row
    let y = 0;
    const turn = side; // the right side turns down (+1), the left side up (-1)
    const near = hw + 0.4;
    for (const p of list) {
      const along = 2;
      const edge = Math.abs(x + dir * along);
      const outward = dir === side;
      if ((outward && edge > reach) || (!outward && edge < near)) {
        // a corner: this tile stands across, its first half beside the row's end, then the row comes back
        const cx = x + dir * 0.5;
        const cy = y + turn * 0.5;
        tiles.push({ t: p.t, cx, cy, vertical: true, a: turn > 0 ? p.inner : p.outer, b: turn > 0 ? p.outer : p.inner });
        y += turn;
        dir = -dir;
        continue;
      }
      tiles.push({ t: p.t, cx: x + (dir * along) / 2, cy: y, vertical: false, a: dir > 0 ? p.inner : p.outer, b: dir > 0 ? p.outer : p.inner });
      x += dir * along;
    }
    ends[arm] = { x: x + dir * 1, y, vertical: false };
  };
  snake('R', 1);
  snake('L', -1);

  // a spinner's up and down arms: straight lines off the double
  if (layout.spinner && layout.arms.L?.length && layout.arms.R?.length) {
    for (const [arm, dir] of [['U', -1], ['D', 1]]) {
      let y = dir * 1; // the double stands across the line, so it reaches 1 up and 1 down
      for (const p of layout.arms[arm] ?? []) {
        const along = 2;
        tiles.push({ t: p.t, cx: 0, cy: y + (dir * along) / 2, vertical: true, a: dir > 0 ? p.inner : p.outer, b: dir > 0 ? p.outer : p.inner });
        y += dir * along;
      }
      ends[arm] = { x: 0, y: y + dir * 1, vertical: true };
    }
  }

  let box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const t of tiles) {
    const w = t.vertical ? 0.5 : 1, h = t.vertical ? 1 : 0.5;
    box = { x0: Math.min(box.x0, t.cx - w), y0: Math.min(box.y0, t.cy - h), x1: Math.max(box.x1, t.cx + w), y1: Math.max(box.y1, t.cy + h) };
  }
  for (const e of Object.values(ends)) {
    box = { x0: Math.min(box.x0, e.x - 0.6), y0: Math.min(box.y0, e.y - 0.6), x1: Math.max(box.x1, e.x + 0.6), y1: Math.max(box.y1, e.y + 0.6) };
  }
  return { tiles, ends, box };
}
