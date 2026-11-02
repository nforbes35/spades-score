"""For testing the pipeline only: draws stand-in "deck photos" (13 plain cards per suit on a dark table)
into WORK/test-deck-photos, so extract -> make_hands -> train -> evaluate can be run before the real
deck is photographed. A reader trained on these would be useless for real cards.

    CARD_WORK=~/Developer/spades-card-training/test .venv/bin/python training/make_test_deck.py
"""
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from common import WORK, RANKS

SYMBOL = {"D": "♦", "C": "♣", "H": "♥", "S": "♠"}
FILES = {"D": "diamonds", "C": "clubs", "H": "hearts", "S": "spades"}
FONT = "/System/Library/Fonts/Supplemental/Arial Unicode.ttf"


def card(rank, suit, w=250, h=350):
    img = Image.new("RGB", (w, h), (250, 248, 240))
    d = ImageDraw.Draw(img)
    color = (200, 20, 30) if suit in "DH" else (15, 15, 15)
    big = ImageFont.truetype(FONT, 46)
    sym = ImageFont.truetype(FONT, 38)
    d.text((14, 8), rank, font=big, fill=color)
    d.text((16, 60), SYMBOL[suit], font=sym, fill=color)
    d.text((w // 2 - 40, h // 2 - 60), SYMBOL[suit], font=ImageFont.truetype(FONT, 110), fill=color)
    corner = img.crop((0, 0, 70, 115)).rotate(180)
    img.paste(corner, (w - 70, h - 115))
    return img


def main():
    out = WORK / "deck-photos"
    out.mkdir(parents=True, exist_ok=True)
    for suit, name in FILES.items():
        table = Image.new("RGB", (1600, 1300), (35, 40, 45))
        for i, rank in enumerate(RANKS):
            row, col = divmod(i, 5)
            c = card(rank, suit).rotate(random.uniform(-4, 4), expand=True, fillcolor=(35, 40, 45))
            table.paste(c, (60 + col * 300, 40 + row * 420))
        noise = np.random.normal(0, 4, (1300, 1600, 3))
        Image.fromarray(np.clip(np.array(table) + noise, 0, 255).astype(np.uint8)).save(out / f"{name}.jpg", quality=92)
    print(f"Wrote stand-in deck photos to {out}")


if __name__ == "__main__":
    main()
