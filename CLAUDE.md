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
- Cards sort diamonds, clubs, hearts, spades, low to high (owner's request). The remote player's hand is
  a fanned, docked hand (`FannedHand` in components.jsx).
- Hand flow: New Hand → bids (stage 'bids') → tap who won each book (stage 'play') → Score Hand.
  `HandSheet.jsx` fixes bids/books by hand.

## Two modes
- **At the table** (manual): the scorekeeper's phone keeps score of a real card game (everything below
  "Remote play"). **Play online**: the app is the card table (`OnlineApp.jsx`).

## Online mode
- Profiles & icons (`src/lib/profile.js`, `src/Avatar.jsx`): name + avatar string in tab-first storage
  (`spades-online-name`, `spades-avatar`). Avatar = `e:<backdrop>:<emoji>` or `p:data:image/jpeg…` (photo cropped
  to 120px, ~5 KB) or null (initials). Bots get an SVG robot from their name. `useAvatars` swaps icons by device id
  (`avatar` messages: on peer join, reply on first hello, resend every 20 s). `o-sit` carries the name.
- Decks (`src/lib/decks.js`, `DeckPicker.jsx`): per-device choice (`spades-deck`), applied as CSS vars on <html>
  (`--deck-back`, `--deck-table`, `--deck-emblem`, `data-deck`, `data-emblem`). Classic faces = cropped public-domain
  portraits in `public/faces/*.webp`; 'cartoon' = drawn `CourtPanel`. Photos in `public/decks/` (credits there).
  Team decks are colours only: no team names/logos (trademarks).
- Online companion TV: role 'otv' (link `?join=CODE&as=otv`, or Join a game → "Show the table on this TV"). It's
  `OnlineRoom` with `tv`: own id key (`spades-tv-id`, so it's never mistaken for a player), never seated, call
  `receiveOnly`, the phone layout zoomed to fit (`useTvFit`, laid out for 720px high). In call.js a phone with an
  'otv' in the same place keeps mic/camera on and its speaker off; the TV plays everyone's sound.
- Online table layouts: `<html data-layout>` from components.jsx `useTableLayout` — 'wide' (a phone sideways, or a
  laptop/desktop/tablet sideways: table across, hand strip with bid buttons beside it) or 'tall'. On big screens
  the wide layout is drawn ~900 wide and zoomed up to fill the window (FannedHand divides pointer moves by the zoom).
- Hand view (top bar's hand button, players only; never remembered, the table view comes first): `HandView` shows
  only your cards big (FannedHand `big`; two overlapping rows on an upright phone), the bid pad, status, scores and
  chat, for playing with the table on a TV. `handArea` / `actionArea` are shared with the table view's hand strip.
- Ways to play a card: hold a card (FannedHand `onHold`, 480 ms) → Slam / The Papi Flip / Spin / Toss. The style
  rides with the card (`playCard(..., style)` → trick entries); a book ending in a Papi Flip stays up longer
  (`showMs`) and bots wait for a flip. Emojis/gifts: tap a picture → `ReactSheet`; `o-react` is broadcast to the
  room and each screen animates it (`ReactionsLayer`, positions from `[data-seat]`); one per second per device.
- The Papi Flip mini game (online.js `playCardAsHost`, `papiPick`, `papiGuess`, `papiFinish`; `PapiGame` panel):
  once a game, on a seated person named Papi's `table.papi.at`-th card (not the last card of a book, only while
  both teams are > 25 from winning), his card lands face down ('papi-wait'); he picks 1 of 2 numbers, his partner
  and a random opponent guess (+/-25 into `hand.bonus`, counted at once by scoring.js `history`), then it flips
  ('papi-now'). publicTable hides the pick/guesses until the reveal; the host answers for bots/no-shows (30 s).
- Rejoining: useRoom reconnects by itself (error/offline retry, back online, back to the app after 8 s away).
  Leaving mid-game keeps the seat (standIn: the computer plays). A device that says o-hello mid-game with the
  name of an away seat gets that seat (another browser/phone, e.g. iPhone home-screen app vs Safari). Home shows
  "Rejoin game" from `spades-last-online` for a day. ConnectionBanner shows when the room or host is lost.
- Between hands: the last book shows TRICK_SHOW_MS, the score NEXT_HAND_MS (5 s), then the host deals. Each deal
  plays `DealAnimation` + `dealSound` (fx.js: public/sounds/deal.m4a, built from CC0 Kenney card-slide recordings; the first tap anywhere unlocks sound); `round.dealtAt` makes the first bid and bid timer wait DEAL_MS.
- Seasons & holidays (`src/lib/seasons.js`): photo themes like the Sunday Table project (same Unsplash photos, saved as
  `public/decks/season-*.webp`). The default deck 'seasonal' follows the date (`seasonFor`, tested in test/seasons.test.js);
  themes also set `--felt-*`, `--deck-home` + `data-home-photo` (home screen, lobby header, online room). KJV verses.
- Bid timer: `settings.bidTimer` (seconds, 0 = off; lobby offers 15–90). Host auto-bids (botBid) after time + 1.5 s grace;
  each device counts down locally from when it sees the turn change (`useCountdown`), so no clock sync needed.
- Cards (`PlayingCard` in components.jsx) are Spades Masters style: big index top-left, big suit lower right,
  SVG suit paths (no font glyphs), drawn character portraits on J/Q/K; `CardBack` for face-down hands.
- Start screen → Play online makes a game code; the host's device runs the game, others join with
  `?join=CODE&as=online` (or the code; `JoinAs` sees role `ohost` and goes straight in).
- Engine `src/lib/online.js` (pure, tested in `test/online.test.js`): `startGame`, `deal`, `placeBid`, `legalCards`
  (follow suit; no leading spades until broken), `playCard`, `trickWinner`. The scoring side is the same `game`
  object as manual mode, so scoreboards/history/TV view are shared. Computer players: `src/lib/bots.js`
  (sim: teams make their bid ~94%).
- Messages: players → host `o-hello`, `o-sit`, `o-stand`, `o-bid`, `o-play`; host → `o-table` (public: no
  hands, just counts) and per player `o-hand`, encrypted for that device (`src/lib/secret.js`, ECDH + AES-GCM;
  public keys ride in the heartbeat). Moves are resent until the table shows them; the host ignores repeats
  (`alreadyPlayed`/`alreadyBid`) and re-sends the table every 5 s.
- Host keeps the table in localStorage (`spades-online-table-CODE`) so a reload resumes. Device ids are kept
  (`spades-device-id`, per tab first) so a reload rejoins the same seat; the host can let the computer stand in
  for someone who dropped out. After a game: play again (same seats) or back to the lobby to change things.

## Stats
- `src/lib/stats.js`: every game (both modes) is saved to `spades-game-log` as scored hands come in
  (`recordGame`, finished once someone wins); `computeStats` gives wins/losses/win %, nil & blind nil made,
  bids, books, streaks, partners, rivals. People are matched by name (case/space-insensitive); computer
  players are kept as partners but not ranked. Devices in any game room swap logs (`useStatsSync`,
  `log-have`/`log-games`), so stats fill in on every phone. UI: `Stats.jsx` (home, menus, lobby, game over).

## Remote play, video and TV
- Devices in a game room (`src/lib/room.js`): the table's phone ("host"), remote players ("player", one per
  seat in `game.remote.seats`), video guests ("guest": extra faces at the table, family at home), TV views
  ("tv"), and "lobby" while choosing. Each sends a heartbeat with who it is; messages go to all or `to` one.
  The host sends each device its own copy of the game (`gameFor`): a player gets only their own cards.
- Links: `?join=CODE&seat=3` (player), `&as=guest`, `&as=tv`, or just `?join=CODE` to choose (`JoinAs.jsx`).
- Card displays (`CardDisplayApp.jsx`, `?join=CODE&as=card&seat=3`): a spare device laid in a remote player's
  spot shows the card they played full screen (real pip layouts) until the book is taken; tap to turn it.
- Hand data per remote seat: `live.hands[seat]`, `live.played[seat]`, tricks `{ winner, cards: {seat: card} }`.
  `normalizeGame` converts games saved with the old single `remote.seat`.
- Video (`src/lib/call.js`): every pair of devices in the call connects directly (WebRTC, perfect
  negotiation); signalling over the room. The host uses the rear camera (the table, big in the middle of
  the TV); others the front. `TvApp.jsx` is receive-only. iPhone web apps can't drive a separate AirPlay
  screen, so the TV view runs on a second device (smart-TV browser, laptop on HDMI, iPad mirrored).
- Feedback: `place.js` fingerprints each device's public address (STUN, hashed with the game code). Per
  place one device handles sound (host > player > guest > tv, then first joined); the rest start muted.
- Link: Supabase Realtime broadcast (`VITE_SUPABASE_*`; no tables) or BroadcastChannel between tabs.
- Readers: `cards-maverick.onnx` (trained on the family's Maverick deck, default; 130/130 on the owner's photos)
  and `cards-gen3.onnx` ("Another deck"); chosen in the scanner (`READERS` in cardVision.js).
- Card photo: read on the phone, free (`src/lib/cardVision.js`, onnxruntime-web, single thread in a
  worker). Model `public/models/cards-gen3.onnx` = sroot/lgd-cards-gen3 on Hugging Face (corner detector,
  52 classes, AGPL-3.0, details in `public/models/README.txt`). Because of AGPL the repo is public and
  the menu links to it. Owner's real photo (hand-held fan, Maverick deck): 13/13 in ~1 s, also when dim,
  yellow-lit, blurry or small. The person fixes misses on the grid.
- Accuracy helpers: photos of the same hand add up (`mergeScores`); a card read on the same corner as a
  stronger card is turned down ("one corner, one card", fixed 6S-as-6C and 10H-as-10D on the owner's
  deck); missing 1-2 cards are filled in as outlined guesses (never a turned-down card). A corner close-up
  pass was tried and dropped: no gain, slower. Owner's 2 photos x 5 versions: 128/130, 0 wrong.
- Learning from fixes (`src/lib/learning.js`): every sent, checked 13-card hand stores (scores, real hand)
  in localStorage (last 150). Each card gets its own score adjustment (2 numbers, Newton fit, held toward
  zero so it takes ~2 agreeing hands), plus learned look-alike mix-ups shown as "check which one".
  Simulated quirky deck: fixes per hand drop by about half. The model file itself is never retrained.

## Commands
- Run locally: `npm run dev` (http://localhost:5180)
- Build check: `npx vite build`
- Live site: https://spades-score-three.vercel.app (Vercel project `spades-score`, private repo
  nforbes35/spades-score). Pushing `main` publishes automatically; get the owner's OK first.
  Manual fallback: `npx vercel deploy --prod --yes`.

## Languages (English / Spanish)
- `src/lib/i18n.js`: per-device language (`family-games-lang`; first time, the device's language). `tr('English wording', { blanks })`,
  `tx(...)` when a blank is JSX. English is the key; Spanish lives in `src/i18n/es-*.js`. `test/i18n.test.js` fails if a `tr('…')` has no Spanish.
- Call `tr` while drawing, never in a module-level constant (it wouldn't follow a change of language): keep the English in the constant and call `tr(item.name)` where it's shown.
- Text that travels to other devices (table state, room messages, push) must not be translated by the sender: send `langMsg('{a} wins', { a })` and show it with `tMsg(...)`. Saved data (game logs, undo labels already stored) stays as it was written.
- Player names, the app name "Family Games", "Papi" and game names (Spades, Mexican Train keeps "Tren mexicano") aren't people's words to change: names stay as typed.
- Spanish is Latin American, informal (tú): ficha = domino tile, carta = card, baza = book/trick, apuesta/apostar = bid, picas = spades, corazones, diamantes, tréboles, repartir = deal, mano = hand, pozo = boneyard, sala = room, anfitrión = host, equipo = team, marcador = score, computadora = computer player, puya = a line of trash talk.
- Trash talk: `TALK_LINES` has both wordings; a typed line is translated by each listener whose language differs (`src/lib/translate.js`, MyMemory, free, no key), with the original shown small. A recorded voice stays as recorded; only its caption is translated.

## Learn to play (`src/learn/`)
- `rules.js`: each game's rules and strategy as { en, es } side by side; keep them matching the engines. `Learn.jsx`: the screen (hub, Home, Dominoes home) and `RulesSheet` (in-game menus).
- `Practice.jsx`: a practice game run right on the device with the real engines, nothing sent or saved. `coach.js` (pure; test/learn.test.js plays whole games through it) picks a move and says why; `lessons.js` holds the opening lessons and the ones given the first time something happens. Lessons pause the bots.
