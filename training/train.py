"""Retrain the card reader on the practice photos, then export it for the app.

Starts from the current reader (WORK/base/best.pt, sroot/lgd-cards-gen3) so it keeps what it knows,
learns the family's deck from WORK/synth, and writes WORK/runs/<name>/cards-<name>.onnx for the app.
Uses the Mac's graphics chip when it can.

    .venv/bin/python training/train.py --name maverick --epochs 25
"""
import argparse
import shutil

import torch
from ultralytics import YOLO

from common import WORK


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--name", default="deck")
    ap.add_argument("--epochs", type=int, default=25)
    ap.add_argument("--batch", type=int, default=16)
    ap.add_argument("--fraction", type=float, default=1.0, help="share of practice photos to use (quick tests)")
    args = ap.parse_args()

    device = "mps" if torch.backends.mps.is_available() else "cpu"
    model = YOLO(str(WORK / "base" / "best.pt"))
    model.train(
        data=str(WORK / "synth" / "data.yaml"),
        epochs=args.epochs,
        imgsz=640,
        batch=args.batch,
        device=device,
        project=str(WORK / "runs"),
        name=args.name,
        exist_ok=True,
        fraction=args.fraction,
        # Gentle fine-tuning: small steps, the early layers (general shapes and edges) stay as they are.
        lr0=0.002,
        warmup_epochs=1,
        freeze=10,
        # Card corners must not be mirrored (a mirrored 6 or 9 is a different card).
        fliplr=0.0,
        degrees=10,
        mosaic=0.5,
        close_mosaic=5,
        plots=False,
        workers=4,
        patience=8,
        verbose=False,
    )
    best = WORK / "runs" / args.name / "weights" / "best.pt"
    onnx = YOLO(str(best)).export(format="onnx", imgsz=640, dynamic=True, simplify=True, opset=17)
    target = WORK / "runs" / args.name / f"cards-{args.name}.onnx"
    shutil.move(onnx, target)
    print(f"Exported {target}")


if __name__ == "__main__":
    main()
