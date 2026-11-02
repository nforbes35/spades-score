"""Score a card reader on real photos the same way the app does, so old and new can be compared.

Put real photos in WORK/real with their true hands in WORK/real/truth.json, e.g.
  {"IMG_2573.jpg": ["3D", "KS", ...], ...}
Each photo is also tried dim, small, blurry and sideways.

    .venv/bin/python training/evaluate.py public/models/cards-gen3.onnx [other.onnx ...]
"""
import json
import sys
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort

from common import WORK, NAMES, REPO

# Same numbers as src/lib/cardVision.js and src/lib/learning.js.
FULL = (640, 960)
TILE = 640
TILE_IF_BELOW = 0.5
SAME_SPOT = 0.5
SHADOW = 0.3
PICK = 0.5
FILL_SCORE = 0.28  # score where learning.js's FILL chance (0.1) is reached before any learning


def tensor(img, region, size):
    x, y, w, h = [int(round(v)) for v in region]
    crop = img[y:y + h, x:x + w]
    scale = min(1.5, size / max(w, h))
    nw, nh = round(w * scale), round(h * scale)
    W, H = -(-nw // 32) * 32, -(-nh // 32) * 32
    canvas = np.full((H, W, 3), 114, np.uint8)
    canvas[:nh, :nw] = cv2.resize(crop, (nw, nh), interpolation=cv2.INTER_AREA)
    rgb = cv2.cvtColor(canvas, cv2.COLOR_BGR2RGB).astype(np.float32) / 255
    return rgb.transpose(2, 0, 1)[None], scale


def read(session, img):
    H, W = img.shape[:2]
    best = np.zeros(52, np.float32)
    boxes = [None] * 52

    def run(region, size):
        t, scale = tensor(img, region, size)
        out = session.run(None, {session.get_inputs()[0].name: t})[0][0]  # (56, anchors)
        cls = out[4:]
        at = cls.argmax(1)
        for c in range(52):
            s = cls[c, at[c]]
            if s > best[c]:
                best[c] = s
                cx, cy, bw, bh = out[:4, at[c]] / scale
                boxes[c] = (cx - bw / 2 + region[0], cy - bh / 2 + region[1], cx + bw / 2 + region[0], cy + bh / 2 + region[1])

    for size in FULL:
        run((0, 0, W, H), size)
    if (best >= TILE_IF_BELOW).sum() < 13:
        tw, th = W * 0.6, H * 0.6
        for x, y in ((0, 0), (W - tw, 0), (0, H - th), (W - tw, H - th)):
            run((x, y, tw, th), TILE)

    def iou(a, b):
        w = min(a[2], b[2]) - max(a[0], b[0])
        h = min(a[3], b[3]) - max(a[1], b[1])
        if w <= 0 or h <= 0:
            return 0
        i = w * h
        return i / ((a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - i)

    final = best.copy()
    shadowed = set()
    seen = sorted([i for i in range(52) if best[i] >= SHADOW and boxes[i]], key=lambda i: -best[i])
    for k, i in enumerate(seen):
        if any(iou(boxes[i], boxes[j]) > SAME_SPOT for j in seen[:k]):
            final[i] = min(final[i], SHADOW)
            shadowed.add(i)
    order = np.argsort(-final)
    cards = [NAMES[i] for i in order if final[i] >= PICK][:13]
    if 13 - len(cards) <= 2:
        cards += [NAMES[i] for i in order if FILL_SCORE <= final[i] < PICK and i not in shadowed][:13 - len(cards)]
    return cards


def versions(img):
    h, w = img.shape[:2]
    half = cv2.resize(img, (w // 2, h // 2), interpolation=cv2.INTER_AREA)
    yield "original", img
    yield "dim", (half * 0.55).astype(np.uint8)
    yield "small", cv2.resize(img, (w // 4, h // 4), interpolation=cv2.INTER_AREA)
    yield "blurry", cv2.GaussianBlur(half, (0, 0), 3)
    yield "sideways", cv2.rotate(half, cv2.ROTATE_90_CLOCKWISE)


def main():
    models = sys.argv[1:] or [str(REPO / "public/models/cards-gen3.onnx")]
    truth = json.loads((WORK / "real" / "truth.json").read_text())
    for model in models:
        session = ort.InferenceSession(model, providers=["CPUExecutionProvider"])
        right = total = perfect = wrong = 0
        lines = []
        for name, hand in truth.items():
            img = cv2.imread(str(WORK / "real" / name))
            for vname, v in versions(img):
                got = read(session, v)
                r = len(set(got) & set(hand))
                bad = sorted(set(got) - set(hand))
                right, total, wrong = right + r, total + 13, wrong + len(bad)
                perfect += r == 13
                lines.append(f"  {name} {vname}: {r}/13" + (f" wrong {' '.join(bad)}" if bad else ""))
        print(f"{Path(model).name}: {right}/{total} right, {wrong} wrong, {perfect} perfect hands")
        print("\n".join(lines))


if __name__ == "__main__":
    main()
