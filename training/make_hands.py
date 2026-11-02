"""Make practice photos: random hands of the family's own cards, labelled automatically.

Deals 13 of the cut-out cards (WORK/cards) into a fan, a straight row or a loose spread over a
made-up background, with the lighting, blur, glare, fingers and angles of real phone photos. Every
card corner index that is still visible gets a label, so the reader learns exactly these cards.

    .venv/bin/python training/make_hands.py --train 3000 --val 300
"""
import argparse
import json
import random
import shutil
from multiprocessing import Pool, cpu_count

import cv2
import numpy as np

from common import WORK, CLASS, NAMES, CARD_W, CARD_H

MIN_VISIBLE = 0.5  # share of a corner index that must show for it to be labelled


def background(w: int, h: int) -> np.ndarray:
    kind = random.choice(["felt", "wood", "couch", "dark", "light", "table"])
    base = {
        "felt": (40, 110, 40), "wood": (60, 110, 160), "couch": (90, 90, 95),
        "dark": (30, 30, 35), "light": (200, 205, 210), "table": (120, 140, 150),
    }[kind]
    base = np.array(base, np.float32) * random.uniform(0.6, 1.3)
    img = np.ones((h, w, 3), np.float32) * base
    # Soft blotches and grain.
    for scale in (8, 32, 128):
        noise = cv2.resize(np.random.rand(max(2, h // scale), max(2, w // scale)).astype(np.float32), (w, h))
        img *= (0.85 + 0.3 * noise)[..., None]
    if kind == "wood":
        stripes = (np.sin(np.linspace(0, random.uniform(20, 60), h))[:, None] * 0.12 + 1)
        img *= stripes[..., None]
    grad = np.linspace(random.uniform(0.6, 1.0), random.uniform(0.9, 1.3), h)[:, None, None]
    img *= grad
    # A few random shapes for clutter (furniture, rugs).
    for _ in range(random.randint(0, 4)):
        color = np.random.rand(3) * 220
        x, y = random.randint(0, w), random.randint(0, h)
        cv2.rectangle(img, (x, y), (x + random.randint(40, w // 2), y + random.randint(40, h // 3)), color.tolist(), -1)
    return np.clip(img, 0, 255).astype(np.uint8)


def card_affine(cx: float, cy: float, scale: float, angle: float, pivot=(0.5, 0.5)) -> np.ndarray:
    """2x3 matrix placing a CARD_W x CARD_H card: its pivot point goes to (cx, cy), rotated by angle."""
    px, py = pivot[0] * CARD_W, pivot[1] * CARD_H
    m = cv2.getRotationMatrix2D((px, py), angle, scale)
    m[0, 2] += cx - px
    m[1, 2] += cy - py
    return m


def layout(n: int, w: int, h: int) -> list[np.ndarray]:
    kind = random.choices(["fan", "row", "spread"], weights=[6, 2, 2])[0]
    card_h = h * random.uniform(0.28, 0.55)
    scale = card_h / CARD_H
    mats = []
    if kind == "fan":
        # Held in one hand: cards pivot near the bottom-left corner where the thumb is, each one a little
        # further round, so every top-left corner index shows (like the family's photos).
        spread = random.uniform(55, 110)
        cx = w * random.uniform(0.3, 0.6)
        cy = h * random.uniform(0.6, 0.85)
        tilt = random.uniform(-25, 25)
        pivot = (random.uniform(0.15, 0.4), random.uniform(0.85, 0.97))
        for i in range(n):
            a = tilt - spread / 2 + spread * i / (n - 1)
            mats.append(card_affine(cx, cy, scale, -a, pivot=pivot))
    elif kind == "row":
        step = card_h * random.uniform(0.18, 0.32)
        x0 = w / 2 - step * (n - 1) / 2
        y = h * random.uniform(0.35, 0.65)
        tilt = random.uniform(-8, 8)
        for i in range(n):
            mats.append(card_affine(x0 + i * step, y + random.uniform(-4, 4), scale, tilt + random.uniform(-2, 2)))
    else:
        for _ in range(n):
            mats.append(card_affine(random.uniform(0.15, 0.85) * w, random.uniform(0.15, 0.85) * h,
                                    scale * random.uniform(0.85, 1.0), random.uniform(-180, 180)))
    return mats


def corner_boxes(index: list[float]) -> list[np.ndarray]:
    """Both corner indexes of a card as polygons in card pixels (top-left, and bottom-right turned)."""
    x0, y0, x1, y1 = index
    tl = np.array([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]) * [CARD_W, CARD_H]
    br = np.array([[1 - x1, 1 - y1], [1 - x0, 1 - y1], [1 - x0, 1 - y0], [1 - x1, 1 - y0]]) * [CARD_W, CARD_H]
    return [tl, br]


def card_mask() -> np.ndarray:
    m = np.zeros((CARD_H, CARD_W), np.uint8)
    r = 28
    cv2.rectangle(m, (r, 0), (CARD_W - r, CARD_H), 255, -1)
    cv2.rectangle(m, (0, r), (CARD_W, CARD_H - r), 255, -1)
    for cx, cy in ((r, r), (CARD_W - r, r), (r, CARD_H - r), (CARD_W - r, CARD_H - r)):
        cv2.circle(m, (cx, cy), r, 255, -1)
    return m


MASK = card_mask()


def make_one(cards: dict, index: dict, w: int, h: int):
    img = background(w, h).astype(np.float32)
    owner = np.full((h, w), -1, np.int32)
    codes = random.sample(list(cards), 13)
    if random.random() < 0.6:  # people usually sort their hand
        codes.sort(key=lambda c: ("DCHS".index(c[-1]), "234567891JQKA".index(c[0])))  # "1" = the 10
    mats = layout(len(codes), w, h)
    polys = []
    for i, (code, m) in enumerate(zip(codes, mats)):
        face = cards[code].astype(np.float32) * random.uniform(0.85, 1.08)
        warped = cv2.warpAffine(face, m, (w, h), flags=cv2.INTER_LINEAR)
        mask = cv2.warpAffine(MASK, m, (w, h)) > 127
        # Soft shadow under the card.
        shadow = cv2.GaussianBlur(mask.astype(np.float32), (0, 0), 6)
        shift = np.float32([[1, 0, random.uniform(2, 8)], [0, 1, random.uniform(2, 8)]])
        shadow = cv2.warpAffine(shadow, shift, (w, h))
        img *= (1 - 0.35 * shadow)[..., None]
        img[mask] = warped[mask]
        owner[mask] = i
        for poly in corner_boxes(index[code]):
            pts = cv2.transform(poly[None].astype(np.float32), m)[0]
            polys.append((i, code, pts))
    # Fingers or a thumb over part of the hand.
    if random.random() < 0.5:
        skin = np.array([random.uniform(90, 170), random.uniform(120, 190), random.uniform(170, 235)], np.float32)
        centre = (int(w * random.uniform(0.2, 0.7)), int(h * random.uniform(0.55, 0.95)))
        axes = (int(w * random.uniform(0.06, 0.14)), int(h * random.uniform(0.12, 0.25)))
        thumb = np.zeros((h, w), np.uint8)
        cv2.ellipse(thumb, centre, axes, random.uniform(-60, 60), 0, 360, 255, -1)
        sel = thumb > 0
        img[sel] = skin * random.uniform(0.8, 1.1)
        owner[sel] = -2
    if random.random() < 0.3:  # a slight tilt of the phone; labels move with the picture
        d = 0.06 * min(w, h)
        src = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
        tilt = cv2.getPerspectiveTransform(src, src + np.random.uniform(-d, d, (4, 2)).astype(np.float32))
        img = cv2.warpPerspective(img, tilt, (w, h), borderMode=cv2.BORDER_REFLECT)
        owner = cv2.warpPerspective(owner.astype(np.float32), tilt, (w, h), flags=cv2.INTER_NEAREST,
                                    borderValue=-3).astype(np.int32)
        polys = [(i, code, cv2.perspectiveTransform(pts[None].astype(np.float32), tilt)[0]) for i, code, pts in polys]
    labels = []
    for i, code, pts in polys:
        x0, y0 = np.floor(pts.min(0)).astype(int)
        x1, y1 = np.ceil(pts.max(0)).astype(int)
        if x0 < 0 or y0 < 0 or x1 >= w or y1 >= h or x1 - x0 < 6 or y1 - y0 < 6:
            continue
        poly_mask = np.zeros((y1 - y0 + 1, x1 - x0 + 1), np.uint8)
        cv2.fillPoly(poly_mask, [np.round(pts - [x0, y0]).astype(np.int32)], 1)
        inside = poly_mask > 0
        visible = (owner[y0:y1 + 1, x0:x1 + 1][inside] == i).mean()
        if visible >= MIN_VISIBLE:
            labels.append((CLASS[code], (x0 + x1) / 2 / w, (y0 + y1) / 2 / h, (x1 - x0) / w, (y1 - y0) / h))
    img = finish(img)
    return img, labels


def finish(img: np.ndarray) -> np.ndarray:
    """Phone-photo look: lighting, colour of the bulb, glare, blur, noise, compression."""
    h, w = img.shape[:2]
    img *= random.uniform(0.45, 1.25)
    tint = np.array([random.uniform(0.75, 1.05), random.uniform(0.9, 1.05), random.uniform(0.95, 1.25)], np.float32)
    img *= tint
    if random.random() < 0.35:  # lamp glare
        glare = np.zeros((h, w), np.float32)
        cv2.circle(glare, (random.randint(0, w), random.randint(0, h)), random.randint(w // 20, w // 6), 1, -1)
        glare = cv2.GaussianBlur(glare, (0, 0), w / 30)
        img += glare[..., None] * random.uniform(60, 160)
    if random.random() < 0.4:  # vignette
        yy, xx = np.mgrid[0:h, 0:w]
        d = np.sqrt(((xx - w / 2) / w) ** 2 + ((yy - h / 2) / h) ** 2)
        img *= (1 - d * random.uniform(0.3, 0.8))[..., None]
    img = np.clip(img, 0, 255).astype(np.uint8)
    if random.random() < 0.5:
        k = random.choice([3, 5, 7])
        img = cv2.GaussianBlur(img, (k, k), 0)
    if random.random() < 0.5:
        img = np.clip(img + np.random.normal(0, random.uniform(2, 9), img.shape), 0, 255).astype(np.uint8)
    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, random.randint(55, 95)])
    return cv2.imdecode(buf, cv2.IMREAD_COLOR)


DECK = {}


def load_deck():
    src = WORK / "cards"
    DECK["index"] = json.loads((src / "index.json").read_text())
    DECK["cards"] = {code: cv2.imread(str(src / f"{code}.png")) for code in DECK["index"]}


def make_and_save(job):
    split, n, seed = job
    random.seed(seed)
    np.random.seed(seed % 2**32)
    w, h = random.choice([(960, 1280), (1280, 960), (1024, 1024)])
    img, labels = make_one(DECK["cards"], DECK["index"], w, h)
    out = WORK / "synth"
    cv2.imwrite(str(out / "images" / split / f"{n:05d}.jpg"), img)
    (out / "labels" / split / f"{n:05d}.txt").write_text(
        "".join(f"{c} {x:.6f} {y:.6f} {bw:.6f} {bh:.6f}\n" for c, x, y, bw, bh in labels))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--train", type=int, default=3000)
    ap.add_argument("--val", type=int, default=300)
    ap.add_argument("--seed", type=int, default=1)
    args = ap.parse_args()

    out = WORK / "synth"
    shutil.rmtree(out, ignore_errors=True)
    jobs = []
    for split, count in (("train", args.train), ("val", args.val)):
        (out / "images" / split).mkdir(parents=True)
        (out / "labels" / split).mkdir(parents=True)
        jobs += [(split, n, args.seed * 1_000_003 + len(jobs) + n) for n in range(count)]
    # Spread the work over the Mac's cores; each photo gets its own seed so runs repeat exactly.
    with Pool(max(1, cpu_count() - 1), initializer=load_deck) as pool:
        for done, _ in enumerate(pool.imap_unordered(make_and_save, jobs, chunksize=8), 1):
            if done % 500 == 0:
                print(f"{done}/{len(jobs)}", flush=True)
    (out / "data.yaml").write_text(
        f"path: {out}\ntrain: images/train\nval: images/val\nnames:\n" + "".join(f"  {i}: {n}\n" for i, n in enumerate(NAMES)))
    print(f"Done: {out}")


if __name__ == "__main__":
    main()
