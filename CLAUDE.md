# Spades Score (web)

Free installable web app (PWA) for keeping score in the family spades game. Web version of the iPhone app in
`~/Developer/SpadesScore`; keep the scoring rules in sync. Owner: Nick Forbes (not a developer — explain in
plain words, keep text large and buttons big, check every screen fits a 320px phone with no sideways scrolling).

## Stack
- Vite + React (plain JS), no UI library. The scorekeeper's game is saved in the browser (`localStorage`),
  with an undo history of every change (`src/lib/store.js`, `commit(label, fn)`).
- `src/lib/scoring.js`: all scoring (ported from SpadesCore). `table.js`: seats (partners across:
  T1P1, T2P1, T1P2, T2P2 clockwise), dealer, book-by-book tracking. `cards.js`: card codes like "QH", "10S".
  Tests in `test/` — run `npm test`.
- Hand flow: New Hand → bids (stage 'bids') → tap who won each book (stage 'play') → Score Hand.
  `HandSheet.jsx` fixes bids/books by hand.

## Remote player
- One player can join from another phone ("remote mode", `RemoteApp.jsx`) with a 4-letter code or link
  (`?join=CODE`). The table's phone is the source of truth; it broadcasts the whole game; the remote sends
  `bid` / `play` messages; the table can `ping`. See `src/lib/room.js`.
- Link: Supabase Realtime broadcast (needs `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`; no tables).
  With them blank it falls back to BroadcastChannel, which links tabs in one browser — good for testing.
- Video: WebRTC (`src/lib/video.js`), signalling over the same room. STUN only unless `VITE_TURN_*` set.
- Card photo: read on the phone, free (`src/lib/cardVision.js`, onnxruntime-web, single thread in a
  worker). Model `public/models/cards-gen3.onnx` = sroot/lgd-cards-gen3 on Hugging Face (corner detector,
  52 classes, AGPL-3.0, details in `public/models/README.txt`). Because of AGPL the repo is public and
  the menu links to it. Tested only on drawn cards (about 8 of 13); the person fixes misses on the grid.

## Commands
- Run locally: `npm run dev` (http://localhost:5180)
- Build check: `npx vite build`
- Live site: https://spades-score-three.vercel.app (Vercel project `spades-score`, private repo
  nforbes35/spades-score). Pushing `main` publishes automatically; get the owner's OK first.
  Manual fallback: `npx vercel deploy --prod --yes`.
