"""Shared settings for training the card reader on the family's own deck.

Everything big (photos, generated hands, training runs) lives in WORK, outside the app's repo.
"""
from pathlib import Path
import os

WORK = Path(os.environ.get("CARD_WORK", Path.home() / "Developer" / "spades-card-training"))
REPO = Path(__file__).resolve().parent.parent

RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"]
SUITS = ["D", "C", "H", "S"]
# The reader's class order (model.classes.json of sroot/lgd-cards-gen3). Must not change.
NAMES = ["10C", "10D", "10H", "10S", "2C", "2D", "2H", "2S", "3C", "3D", "3H", "3S", "4C", "4D", "4H", "4S",
         "5C", "5D", "5H", "5S", "6C", "6D", "6H", "6S", "7C", "7D", "7H", "7S", "8C", "8D", "8H", "8S",
         "9C", "9D", "9H", "9S", "AC", "AD", "AH", "AS", "JC", "JD", "JH", "JS", "KC", "KD", "KH", "KS",
         "QC", "QD", "QH", "QS"]
CLASS = {name: i for i, name in enumerate(NAMES)}

# A flattened card is drawn at this size (poker cards are 2.5 x 3.5 inches).
CARD_W, CARD_H = 500, 700
