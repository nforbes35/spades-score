// Picking a card out of a fanned hand by touch (see FannedHand in components.jsx).

/**
 * Which card a finger is on. Cards overlap left to right, so the card you can see at `x` is the
 * last one whose left edge is at or before it (its visible strip), not whichever is on top in the
 * page. Off either end picks the end card.
 */
export function cardAt(x, lefts, cardW) {
  if (!lefts.length) return -1;
  if (x < lefts[0]) return 0;
  for (let i = lefts.length - 1; i >= 0; i--) if (x >= lefts[i]) return x <= lefts[i] + cardW ? i : lefts.length - 1;
  return 0;
}
