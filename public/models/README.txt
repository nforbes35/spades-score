cards-gen3.onnx
===============
Playing-card corner detector used by "Scan cards" (runs on the phone; photos are never uploaded).

Source:   https://huggingface.co/sroot/lgd-cards-gen3 (file model.onnx)
SHA-256:  8b767cdfed2c8e954a9134013ac3d2f2c53be048768d559675be01277a8a8fd1
License:  AGPL-3.0 (a fine-tune of Ultralytics YOLO11). The full source of this app is public at
          https://github.com/nforbes35/spades-score as AGPL section 13 requires.

cards-maverick.onnx
===================
The same reader fine-tuned on the family's Maverick deck (training/ in this repo: 4 photos of the deck,
3,000 generated practice hands, 25 rounds on a Mac). On the owner's two real hand photos in 5 versions each:
130/130 cards right (the original gets 125/130). Scan cards uses it by default; "Another deck" uses the
original.

SHA-256:  a29e2c9d2c85a6cba0a5500db3cd61e5308997b0a0fdb383ed18743ff96d7216
License:  AGPL-3.0 (a fine-tune of the model above). Training code: training/ in this repository.
