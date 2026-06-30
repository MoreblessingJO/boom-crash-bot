# 24/7 Server-Side Trading Agent

Goal: agent keeps trading, learning, and tracking P&L when your browser/laptop is off. The browser becomes a viewer — close it, the agent keeps running.

## Architecture

```text
                ┌──────────────────────────────┐
                │   Lovable Cloud (Postgres)   │ ← single source of truth
                │  settings · positions ·       │
                │  signals · learning_buckets · │
                │  ticks_cache · runs           │
                └────────────▲─────────────────┘
                             │ read/write
   pg_cron (every 30s) ──►  /api/public/tick-engine  (server route)
                             │
                             ├── fetch latest ticks from Deriv REST/WS (short-lived)
                             ├── update per-symbol state + spike detection
                             ├── evaluate hybrid strategy + learner gating
                             ├── open / manage / close positions
                             └── write everything back to DB

   Browser (dashboard + brain)  ──►  reads DB via server fns
                                     subscribes to Realtime for live updates
                                     control panel writes settings rows
```

## What the user gets

- Close the tab → trades keep firing on the server.
- Reopen → dashboard hydrates from DB (balance, open positions, history, learner state — no resets).
- Control panel (mode, stake, R-multiples, kill switch, learning toggles) writes to a `settings` row the cron loop reads on every tick.
- Brain monitor + symbol cards reflect server-side stats in real time via Supabase Realtime.

## Trade-off you already accepted

Cloudflare Workers can't hold a long-lived WebSocket, so the loop runs on a **30-second cron** using Deriv's REST endpoint for recent ticks. This means:
- Spike-anticipation entries fire within ~30s of the trigger (vs. sub-second today).
- Trend-following is unaffected.
- If you later want millisecond reactivity, you'd run a tiny Node worker on a $5 VPS pointed at the same DB — same code, different host.

Live trading (real Deriv account) requires a Deriv API token stored as a server secret. Paper + signals modes work without it.

## Build steps

1. **Enable Lovable Cloud** (DB + auth + secrets).
2. **Schema migration** — tables with RLS + grants:
   - `settings` (single row per user: mode, stake, R-multiples, guards, kill switch, enabled symbols)
   - `positions` (id, symbol, side, regime, entry/exit, R, pnl, status, opened_at, closed_at)
   - `signals` (audit log of every evaluation: symbol, regime, direction, confidence, reason, acted)
   - `learning_buckets` (symbol·regime·direction → trades, wins, losses, ewma_R, disabled)
   - `symbol_state` (symbol → last tick epoch/price, ticks_since_spike, ema_fast, ema_slow, rsi, median_abs_change, recent ticks JSONB)
   - `engine_runs` (cron heartbeat: started_at, finished_at, symbols_scanned, trades_opened, error)
3. **Port strategy + learner** from `src/lib/` to server-side modules (`*.server.ts`): `strategy.server.ts`, `learner.server.ts`. Same math, DB-backed state.
4. **Cron endpoint** `src/routes/api/public/tick-engine.ts`:
   - HMAC-verify caller (shared `CRON_SECRET`).
   - Load settings; if kill switch on, write heartbeat and exit.
   - For each enabled symbol: fetch last N ticks from Deriv REST, update state, run `localSignal`, apply learner gates, open/close positions, log signal.
   - Manage open positions: TP/SL, pre-spike exit, time stop.
   - Update learning buckets on every close.
5. **pg_cron job** scheduled every 30s hitting the endpoint with the secret.
6. **Server functions for the UI** (`*.functions.ts`):
   - `getDashboardState` → settings + open positions + recent closes + symbol_state snapshot.
   - `getBrainStats` → aggregates for brain monitor.
   - `updateSettings`, `resetLearner`, `flattenAll`, `togglePause`.
7. **Frontend refactor**:
   - Replace Zustand-as-source with Zustand-as-cache hydrated from DB.
   - Subscribe to Realtime on `positions`, `symbol_state`, `learning_buckets` → push into cache.
   - Control panel writes via `updateSettings` server fn.
   - Keep existing `TickChart`, `SymbolGrid`, `PositionsPanel`, `LearningPanel`, `Brain` pages — only their data source changes.
8. **Live trading path** (optional, behind toggle): if mode = `live` and `DERIV_API_TOKEN` secret set, the cron loop authorizes and places real trades; otherwise paper-only.

## Secrets needed

- `CRON_SECRET` — auto-generated; signs the cron call.
- `DERIV_API_TOKEN` — only when you flip live mode on; I'll request it then, not now.

## Out of scope for this step

- Auth/multi-user (single-operator app; one settings row). Easy to add later.
- VPS deployment for sub-second reactivity.
- Real ML model — bandit learner stays as-is server-side.

After approval I'll enable Cloud, ship the migration, the cron engine, and rewire the frontend.