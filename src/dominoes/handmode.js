// Hand mode: which colour (and swipe direction) goes with each place a picked domino can go. The phone lights its
// edges in these colours and a TV highlights the same colours on the spots.

export const AIM = {
  up: { color: '#3b82f6', name: 'Blue', arrow: '▲' },
  down: { color: '#f59e0b', name: 'Orange', arrow: '▼' },
  left: { color: '#ec4899', name: 'Pink', arrow: '◀' },
  right: { color: '#22c55e', name: 'Green', arrow: '▶' },
};
const ORDER = ['up', 'down', 'left', 'right'];

/**
 * The places `tile` can go, shared out to the four directions: the top first, then the bottom, then left and
 * right. More than four places (it can happen in Chicken Foot): further pages of four.
 */
export function aimPages(moves, tile) {
  const places = moves.filter((m) => m.tile === tile);
  const pages = [];
  for (let i = 0; i < places.length; i += ORDER.length) {
    pages.push(places.slice(i, i + ORDER.length).map((m, k) => ({ arm: m.arm, dir: ORDER[k] })));
  }
  return pages;
}

/** Which way a finger moved, or null if it barely moved. */
export function swipeDirection(dx, dy, min = 36) {
  if (Math.hypot(dx, dy) < min) return null;
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
}

/** The biggest tile width that fits `count` standing tiles in a box, trying 1 to 4 rows. */
export function handTileWidth(count, w, h, { gap = 8, max = 96 } = {}) {
  if (!count || w <= 0 || h <= 0) return { width: Math.min(max, 48), perRow: Math.max(count, 1) };
  let best = { width: 0, perRow: count };
  for (let rows = 1; rows <= 4; rows++) {
    const perRow = Math.ceil(count / rows);
    const width = Math.min(max, (w - gap * (perRow - 1)) / perRow, (h - gap * (rows - 1)) / rows / 2);
    if (width > best.width + 0.5) best = { width, perRow };
  }
  return { width: Math.max(14, Math.floor(best.width)), perRow: best.perRow };
}
