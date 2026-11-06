// Where each domino on the table goes, as on a real table: the first tile in the middle, the line running out
// both ways and snaking back when it reaches the edge (the right side snakes downward, the left side upward, so
// they never cross), and a spinner's up/down arms running straight. The first tile, if it's a double, lies
// crosswise; later doubles lie in line so the snaking rows can sit close together.
// The open ends, where the game is being played, are drawn bigger: `zoom` times the size at the end tile, blending
// back to normal over the next two tiles of that arm.
// Units: a normal tile is 1 wide and 2 long. Returns tiles { t, cx, cy, vertical, a, b, s } (a = top/left half,
// s = its size), the open ends' spots (where the next tile would go), and the bounding box.
import { halves } from './engine.js';

const BLEND = [1, 2 / 3, 1 / 3]; // how much of the zoom a tile gets: the end tile, the next one, the one after

export function boardLayout(layout, { reach = 8, zoom = 1 } = {}) {
  const sizeAt = (fromEnd) => 1 + (zoom - 1) * (BLEND[fromEnd] ?? 0);
  const tiles = [];
  const ends = {};
  if (!layout) return { tiles, ends, box: { x0: -1, y0: -1, x1: 1, y1: 1 } };
  const [ra, rb] = halves(layout.root);
  const rootDouble = ra === rb;
  // the first tile is part of every arm, so it's as big as it is for the arm that ends nearest to it
  const crossArms = layout.spinner && layout.arms.L?.length && layout.arms.R?.length;
  const rootSize = Math.max(...(crossArms ? ['L', 'R', 'U', 'D'] : ['L', 'R']).map((arm) => sizeAt((layout.arms[arm] ?? []).length)));
  tiles.push({ t: layout.root, cx: 0, cy: 0, vertical: rootDouble, a: ra, b: rb, s: rootSize, root: true });
  const hw = (rootDouble ? 0.5 : 1) * rootSize; // half the root's length along the line

  // L and R: rows of tiles that turn when they reach `reach`, and turn again near the middle. A turn is one tile
  // standing across the row's end; the row comes back two rows further on, so rows never touch each other.
  // Each tile notes the tile it's joined to (`link`), so tests can check nothing else touches it.
  const snake = (arm, side) => {
    const list = layout.arms[arm] ?? [];
    let dir = side; // +1 right, -1 left
    let x = side * hw; // the open edge of the row
    let y = 0;
    const turn = side; // the right side turns down (+1), the left side up (-1)
    // where a returning row turns outward again: well clear of the middle (and of a spinner's up/down arms)
    const near = hw + (layout.spinner ? 1.5 : 0.6) + (rootSize - 1) * 1.2;
    let link = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      const s = sizeAt(list.length - 1 - i);
      const along = 2 * s;
      const edge = Math.abs(x + dir * along);
      const outward = dir === side;
      if ((outward && edge > reach) || (!outward && edge < near + (s - 1) * 2)) {
        // a corner: this tile stands across, its first half beside the row's end; the next row starts under its far half
        const cx = x + dir * 0.5 * s;
        const cy = y + turn * 0.5 * s;
        tiles.push({ t: p.t, cx, cy, vertical: true, a: turn > 0 ? p.inner : p.outer, b: turn > 0 ? p.outer : p.inner, s, link });
        link = tiles.length - 1;
        x += dir * s; // the corner's far side: the next row's first tile reaches back under the corner
        const next = i + 1 < list.length ? sizeAt(list.length - 2 - i) : zoom;
        y += turn * (1.5 * s + 0.5 * next);
        dir = -dir;
        continue;
      }
      tiles.push({ t: p.t, cx: x + (dir * along) / 2, cy: y, vertical: false, a: dir > 0 ? p.inner : p.outer, b: dir > 0 ? p.outer : p.inner, s, link });
      link = tiles.length - 1;
      x += dir * along;
    }
    ends[arm] = { x: x + dir * zoom, y, vertical: false };
  };
  snake('R', 1);
  snake('L', -1);

  // a spinner's up and down arms: straight lines off the double
  if (crossArms) {
    for (const [arm, dir] of [['U', -1], ['D', 1]]) {
      let y = dir * rootSize; // the double stands across the line, so it reaches this far up and down
      let prev = 0;
      const list = layout.arms[arm] ?? [];
      list.forEach((p, i) => {
        const s = sizeAt(list.length - 1 - i);
        const along = 2 * s;
        tiles.push({ t: p.t, cx: 0, cy: y + (dir * along) / 2, vertical: true, a: dir > 0 ? p.inner : p.outer, b: dir > 0 ? p.outer : p.inner, s, link: prev });
        prev = tiles.length - 1;
        y += dir * along;
      });
      ends[arm] = { x: 0, y: y + dir * zoom, vertical: true };
    }
  }

  let box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const t of tiles) {
    const w = (t.vertical ? 0.5 : 1) * t.s, h = (t.vertical ? 1 : 0.5) * t.s;
    box = { x0: Math.min(box.x0, t.cx - w), y0: Math.min(box.y0, t.cy - h), x1: Math.max(box.x1, t.cx + w), y1: Math.max(box.y1, t.cy + h) };
  }
  for (const e of Object.values(ends)) {
    const r = 1.05 * zoom;
    box = { x0: Math.min(box.x0, e.x - r), y0: Math.min(box.y0, e.y - r), x1: Math.max(box.x1, e.x + r), y1: Math.max(box.y1, e.y + r) };
  }
  return { tiles, ends, box };
}

/**
 * The layout for a board `w` × `h` pixels: tries runs of different lengths and takes the longest one that keeps
 * the tiles nearly as big as they can be (so the line runs a good way before it turns). Returns the layout and
 * the size of one unit (half a normal tile's length) in pixels.
 */
export const END_ZOOM = 1.5; // how much bigger the tile at an open end is than the rest of the line

export function fitBoard(layout, w, h, maxUnit = 38) {
  const tries = [6, 7, 8, 9, 10, 11, 12, 14, 16].map((reach) => {
    const L = boardLayout(layout, { reach, zoom: END_ZOOM });
    const unit = Math.min(maxUnit, w / (L.box.x1 - L.box.x0), h / (L.box.y1 - L.box.y0));
    return { L, unit, reach };
  });
  const best = Math.max(...tries.map((t) => t.unit));
  return [...tries].reverse().find((t) => t.unit >= best * 0.85);
}
