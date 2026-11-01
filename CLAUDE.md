# Spades Score (web)

Free installable web app (PWA) for keeping score in the family spades game. Web version of the iPhone app in
`~/Developer/SpadesScore`; keep the scoring rules in sync. Owner: Nick Forbes (not a developer — explain in
plain words, keep text large and buttons big, check every screen fits a 320px phone with no sideways scrolling).

## Stack
- Vite + React (plain JS), no UI library, no backend. The game is saved in the browser (`localStorage`) on
  each device, see `src/lib/store.js`.
- `src/lib/scoring.js`: all scoring (ported from SpadesCore). Tests in `test/` — run `npm test`.
- Screens: `NewGame.jsx` (setup), `App.jsx` (scores, hand list, rules sheet), `HandSheet.jsx` (bids, then books).

## Commands
- Run locally: `npm run dev` (http://localhost:5180)
- Build check: `npx vite build`
- Publish: hosted on Vercel like Sunday Table; pushing `main` to GitHub publishes. Get the owner's OK first.
