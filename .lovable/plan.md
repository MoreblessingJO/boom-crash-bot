
# Worker Phases 2–5 — Pre-Live Hardening

## Goal

Make the trading engine safe enough to trust with real Deriv funds. Today the worker is **paper-only**: no Deriv account is attached, orders are simulated as DB rows, and no server-side guardrails exist beyond the existing `kill_switch` + `max_daily_loss`.

After this plan:
- The worker can place **real** Deriv contracts through one designated "engine account" (the owner's Deriv connection).
- Every buy is **idempotent** — network blips can't double-fill.
- A **reconciliation loop** keeps local DB in sync with Deriv's actual portfolio.
- **Server-enforced guardrails** check every trade against `halt_engine`, `daily_loss_limit`, `max_open_positions`, `max_stake_per_trade`, `max_stake_pct_equity`.
- A hard **paper vs live** switch controlled from the admin panel.

## Scope decision: one engine account, not per-user

Multi-user live trading (each signed-in user trades from their own Deriv account) requires **one Deriv WS session per user**, per-user open-position tracking, per-user P&L, per-user guardrails. That's a substantially bigger build.

This plan ships **single-account live** first: the engine trades from the owner's connected Deriv account. Other users can still connect their Deriv account and view their own state on `/dashboard`, but the automated engine only trades the owner's account. Multi-user auto-trading is a later phase.

## What Changes

### 1. New DB action: fetch owner Deriv token (server side)

The worker cannot access the `DERIV_TOKEN_ENC_KEY` (secret lives in Lovable, not on the droplet). Add a **new signed endpoint** on the app side, `/api/public/worker-deriv-token`, that:
- Verifies HMAC with `WORKER_SHARED_SECRET` (same pattern as `worker-sync`).
- Loads the owner's active `user_deriv_accounts` row (looked up by joining `user_roles` on `role='owner'`), decrypts the token server-side, returns `{ token, loginid, account_type }`.
- Rate-limited to one call per 60s per source (uses `alert_log` table as cheap TTL store).

Worker calls this on boot and every 30 min to refresh.

### 2. Second Deriv WS (authenticated) for orders

Current `deriv-ws.ts` is anonymous (ticks only). Add `deriv-auth-ws.ts`:
- Separate WS connection, `authorize` on connect with the owner's token.
- `buy`, `sell`, `portfolio`, `proposal_open_contract` request/response helpers with `req_id` correlation.
- Reconnect + re-authorize on drop.
- **Never** starts if `settings.is_live=false` or the token fetch fails.

Ticks WS stays as-is — pricing feed doesn't need auth.

### 3. Idempotent buys

In `engine.ts` `onTick` before insert:
- Generate `client_req_id = crypto.randomUUID()`.
- Insert the position row with `status='pending'` and the `client_req_id` (unique index already exists).
- Send Deriv `buy` with that req_id in a local map.
- On buy response: update position → `status='open'`, `deriv_contract_id`, `entry_price` from Deriv's fill price.
- On buy timeout (10s): call Deriv `portfolio`, look for a contract matching our metadata; if found, adopt it; if not, mark position `status='failed'`.
- On buy error: mark `status='failed'`, log to `live_trade_audit`.

### 4. Reconciliation loop

New `reconciler.ts`, runs every 60s and once on boot:
- Fetch `portfolio` from Deriv.
- For each local `positions.status='open'` with a `deriv_contract_id`: check it's still in the portfolio. If gone, fetch `proposal_open_contract` to get final `sell_price` / `profit`, mark `closed` with `exit_reason='RECONCILED'`.
- For each Deriv portfolio contract with no matching local row (orphan): insert as `status='open'` with `exit_reason='ADOPTED'` audit note so it appears in the UI and gets managed.

### 5. Server-enforced guardrails

New `guardrails.ts`. Before every buy attempt, in order:
1. `settings.halt_engine === true` → block.
2. `settings.is_live === false` → paper branch (see §6).
3. `today_pnl()` ≤ `-daily_loss_limit` → block + halt engine + audit.
4. Count of `status IN ('open','pending')` positions ≥ `max_open_positions` → block.
5. `stake > max_stake_per_trade` → clamp down (log audit).
6. `stake > equity * max_stake_pct_equity` → clamp down (equity = latest `balance` from Deriv authorize response).

Every block writes one row to `live_trade_audit` with `action='BLOCKED'`, `reason`, and the settings snapshot.

### 6. Paper vs Live branch

- `is_live=false` (default): existing behavior — insert `positions` row directly with the simulated fill price; no Deriv buy call. Manages/closes locally against tick price (as today).
- `is_live=true`: the full flow in §3 + §4 + §5. `live_trade_audit` gets an entry for every open, close, block, and reconciliation event.

### 7. Admin UI additions

Small additions to `/admin`:
- **Live mode toggle**: Switch bound to `settings.is_live`. Confirmation modal: type "GO LIVE" to enable. Shows the currently-attached owner Deriv account (loginid, VR/real, balance).
- **Guardrail inputs**: number fields for `daily_loss_limit`, `max_open_positions`, `max_stake_per_trade`, `max_stake_pct_equity`.
- **Halt Engine** big red button (sets `settings.halt_engine=true`).
- **Live audit tab**: table of last 100 `live_trade_audit` rows.

## File Changes

**New:**
- `src/routes/api/public/worker-deriv-token.ts` — signed token fetch endpoint
- `worker/src/deriv-auth-ws.ts` — authenticated Deriv WS for orders
- `worker/src/reconciler.ts` — 60s reconciliation loop
- `worker/src/guardrails.ts` — pre-trade checks
- `src/components/admin/GoLiveToggle.tsx`
- `src/components/admin/GuardrailSettings.tsx`
- `src/components/admin/LiveAuditTable.tsx`

**Modified:**
- `worker/src/engine.ts` — idempotent buy flow, paper/live branch, guardrail integration
- `worker/src/index.ts` — start reconciler, load owner token on boot
- `worker/src/db.ts` — add helper for token fetch endpoint (separate URL, same HMAC)
- `src/routes/api/public/worker-sync.ts` — allow `live_trade_audit` table
- `src/routes/_authenticated/admin/index.tsx` — mount new admin components

**No DB migration needed** — all columns/tables already exist from the earlier hardening migration.

## What This Does NOT Cover

Deferred to later phases (still needed before "public launch" but not for owner-only live testing):
- Multi-user auto-trading (each user's own Deriv account)
- Phase 7 health alerts (Telegram/email) — recommended next
- Rate limiting on user-facing endpoints
- Structured JSON logs / observability
- Terms & conditions / risk disclosure

## Deployment Note (droplet)

After I ship the code, you'll need to on the DigitalOcean droplet:
```
cd bnc-worker && git pull && npm install && npm run build && pm2 restart bnc-worker
```
I'll include the exact command list in the final message.

## Risk Assessment Post-Ship

- **Paper mode** (`is_live=false`, default): unchanged — safe to run indefinitely.
- **Live mode with small stake ($0.35–$1)**: safe to test once you (a) connect the owner Deriv account via `/dashboard`, (b) set `daily_loss_limit=5`, `max_open_positions=1`, `max_stake_per_trade=1`, (c) toggle `is_live=true` with the confirmation modal.
- Anything larger: run 2 weeks of live micro-stake first, then scale.
