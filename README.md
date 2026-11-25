# IPL Auction Room 🏏🔨

A real-time multiplayer IPL auction game for friends. Create a room, share the 5-letter code, everyone picks a franchise (CSK, MI, RCB, KKR, DC, PBKS, RR, SRH, GT, LSG), and you fight it out live with a hammer clock, purses, overseas caps and squad limits.

- **511 players** from every IPL squad 2021–2026 (313 capped, 198 uncapped), 460 with official cut-out photos
- Ratings and base prices built from real IPL career stats (runs, strike rate, wickets, economy), weighted towards recent seasons
- A clean-slate auction: player cards never show a player's real franchise. The card only takes on a team's colours when that team leads the bidding
- **Real team logos, colours and names**
- **Room codes + invite links**, works on phones and laptops, survives refreshes and reconnects
- **Computer players** (Computer A, Computer B, …) fill empty franchises when the host taps `+ CPU`
- Works in phone portrait and landscape (landscape fits the whole auction on one screen)
- Marquee sets → role sets → uncapped sets, with an optional **accelerated round** for unsold players
- Jump bids (+50L / +1 Cr), Pass, keyboard shortcuts (Space = bid, P = pass), emoji reactions, sounds, SOLD stamps and confetti
- Results screen: best-XI strength ranking, most expensive buy, steal of the auction, and a "copy squads for WhatsApp" button

## Play locally

```bash
npm install        # installs server + client
npm run build      # builds the game UI
npm start          # http://localhost:3001
```

Friends on the same Wi-Fi can open `http://<your-laptop-ip>:3001`.

For development with hot reload: `npm run dev` (UI on http://localhost:5173).

## Play with friends over the internet

The server keeps rooms in memory, so it needs a host that runs a Node process with WebSockets:

- **Render**: push this repo, then *New → Blueprint* and pick the repo (uses `render.yaml`). Free plan works, but it sleeps after ~15 min idle and a restart wipes any room in progress, so open the site a minute before you play.
- **Railway / Fly.io / any VPS**: build with `npm install && npm run build`, start with `npm start`. `PORT` is respected.
- **From your own laptop**: run `npm start`, then expose it with `cloudflared tunnel --url http://localhost:3001` or `ngrok http 3001` and share the URL.

## Formats (host picks in the lobby)

| Preset  | Players in pool | Squad (min–max) | Rough length with 4–5 friends |
|---------|-----------------|-----------------|-------------------------------|
| Blitz   | 60+             | 11–15           | ~20 min |
| Quick   | 120             | 15–20           | ~45 min |
| Classic | 220             | 18–25           | ~1.5 hr |
| Mega    | all 511         | 18–25           | 2 hr+ |

The pool is automatically enlarged if there are many teams. Purse (default ₹120 Cr), overseas limit, bid clock and squad sizes are all adjustable.

**Rules enforced by the server:** IPL bid increments (5L under 1 Cr, 10L to 2 Cr, 20L to 5 Cr, 25L to 10 Cr, 50L above), you can't outbid yourself, you can't exceed the squad or overseas cap, and you must keep enough purse (30L per remaining slot) to reach the minimum squad.

## Refreshing player data

```bash
npm run fetch-data          # re-pulls squads, retentions, photos and logos from iplt20.com
npm run fetch-data -- --force   # re-download every image
```

The script reads the public squad feeds behind iplt20.com team pages (seasons 2021–2026), each player's IPL career stats, and the IPL 2027 retention list (used only for capped status, age and as a rating floor). It also tries Wikipedia for players with no official photo. Stats are cached in `scripts/.cache`.

Ratings come from IPL stats with recent seasons weighted most, plus a hand-picked marquee list. Capped status comes from the retention feed and a hand-maintained `INDIA_CAPPED` list; every overseas player counts as capped. Edit `MARQUEE`, `INDIA_CAPPED` or the `BANDS` table in `scripts/fetch-data.mjs` to taste. The pool for each game is about 72% capped and 28% uncapped, so every auction has uncapped sets.

## Project layout

```
server/game.js         auction engine (rules, timer, computer players) – pure logic, unit tested
server/index.js        Express + Socket.IO, rooms, reconnects
server/game.test.js    `npm test`: rules + a full computer-only auction simulation
client/src/screens     Home, Lobby, Auction, Results
client/public/players  player photos (.webp cut-outs, a few .jpg)
client/public/teams    franchise logos and backdrop patterns
scripts/fetch-data.mjs data + image scraper
```

Team names, logos and player photos belong to their owners (BCCI/IPL and the franchises). This repo is a private, non-commercial game for friends.
