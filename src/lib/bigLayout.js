// Large video chat: where the four video tiles go. The tiles are made as big as they can be without covering
// any of the four spots where played cards land. Played cards make a cross, so the tiles can tuck into the
// table's corners around it. Two ways to arrange them are tried and the one with the biggest tiles wins:
//   'corners' – one in each corner of the table, all the same size, stopping short of the cards
//   'pairs'   – two side by side on each side of the cards, full height (very wide screens)
// Tiles keep a sensible shape (between upright 5:8 and sideways 3:2) so faces aren't cropped to a strip.

const MIN_ASPECT = 0.62;
const MAX_ASPECT = 1.5;

/** The biggest tile with a sensible shape that fits in a w × h box (null if there's no room). */
function fit(w, h) {
  if (!(w > 40 && h > 40)) return null;
  if (w / h > MAX_ASPECT) w = h * MAX_ASPECT;
  if (w / h < MIN_ASPECT) h = w / MIN_ASPECT;
  return { w, h };
}

/**
 * Tile rectangles for the four corners (tl, tr, bl, br: see CORNER in OnlineApp), in the table area's own
 * pixels. `cards` are the boxes where played cards land (already padded); `bottom` is room to leave along
 * the bottom.
 */
export function bigLayout({ width: W, height: H, cards, gap = 6, bottom = 0 }) {
  const B = H - bottom; // usable height
  const options = [];

  // Corners: try each height that stops at a card's edge (or half the table), and see how wide all four
  // tiles can then be without running into a card beside them.
  const widthFor = (h) => {
    let w = W / 2 - 1.5 * gap;
    for (const [top, bot] of [[gap, gap + h], [B - gap - h, B - gap]]) {
      for (const c of cards) {
        if (c.top >= bot || c.bottom <= top) continue; // not beside this tile
        w = Math.min(w, c.left - 2 * gap, W - c.right - 2 * gap);
      }
    }
    return w;
  };
  const heights = new Set([(B - 3 * gap) / 2]);
  for (const c of cards) heights.add(c.top - 2 * gap).add(B - c.bottom - 2 * gap);
  for (const h of heights) {
    if (h > (B - 3 * gap) / 2) continue;
    const t = fit(widthFor(h), h);
    if (t && widthFor(t.h) >= t.w - 0.5 && (!options[0] || t.w * t.h > options[0].w * options[0].h)) options[0] = t;
  }
  if (options[0]) {
    const { w, h } = options[0];
    options[0] = { kind: 'corners', w, h, rects: {
      tl: { left: gap, top: gap }, tr: { left: W - gap - w, top: gap },
      bl: { left: gap, top: B - gap - h }, br: { left: W - gap - w, top: B - gap - h },
    } };
  }

  // Pairs: beside all the cards, full height.
  if (cards.length) {
    const side = Math.min(Math.min(...cards.map((c) => c.left)), W - Math.max(...cards.map((c) => c.right)));
    const pairs = fit((side - 3 * gap) / 2, B - 2 * gap);
    if (pairs) {
      const { w, h } = pairs;
      const top = (B - h) / 2;
      // left to right: the left player, you, your partner, the right player
      options.push({ kind: 'pairs', w, h, rects: {
        tl: { left: gap, top }, bl: { left: 2 * gap + w, top },
        tr: { left: W - 2 * gap - 2 * w, top }, br: { left: W - gap - w, top },
      } });
    }
  }

  if (!options.length) return null;
  const best = options.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a));
  const rects = {};
  for (const [k, r] of Object.entries(best.rects)) rects[k] = { ...r, width: best.w, height: best.h };
  return { kind: best.kind, rects };
}
