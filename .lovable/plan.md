## Goal
Replace the 30-second cron-driven engine with a persistent Node worker running 24/7 on a DigitalOcean Droplet. The worker holds an open WebSocket to Deriv, reacts to ticks within milliseconds, and writes to the same Lovable Cloud Postgres the dashboard already reads from. The Lovable app stays unchanged as the UI/control plane.

Paper mode only for this milestone. Real Deriv order placement is a separate follow-up.

## Architecture

```text
┌──────────────────────┐        ┌───────────────────────┐
│ DigitalOcean Droplet │        │  Lovable Cloud (DB)   │
│  Node worker (PM2)   │──────▶ │  positions, settings, │
│  • Deriv WS (live)   │ writes │  learning_buckets,    │
│  • Strategy engine   │        │  symbol_state, signals│
│  • Position manager  │        └──────────┬────────────┘
└──────────┬───────────┘                   │ Realtime
           │ WS subscribe                  │
           ▼                               ▼
   wss://ws.derivws.com            Lovable app (UI only)
```

The browser no longer drives trading. The cron endpoint is disabled. All trade decisions happen in the Droplet process.

## What lives where

**New repo (separate from Lovable project)** — `bnc-worker/`:
- `src/index.ts` — boot, WS connect, reconnect loop, heartbeat
- `src/deriv-ws.ts` — persistent Deriv WS client with auto-reconnect + backoff
- `src/strategy.ts` — copy of `strategy.server.ts` (pure math, no Supabase)
- `src/engine.ts` — per-tick: update state, manage open position, evaluate entry
- `src/db.ts` — Supabase service-role client
- `src/symbols.ts` — copy of the 6 symbol defs
- `ecosystem.config.js` — PM2 config (auto-restart, memory cap, logs)
- `.env.example` — `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DERIV_APP_ID`
- `README.md` — deploy + ops commands

**Lovable project changes** (small, surgical):
- `src/routes/api/public/tick-engine.ts` — gate behind a feature flag so the cron loop stops running once the worker is live (no deletion yet; keeps a fallback).
- New `engine_heartbeat` table — worker writes `{ updated_at, status, last_tick_epoch }` every 5 s.
- New `EngineStatus` component on the dashboard header — green dot if heartbeat < 15 s old, red otherwise.
- No changes to strategy, learning, UI cards, or the brain monitor.

## Engine behavior (worker)

For each of the 6 symbols, the worker keeps an in-memory rolling tick buffer (sized `avgSpikeTicks × 3`, capped at 5000) hydrated once from Deriv `ticks_history`, then maintained tick-by-tick from the live `ticks` subscription.

On every incoming tick:
1. Append to buffer, recompute lightweight state (median abs change, RSI, EMA fast/slow, ticks-since-spike).
2. If a position is open on that symbol → check TP/SL/pre-spike/time-stop; close if hit. Honors the same 1R floor for pre-spike exits and caps realized R at the declared stop, identical to current `engine.server.ts`.
3. If flat → run `localSignal`, apply late-entry guard, learner gate (read buckets from DB, cached 60 s), confidence floor, daily-loss guard. If all pass, insert a row into `positions`.
4. Throttle DB writes for `symbol_state` to once every 1 s per symbol (millisecond reactions internally, but no DB hammering).

Settings, learning buckets, and the kill switch are re-read from DB every 10 s so changes in the UI take effect quickly without restarting the worker.

## Deploy steps (DigitalOcean)

User-runnable, one-time:
1. Create a Droplet — Ubuntu 24.04, basic $6/mo (1 vCPU / 1 GB RAM is plenty), region `fra1` or `ams3` (closest to Deriv's EU infra). Add SSH key during creation.
2. SSH in. Install Node 20 via NodeSource, then `npm i -g pm2`.
3. `git clone` the worker repo to `/opt/bnc-worker`, `npm ci`, copy `.env.example` to `.env`, paste `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (I will give exact values, since Lovable Cloud exposes them to me).
4. `pm2 start ecosystem.config.js && pm2 save && pm2 startup` (last command outputs a `systemctl enable` line to paste once — this is what makes the worker survive Droplet reboot).
5. `pm2 logs bnc-worker` to confirm: Deriv WS connected, 6 symbols subscribed, heartbeat row appearing in DB.
6. In Lovable UI, the new green "Engine: live" badge confirms end-to-end.

Total hands-on time ≈ 10–15 minutes.

## Ops

- `pm2 restart bnc-worker` — restart after pulling new strategy code.
- `pm2 logs bnc-worker --lines 200` — view recent activity.
- `pm2 monit` — live CPU/memory view.
- Auto-restart on crash: PM2 default. Auto-restart on memory > 200 MB: configured in `ecosystem.config.js`. Auto-restart on Droplet reboot: handled by `pm2 startup` (systemd).
- Heartbeat staleness > 30 s = worker dead. The UI badge surfaces this; no silent failures.

## What I will NOT touch

- Strategy math, R-multiple sizing, learner thresholds, late-entry guard — identical to current behavior. Only the *cadence* changes (per-tick vs per-30-s).
- DB schema for `positions`, `settings`, `learning_buckets`, `symbol_state`, `signals` — unchanged.
- Brain monitor, symbol grid, positions panel, control panel — unchanged.
- The current cron endpoint stays in code (gated off) as a fallback if the Droplet dies and you want to flip back temporarily.

## Out of scope (next milestone)

- Real Deriv order placement (requires Deriv API token, account auth, order/contract handling, and removing the realized-R cap).
- Multi-region failover.
- Slippage modeling in paper mode.

## Open question for you

What Droplet size do you want? My recommendation is **Basic Regular, 1 vCPU / 1 GB RAM, $6/mo, region `fra1`**. The worker uses well under 100 MB and ~1% CPU; anything larger is wasted. Confirm or pick differently and I'll proceed.
