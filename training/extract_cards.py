"""Cut each card out of the deck photos.

Take 4 photos, one per suit: the 13 cards of that suit face up on a plain dark surface, not touching,
in order 2, 3, ... 10, J, Q, K, A, reading left to right and top to bottom (any number of rows).
Name them diamonds.jpg, clubs.jpg, hearts.jpg, spades.jpg (HEIC is fine too) and put them in
WORK/deck-photos. This writes WORK/cards/<code>.png (each card flattened to 500x700) plus
WORK/cards/index.json (where the corner index sits) and a contact sheet to check by eye.

    .venv/bin/python training/extract_cards.py [--descending clubs,spades]

--descending lists suits laid out A, K, Q ... 2 instead. Afterwards the current reader checks each
cut-out card is the card it was named as, so a mix-up can't slip into training.
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np

from common import WORK, RANKS, NAMES, REPO, CARD_W, CARD_H

SUIT_FILES = {"D": "diamonds", "C": "clubs", "H": "hearts", "S": "spades"}


def load(path: Path) -> np.ndarray:
    if path.suffix.lower() in (".heic", ".heif"):
        jpg = path.with_suffix(".converted.jpg")
        subprocess.run(["sips", "-s", "format", "jpeg", str(path), "--out", str(jpg)], check=True, capture_output=True)
        path = jpg
    img = cv2.imread(str(path))
    if img is None:
        sys.exit(f"Couldn't open {path}")
    return img


def find_photo(stem: str) -> Path:
    for ext in (".jpg", ".jpeg", ".png", ".heic", ".JPG", ".JPEG", ".PNG", ".HEIC"):
        p = WORK / "deck-photos" / f"{stem}{ext}"
        if p.exists():
            return p
    sys.exit(f"Missing {WORK / 'deck-photos' / stem}.jpg")


def order_corners(pts: np.ndarray) -> np.ndarray:
    """Top-left, top-right, bottom-right, bottom-left."""
    s = pts.sum(1)
    d = np.diff(pts, axis=1).ravel()
    return np.array([pts[np.argmin(s)], pts[np.argmin(d)], pts[np.argmax(s)], pts[np.argmax(d)]], dtype=np.float32)


def find_cards(img: np.ndarray) -> list[np.ndarray]:
    """Bright card-shaped quadrilaterals on a darker background."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (7, 7), 0)
    _, mask = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    area_min = img.shape[0] * img.shape[1] / 400
    quads = []
    for c in contours:
        if cv2.contourArea(c) < area_min:
            continue
        rect = cv2.minAreaRect(c)
        (w, h) = rect[1]
        ratio = max(w, h) / max(1, min(w, h))
        if not 1.2 < ratio < 1.65:
            continue
        quads.append(order_corners(cv2.boxPoints(rect)))
    return quads


def flatten(img: np.ndarray, quad: np.ndarray) -> np.ndarray:
    tl, tr, br, bl = quad
    if np.linalg.norm(tr - tl) > np.linalg.norm(bl - tl):  # card lying sideways: turn it upright
        quad = np.array([tr, br, bl, tl], dtype=np.float32)
    dst = np.array([[0, 0], [CARD_W, 0], [CARD_W, CARD_H], [0, CARD_H]], dtype=np.float32)
    return cv2.warpPerspective(img, cv2.getPerspectiveTransform(quad, dst), (CARD_W, CARD_H))


def reading_order(quads: list[np.ndarray]) -> list[np.ndarray]:
    """Sort into rows (by centre height), then left to right within a row."""
    centres = [q.mean(0) for q in quads]
    height = np.median([np.linalg.norm(q[3] - q[0]) for q in quads])
    rows: list[list[int]] = []
    for i in sorted(range(len(quads)), key=lambda i: centres[i][1]):
        if rows and abs(centres[i][1] - centres[rows[-1][0]][1]) < height * 0.5:
            rows[-1].append(i)
        else:
            rows.append([i])
    return [quads[i] for row in rows for i in sorted(row, key=lambda i: centres[i][0])]


def index_box(card: np.ndarray) -> list[float]:
    """Where the top-left rank+suit index is, as fractions [x0, y0, x1, y1] of the card.

    Only measured on 2s, 3s and aces (see main): on other cards a big suit symbol or the picture frame
    sits right next to the index and would be swept in.
    """
    region = card[: int(CARD_H * 0.32), : int(CARD_W * 0.24)]
    hsv = cv2.cvtColor(region, cv2.COLOR_BGR2HSV)
    ink = ((hsv[..., 2] < 110) | ((hsv[..., 1] > 90) & (hsv[..., 2] < 230))).astype(np.uint8)
    # Ignore the card's own edge.
    ink[:6, :] = 0
    ink[:, :6] = 0
    ys, xs = np.nonzero(ink)
    if len(xs) < 30:
        return [0.03, 0.03, 0.18, 0.27]  # typical poker deck
    x0, x1 = np.percentile(xs, [1, 99])
    y0, y1 = np.percentile(ys, [1, 99])
    pad = 6
    return [max(0, x0 - pad) / CARD_W, max(0, y0 - pad) / CARD_H, (x1 + pad) / CARD_W, (y1 + pad) / CARD_H]


def check_with_reader(out: Path, codes: list[str]) -> list[str]:
    """Ask the current reader what each flattened card is; return the ones it disagrees about."""
    import onnxruntime as ort
    session = ort.InferenceSession(str(REPO / "public/models/cards-gen3.onnx"), providers=["CPUExecutionProvider"])
    problems = []
    for code in codes:
        card = cv2.imread(str(out / f"{code}.png"))
        # Shown at about the size a card has in a photo of a hand (the reader expects that scale).
        canvas = np.full((640, 640, 3), 70, np.uint8)
        small = cv2.resize(card, (CARD_W * 240 // CARD_H, 240), interpolation=cv2.INTER_AREA)
        canvas[200:440, 240:240 + small.shape[1]] = small
        x = cv2.cvtColor(canvas, cv2.COLOR_BGR2RGB).astype(np.float32).transpose(2, 0, 1)[None] / 255
        scores = session.run(None, {session.get_inputs()[0].name: x})[0][0][4:].max(1)
        best = NAMES[int(scores.argmax())]
        if best != code:
            problems.append(f"{code} looks like {best} ({scores.max():.2f}; {code} {scores[NAMES.index(code)]:.2f})")
    return problems


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--descending", default="", help="suits laid out A down to 2, e.g. clubs,spades")
    args = ap.parse_args()
    descending = {s.strip() for s in args.descending.split(",") if s.strip()}
    out = WORK / "cards"
    out.mkdir(parents=True, exist_ok=True)
    boxes = {}
    tiles = []
    for suit, stem in SUIT_FILES.items():
        img = load(find_photo(stem))
        quads = find_cards(img)
        if len(quads) != 13:
            sys.exit(f"{stem}: found {len(quads)} cards, expected 13. Spread them out on a dark surface and retake.")
        ranks = RANKS[::-1] if stem in descending else RANKS
        for rank, quad in zip(ranks, reading_order(quads)):
            card = flatten(img, quad)
            code = rank + suit
            cv2.imwrite(str(out / f"{code}.png"), card)
            boxes[code] = index_box(card)
            thumb = cv2.resize(card, (100, 140))
            cv2.putText(thumb, code, (4, 136), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 160, 0), 2)
            tiles.append(thumb)
        print(f"{stem}: 13 cards")
    # A deck prints every index in the same place. Measure it on the cards with nothing beside the
    # corner (2, 3, A) and use the typical box for all 52.
    clear = [b for code, b in boxes.items() if code[:-1] in ("2", "3", "A")]
    shared = np.median(np.array(clear), axis=0).round(4).tolist()
    print(f"Corner index box (share of card): x {shared[0]:.2f}-{shared[2]:.2f}, y {shared[1]:.2f}-{shared[3]:.2f}")
    boxes = {code: shared for code in boxes}
    (out / "index.json").write_text(json.dumps(boxes, indent=1))
    rows = [np.hstack(tiles[i:i + 13]) for i in range(0, 52, 13)]
    cv2.imwrite(str(WORK / "contact-sheet.jpg"), np.vstack(rows))
    print(f"Wrote 52 cards to {out} and a contact sheet to {WORK / 'contact-sheet.jpg'}")
    problems = check_with_reader(out, list(boxes))
    if problems:
        print("The current reader disagrees about:\n  " + "\n  ".join(problems))
    else:
        print("The current reader agrees with all 52 names.")


if __name__ == "__main__":
    main()
