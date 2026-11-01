// Reads the playing cards in a photo on the phone itself: free, no account, and the photo never
// leaves the device. Uses an open model that spots card corners (sroot/lgd-cards-gen3 on Hugging
// Face, AGPL-3.0; see public/models/README.txt). It runs in a background thread via onnxruntime-web.

const MODEL_URL = '/models/cards-gen3.onnx';
// Model output order (model.classes.json).
const NAMES = ['10C', '10D', '10H', '10S', '2C', '2D', '2H', '2S', '3C', '3D', '3H', '3S', '4C', '4D', '4H', '4S',
  '5C', '5D', '5H', '5S', '6C', '6D', '6H', '6S', '7C', '7D', '7H', '7S', '8C', '8D', '8H', '8S', '9C', '9D', '9H', '9S',
  'AC', 'AD', 'AH', 'AS', 'JC', 'JD', 'JH', 'JS', 'KC', 'KD', 'KH', 'KS', 'QC', 'QD', 'QH', 'QS'];
// One corner can only be one card: when two cards' best corners sit on the same spot (boxes overlapping
// this much, while neighbors in a fan overlap about 0.2), the weaker one was misread and is turned down to
// a "maybe". Seen on the owner's deck: 6♠ also read as 6♣, 10♥ as 10♦.
const SAME_SPOT = 0.5;
const SHADOW_SCORE = 0.3;
// Fewer than 13 cards scoring this high: look again more closely.
const TILE_IF_BELOW = 0.5;
// The model was trained on 640-pixel pictures; a second, larger look catches smaller corners.
const SIZES = [640, 960];
const TILE_SIZE = 640;

let loading = null;

/** Start downloading the model (about 38 MB, once; the browser keeps it). */
export function loadCardReader() {
  loading ??= (async () => {
    const ort = await import('onnxruntime-web/wasm');
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.proxy = true; // keep the screen responsive while it thinks
    const session = await ort.InferenceSession.create(MODEL_URL, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
    return { ort, session };
  })().catch((err) => {
    loading = null;
    throw err;
  });
  return loading;
}

/** Draw part of the image into a padded square-ish input (sides a multiple of 32) and make a tensor. */
function toTensor(ort, bitmap, [sx, sy, sw, sh], size) {
  const scale = Math.min(1.5, size / Math.max(sw, sh));
  const w = Math.round(sw * scale);
  const h = Math.round(sh * scale);
  const W = Math.ceil(w / 32) * 32;
  const H = Math.ceil(h / 32) * 32;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = 'rgb(114,114,114)';
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, W, H);
  const n = W * H;
  const input = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    input[i] = data[i * 4] / 255;
    input[n + i] = data[i * 4 + 1] / 255;
    input[2 * n + i] = data[i * 4 + 2] / 255;
  }
  return { tensor: new ort.Tensor('float32', input, [1, 3, H, W]), scale };
}

/**
 * The model boxes card corners (about two per card) as [x, y, w, h, 52 card scores] per anchor.
 * A hand never has the same card twice, so the best score per card is all we need.
 */
function bestScores(output, into, boxes, [rx, ry], scale) {
  const [, rows, anchors] = output.dims;
  const d = output.data;
  for (let r = 4; r < rows; r++) {
    let best = into[r - 4];
    let at = -1;
    for (let a = 0, i = r * anchors; a < anchors; a++, i++) if (d[i] > best) { best = d[i]; at = a; }
    if (at < 0) continue;
    into[r - 4] = best;
    // Where this card's best corner is, in photo pixels.
    const cx = d[at] / scale + rx;
    const cy = d[anchors + at] / scale + ry;
    const w = d[2 * anchors + at] / scale;
    const h = d[3 * anchors + at] / scale;
    boxes[r - 4] = [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2];
  }
}

const overlap = (a, b) => {
  const w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
  const h = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  if (w <= 0 || h <= 0) return 0;
  const inter = w * h;
  return inter / ((a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter);
};

/**
 * Score every card for how likely it is to be in the photo. Returns { scores, shadowed }: scores maps
 * each card code (like "QH") to its best score, 0 to 1 (learning.js turns these into a hand), and
 * shadowed lists cards turned down because a stronger card was read on the same corner.
 */
export async function readCards(file, onStep = () => {}) {
  onStep('loading');
  const { ort, session } = await loadCardReader();
  onStep('reading');
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const { width: W, height: H } = bitmap;
  const best = new Array(NAMES.length).fill(0);
  const boxes = new Array(NAMES.length).fill(null);

  const run = async (region, size) => {
    const { tensor, scale } = toTensor(ort, bitmap, region, size);
    const out = await session.run({ [session.inputNames[0]]: tensor });
    bestScores(out[session.outputNames[0]], best, boxes, region, scale);
  };

  for (const size of SIZES) await run([0, 0, W, H], size);
  // Corners can be small in a wide shot: look again in four overlapping quarters.
  if (best.filter((s) => s >= TILE_IF_BELOW).length < 13) {
    const tw = Math.round(W * 0.6);
    const th = Math.round(H * 0.6);
    for (const [x, y] of [[0, 0], [W - tw, 0], [0, H - th], [W - tw, H - th]]) {
      await run([x, y, tw, th], TILE_SIZE);
    }
  }
  bitmap.close?.();
  const raw = best.map((s) => Math.round(s * 1000) / 1000);
  const final = [...raw];
  const seen = raw.map((s, i) => i).filter((i) => raw[i] >= SHADOW_SCORE && boxes[i]).sort((a, b) => raw[b] - raw[a]);
  const shadowed = [];
  seen.forEach((i, k) => {
    for (const j of seen.slice(0, k)) {
      if (overlap(boxes[i], boxes[j]) > SAME_SPOT) {
        final[i] = Math.min(final[i], SHADOW_SCORE);
        shadowed.push(NAMES[i]);
        break;
      }
    }
  });
  const byCode = (list) => Object.fromEntries(NAMES.map((code, i) => [code, list[i]]));
  return { scores: byCode(final), raw: byCode(raw), shadowed };
}
