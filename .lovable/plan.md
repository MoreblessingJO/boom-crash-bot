## Goal

Run three Boom & Crash strategies simultaneously in paper mode — Nexx (trend-following), 007 (aggressive counter-spike), Sniper (high-confidence AI+local agreement) — each with its own $1,000 paper balance, its own positions ledger, and its own performance metrics. Nicco stays live as the single real-money strategy.

## Architecture change

Today one global engine writes to one `positions` table and one `settings.paper_balance`. To measure agents independently, every trade must be tagged with the agent that placed it, and paper P&L must accumulate into a per-agent balance.

### Database (single migration)

1. `agent_paper_ledgers` — one row per active agent
   - `agent_id` (fk `agents.id`, unique), `starting_balance numeric default 1000`, `paper_balance numeric default 1000`, `is_active bool default true`, timestamps.
   - Seed rows for Nicco, Nexx, 007, Sniper at $1,000 each.
   - RLS: authenticated read; service_role write.

2. Add `agent_id uuid references agents(id)` to `positions` and `signals` (nullable for backfill, indexed).

3. Add `strategy_params jsonb default '{}'` to `agents` so each agent carries its own thresholds:
   - Nicco: `{ dueRatio: 0.6, confFloor: 0.5, mode: "spike_anticipation" }`
   - Nexx: `{ rsiHi: 55, rsiLo: 45, mode: "trend_following" }`
   - 007: `{ dueRatio: 0.75, confFloor: 0.65, stakeMult: 1.5, mode: "spike_anticipation_aggressive" }`
   - Sniper: `{ minConfidence: 0.75, requireAiAgreement: true, mode: "ai_gated" }`

4. Replace the paper-balance trigger to route P&L into `agent_paper_ledgers.paper_balance` for that position's `agent_id` (skip when null or when position is live-money).

5. View `agent_performance` (or server-fn) returning per agent: trades, wins, losses, win_rate, gross_pnl, net_pnl, avg_win, avg_loss, current_balance, equity_return_pct, last_trade_at.

### Worker (source only — user redeploys)

`worker/src/engine.ts` currently iterates symbols and runs one strategy. Change it to:
- Load all agents where `status ∈ ('live','beta')` once per tick loop.
- For each `(symbol, agent)` pair, evaluate that agent's strategy using its `strategy_params` (dispatch inside a new `worker/src/strategies/` folder: `nicco.ts`, `nexx.ts`, `007.ts`, `sniper.ts`, sharing `computeState` from `worker/src/strategy.ts`).
- On buy/sell decision, insert `positions` row with `agent_id = <that agent>` and `is_live` derived from: Nicco → follows global `settings.is_live`; Nexx/007/Sniper → always `false` (paper) until user promotes.
- Sniper calls the AI signal via the existing `/api/ai-signal` server-fn URL and only trades when AI direction matches local direction AND both confidences ≥ 0.75.
- Reconciler already closes positions and writes `pnl` — no change; the new trigger fans P&L into the right ledger.

Mirror the same strategy dispatch in `src/lib/strategy.server.ts` so the Lovable app can preview signals in the admin panel, but the actual trade execution stays in the worker.

### Frontend

1. `src/lib/agent-performance.functions.ts` — `listAgentPerformance()` returning all agent metrics + `getAgentPerformance(slug)` + `getAgentPositions(agentId, limit)` + `getAgentEquityCurve(agentId, days)`.

2. `src/components/AgentPerformanceTabs.tsx` — tabs on `/dashboard`:
   - Row 1: comparison grid — one card per active agent with balance, 24h P&L, win-rate, trades, sparkline.
   - Row 2: selected agent's recent positions table + equity curve chart.

3. `src/routes/_authenticated/agents.$slug.tsx` — deep-dive route:
   - Header: agent name, tagline, status badge, current balance vs starting, all-time return %.
   - Metric grid: total trades, wins/losses, win rate, avg win, avg loss, profit factor, best/worst trade, sharpe (simple).
   - Equity curve (recharts LineChart) using closed positions over last 30d.
   - Positions table (paginated).
   - Strategy params card (read-only json view).

4. `src/routes/_authenticated/dashboard.tsx` — insert `<AgentPerformanceTabs />` above the existing single-strategy panels; keep Deriv connection card at top.

5. Update `AgentCard.tsx` "Deploy" wording — since all three are now running paper simultaneously for everyone, the "selection" concept becomes "which agent trades your connected real Deriv account" (still Nicco only for now). Add a small "Paper: $X.XX · Y trades · Z% win" strip on each card sourced from `listAgentPerformance()`.

### What stays the same

- Nicco remains the only agent that can go live real-money via the existing `GoLiveToggle`.
- Deriv OAuth, guardrails, reconciler, live audit, admin gating — no changes.
- Worker deploys still manual on the droplet; migration + UI ship immediately.

## Rollout in this turn

1. Migration (create ledgers, columns, seed, trigger, view).
2. Worker source updates under `worker/src/strategies/` + `worker/src/engine.ts` (committed but not auto-deployed).
3. Server fns: `agent-performance.functions.ts`.
4. UI: dashboard tabs component, `/agents/$slug` route, updated `AgentCard`.
5. Regenerate types (auto after migration approval), then wire UI.

## Technical notes

- `stack_modern` server fns for all reads; `requireSupabaseAuth` middleware on user-facing reads, publishable-key server client is fine for `agent_performance` since data isn't user-owned.
- Equity curve: cumulative sum of `pnl` for closed positions where `agent_id = ?` ordered by `closed_at`, seeded at `starting_balance`.
- Positions with `agent_id IS NULL` are pre-existing Nicco trades; backfill by setting them to Nicco's agent_id in the same migration.
- Sniper requires the worker to reach the Lovable AI endpoint — add `AI_SIGNAL_URL` to `worker/.env.example`; user sets it after redeploy.

## Out of scope

- Per-user paper balances (all users share the same paper ledger view — this is a measurement dashboard, not per-user paper trading accounts).
- Multi-user real-money multi-agent (still Nicco only for live).
- Crypto / Forex agents (remain "coming soon").