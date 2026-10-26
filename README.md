# SOLD.FUN

Anyone can buy. Can you sell?

A daily exit timing game for the trenches. Every player starts each chart already holding a 1 SOL bag. A generated pump.fun style chart plays live with the future hidden. The only decision is when to sell. Points come from how close you sold to the real top. Ten charts a day, same charts for everyone, one run per wallet. Fully simulated, no real money.

## Stack

Vite, React 18, TypeScript, Canvas charts, Vercel serverless functions, Upstash Redis. Username and password accounts (scrypt hashed, 30 day sessions). Players can add a Solana payout address.

## Run locally

```bash
npm install
npm run dev
```

Without the API running, the site falls back to a public daily seed and runs fully offline. The leaderboard shows its "goes live at launch" state.

To run the API locally use `vercel dev` with the env vars below.

## Deploy (Vercel)

1. Push the repo and import it in Vercel. Framework preset: Vite.
2. Add an Upstash Redis database (Vercel Marketplace, Storage tab). It injects `KV_REST_API_URL` and `KV_REST_API_TOKEN`, which the API reads automatically. Or set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` yourself.
3. Set `SOLD_SEED_SECRET` to a long random string. This keeps the daily charts unpredictable from the client bundle.
   Set `ADMIN_KEY` to another random string. `/api/leaderboard?day=YYYY-MM-DD&key=ADMIN_KEY` then shows the top 10 payout addresses.
4. Point `sold-fun.xyz` at the project.
5. Edit `src/config.ts`: paste the CA, X handle, payout split.

Upstash is serverless and billed per request, so a launch spike does not knock the site over the way a free Postgres plan does.

## Game modes

* **Daily Run** (ranked): same 10 charts for everyone, Pro speed, one attempt, top 10 paid. Submitted scores also add to the **Weekly Cup**.
* **Classic**: 5 random charts, same rules as daily.
* **Rug Dodge**: endless charts, about half rug. Holding through a rug or exiting under 25% of the top ends the run. PB is the streak.
* **Scale Out**: sell in four 25% clips, scored on average exit.
* **Blind**: no market cap, PnL or axis numbers until the reveal.
* **Free Play**: endless, nothing saved.

Solo modes have Casual, Pro and Sweat speeds (Casual adds a danger meter). Three bots (Paper Pete, Diamond Dee, Sniper Sol) can sell the same chart live; they only see past candles. The terminal shows holder tells (top 10, snipers, bundlers, insiders, dev) and the bonding curve. Rugs really do show heavy bundlers and insiders, so the tells are learnable.

Personal bests, ratings and run history live in the player's browser (`#stats`).

## How scoring works

`src/engine` is shared by the browser and the server.

* `generator.ts` builds each chart from a seed. Nine shapes: runner, moonshot, double top, slow bleed, fake pump, staircase, rug, dev dump, chop. Every daily run has all nine plus one repeat, shuffled.
* `score.ts` scores a play. `pctOfTop = exitPrice / peakPrice`, points `= round(100 * pct^1.6)`, plus a 10 point sniper bonus when a sell lands within 3 candles of the top at 90%+. Holding during a rug wipes the points for the share you held. Max 110 per chart, 1100 per run.
* Ratings: SOLD THE TOP (avg 85%+), BAG SECURED (70%+), PAPER HANDS (mostly early), DIAMOND HANDS (mostly late), EXIT LIQUIDITY (rugged 3+ times).

## Anti cheat

* The client only submits sell timings, never a score. `api/submit.ts` rebuilds the charts from the secret seed, validates every sell and computes the score itself.
* Submissions need a signed in account. Sign up and log in are rate limited per IP.
* One run per account per day (Redis `SET NX`). Ties go to whoever submitted first.
* A page refresh mid chart locks in the sells made so far, so you cannot peek at a chart and retry it.

## API

| Route | Method | What it does |
| --- | --- | --- |
| `/api/daily` | GET | `{ day, seed }` for today (UTC) |
| `/api/auth` | GET, POST | current user, or `signup`, `login`, `logout`, `payout` actions |
| `/api/submit` | POST | `{ day, plays }` with a Bearer session token, returns rank |
| `/api/leaderboard?day=YYYY-MM-DD` | GET | top 100 plus per chart "pro exit" stats from the top 20. Add `&scope=week` for the Weekly Cup |

## Files

```
server/         API source (edit here, then npm run build:api)
api/            generated self contained API files that Vercel runs
src/engine/     deterministic chart generator and scoring, shared with the API
src/components/ canvas chart, landing demo reel
src/modes.ts    game modes, difficulty, chart picking
src/pages/      landing, hub and setup, play, results, leaderboard, stats
src/lib/        accounts and api client, sound, share card, storage
src/config.ts   CA, socials, payout split
```