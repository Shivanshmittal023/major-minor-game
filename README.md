# Major–Minor · Live table

Online multiplayer Major–Minor for **8 players (4 v 4)** or **6 players (3 v 3)**, each on their own device, built to deploy on **Vercel**. It shares the visual design of the Major–Minor Solver, but the two apps are completely separate.

```bash
npm install
npm run dev      # local API on :8787 (in-memory rooms) + web app on :5174
npm test         # rules engine + full 8-device games through the real API handlers
npm run build    # what Vercel runs
```

On the same Wi-Fi, phones can open the "Network" URL that `npm run dev` prints.

## Table sizes (chosen when creating a game, in `shared/rules.ts` → `MODES`)
| | 8 players | 6 players |
|---|---|---|
| Teams | 4 v 4 | 3 v 3 |
| Deck | 48 cards (no 8s) | 54 cards |
| Sets | 8 | 9: the same 8, plus **8s & Jokers** (8♠ 8♥ 8♦ 8♣, Colourful Joker, Colourless Joker) |
| Hand | 6 cards | 9 cards |

Seats alternate teams in both modes. Card ids 0–47 are identical in both; the extra set is ids 48–53.

## Lobby
- **No host: everyone is equal.** Whoever created the table just takes Seat 1. Any player can seat people, rename teams, add bots, remove a lobby guest, skip a disconnected player's turn, start, or call a rematch.
- **Players sit as they join.** The moment every seat is filled and everyone is online, a **10-second countdown** starts on every screen, then the cards are dealt. Anyone can tap **Start now** to skip it. Unseating someone stops the countdown, and it restarts when the table fills again.
- **Everyone** in the lobby can arrange the teams. Tap an empty seat to sit there, tap a player then a seat to move them, or use Auto-fill, Shuffle and Swap teams. Seats alternate teams.
- Anyone can **rename the two teams** (default Tide / Ember). The colours stay the same.
- **Bots:** anyone can tap **Fill with bots** to seat bots in every empty seat, so one person can play a whole table. Bots move on the server, one move every ~2.5s.
  - Their brain (`server/ai/brain.ts`) is the Solver's deduction run from the bot's seat, using **only its own hand and public events**.
  - Each turn a bot works out who must, can and can't hold each card, then asks the opponent most likely to hold a card it needs. It declares as soon as it can prove all six holders.
  - Against random players they win essentially every game.
- **Auto-skip:** if a disconnected player's turn comes up, it's skipped automatically after 60 seconds.

## House rules (fixed, in `shared/rules.ts`)
- After a **successful** ask, the **asker goes again**.
- After a **failed** ask, the **asked player** plays.
- Only **opponents** can be asked.
- A **random** player takes the first turn. The deal is a Fisher–Yates shuffle using Node's `crypto.randomInt`, done on the server.
- You must hold a card of a set to ask for another card from it.
- **Declaring** is the only way to win a set:
  - Any seated player can declare at any time, even on someone else's turn, **but only a set they hold at least one card of**. They name which teammate holds each of the six cards.
  - All six correct: the declarer's team wins the set.
  - Any mistake (a card with the wrong teammate, or actually with the opponents): the opponents win it.
  - Either way the cards are revealed, leave play, and the turn doesn't change.
- A player with no cards is skipped.
- The game ends when every set is declared. Most sets wins (a 4–4 draw is possible at 8 players; 9 sets can't tie).

## The Solver (`/solver`)
The in-person table assistant lives at **/solver** (code in `src/solver/`, loaded only when opened). It's a separate tool for physical games: you record what you see, and it deduces who holds what and suggests asks. It has no connection to online tables.

## Architecture
```
api/room.ts        Vercel Function: GET = poll your view, POST = take an action
server/handler.ts  the API: load room → apply → compare-and-set save (retries on conflict)
server/room.ts     pure room logic: lobby, seating, teams, auto-start, presence, per-player snapshots
server/game.ts     pure rules engine: deal, validate, transfer, complete, turns, end
server/store.ts    Upstash Redis (production) or in-memory (local dev / tests)
server/dev.ts      local stand-in for Vercel, running the same handler
shared/            cards, rules, API types (used by client and server)
src/               React client in the Ink & Ivory design system
```

- **Server-authoritative.** The deck and all hands exist only on the server. Each device receives the public table plus its own hand, and nothing else.
- **Realtime on Vercel.** Vercel functions can't hold WebSockets open, so each device polls: 1s during a game, 2s in the lobby, 4s when the tab is hidden. The server answers `unchanged` unless something moved. Your own actions update instantly.
- **Concurrency.** Every write is an atomic compare-and-set (a Redis Lua script) on the room version, so simultaneous actions never overwrite each other.
- **Presence.** Polling doubles as a heartbeat. A device silent for 15s shows as offline, and any player can skip an absent player's turn.
- **Refresh and reconnect.** A secret session token on each device resumes the same seat. Retried asks are de-duplicated by `actionId`.
- **Cleanup.** Rooms expire from Redis 12 hours after their last write.
- **Imports.** Server-side relative imports use `.js` extensions, which Vercel's native ES-module runtime requires.

## Deploying (GitHub → Vercel)
1. Push this folder to a GitHub repository.
2. In Vercel: **Add New → Project**, then import the repository. Everything else is detected from `vercel.json`.
3. In the Vercel project, open **Storage → Create / Connect → Upstash (Redis)** and connect it to the project. This adds the `KV_REST_API_URL` and `KV_REST_API_TOKEN` environment variables.
4. **Redeploy**, so the environment variables are picked up.

The free Upstash tier (500K commands/month) covers roughly 15–20 full games a month. Beyond that it's pay-as-you-go at a few cents per game.
