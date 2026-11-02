# Training the card reader on your own deck

Free, runs on the Mac. Starts from the open model the app uses (sroot/lgd-cards-gen3, AGPL-3.0) and
teaches it one particular deck from four photos of that deck.

Work files live in `~/Developer/spades-card-training` (override with `CARD_WORK=...`):

| Folder | What |
|---|---|
| `.venv/` | Python 3.12 with Ultralytics, PyTorch, ONNX (about 1.1 GB) |
| `base/best.pt` | starting weights from Hugging Face (SHA-256 3513b77a…1004) |
| `deck-photos/` | your 4 deck photos: `diamonds`, `clubs`, `hearts`, `spades` (.jpg or .heic) |
| `cards/` | each card cut out and flattened, plus `index.json` (corner positions) |
| `synth/` | generated practice photos with labels |
| `real/` | real hand photos + `truth.json`, used only for scoring |
| `runs/<name>/` | training output, including `cards-<name>.onnx` |

## Steps

```bash
cd ~/Developer/spades-score-web
PY=~/Developer/spades-card-training/.venv/bin/python
$PY training/extract_cards.py            # check contact-sheet.jpg: all 52 named right?
$PY training/make_hands.py --train 3000 --val 300
$PY training/train.py --name maverick --epochs 25     # about an hour on an M4
$PY training/evaluate.py public/models/cards-gen3.onnx ~/Developer/spades-card-training/runs/maverick/cards-maverick.onnx
```

Only switch the app over if the new reader scores better on the real photos: copy the `.onnx` into
`public/models/`, point `MODEL_URL` in `src/lib/cardVision.js` at it, and update `public/models/README.txt`
(the new weights are still AGPL-3.0, a fine-tune of the same model).

## Deck photos

One suit per photo. The 13 cards face up and upright on a plain dark surface, not touching, in order
2, 3, … 10, J, Q, K, A, reading left to right then top to bottom. Shoot from straight above with the whole
layout in frame, in even light without glare.

`make_test_deck.py` draws stand-in deck photos for testing the scripts without a real deck.
