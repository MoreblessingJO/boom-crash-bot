# Pre-Live-Funds Hardening Plan

Delivered in the recommended order: **1 → 3 → 4 → 2 → 5 → 6 → 7**. Each phase is independently shippable and testable on paper mode before moving to the next. Nothing here flips real trading on — that stays behind a manual `is_live` toggle you control (Phase 5).

---

## Phase 1 — Deriv OAuth (per-user real-account tokens)

**Goal:** replace the single shared demo token with one authorized token per user, stored encrypted, scoped to `trade` + `trading_information` + `read`.

- New table `user_deriv_accounts` (user_id, deriv_loginid, encrypted_token, account_type `demo|real`, currency, scopes, connected_at). RLS: owner-only, no `anon` grant.
- Token encryption using `DERIV_TOKEN_ENC_KEY` (32-byte, stored as a runtime secret; AES-256-GCM in a server function).
- New public route `/api/public/deriv/callback` handles the OAuth redirect from Deriv, exchanges the `token1..tokenN` params, persists encrypted tokens for the signed-in user.
- New UI: "Connect Deriv" button on the dashboard (in an `_authenticated` route) → opens Deriv OAuth in a popup → on return shows connected account, balance, currency, "Disconnect" action.
- Worker: on boot and on settings-refresh, load the active user's decrypted token from `user_deriv_accounts` (via a signed request using `WORKER_SHARED_SECRET`) instead of the hard-coded token in `settings`.

**Needs from you:** Deriv OAuth `app_id` (register the app at https://app.deriv.com/account/api-token → "Register application"; redirect URL will be `https://sparky-trader.lovable.app/api/public/deriv/callback`).

---

## Phase 3 — Idempotent order placement

**Goal:** eliminate any possibility of double-buys on restart or race.

- Add `client_req_id UUID UNIQUE` column to `positions`. Generated before the Deriv `buy` call.
- Worker wraps every buy in: `INSERT positions(client_req_id, status='pending', …)` → `deriv.buy({ req_id })` → `UPDATE positions SET contract_id=…, status='open'`. Unique constraint blocks duplicates.
- On Deriv `buy` timeout or worker crash mid-call: on next tick, query Deriv `portfolio` for that `req_id`/contract before retrying.
- Add `symbol_state.last_buy_at` cool-down (config-driven) — reject buys under N seconds since last, defense in depth.

---

## Phase 4 — Reconciliation loop on worker boot + periodic

**Goal:** worker's `positions` table always matches Deriv reality.

- On boot: call Deriv `portfolio` + `profit_table` (last 24h) → for every open contract, ensure a matching `positions` row; for every DB "open" row not in Deriv portfolio, look it up via `proposal_open_contract` and mark closed with actual P&L.
- Every 60s while running: repeat lightweight reconciliation (portfolio only) — detect out-of-band closes (SL/TP hit, expiry, manual close in Deriv app).
- Emit `[reconcile]` log lines with counts (opened / closed / drift-fixed).

---

## Phase 2 — Server-enforced guardrails + kill switch

**Goal:** limits are enforced in `engine.ts` before every buy — UI is only a mirror.

- New `settings` columns: `halt_engine boolean`, `daily_loss_limit numeric`, `max_open_positions int`, `max_stake_per_trade numeric`, `max_stake_pct_equity numeric`.
- New view/function `v_today_pnl(user_id)` — sum of closed P&L since UTC midnight.
- Before every buy, engine checks (in order): halt_engine → daily P&L vs limit → open position count → stake vs max → stake vs % of live equity. Fail-closed: on DB read error, refuse the trade.
- Dashboard adds a big red "HALT ENGINE" toggle (writes `settings.halt_engine`); worker reads it every tick.

---

## Phase 5 — Paper vs. Live mode split + audit log

**Goal:** unambiguous, hard-to-flip-by-accident live switch with an audit trail.

- New `settings.is_live boolean default false`. When false, worker uses Deriv **demo** account (or simulates fills locally against tick stream).
- UI toggle guarded by a modal: type "GO LIVE" to confirm, shows connected real balance, warns loss limits.
- New append-only table `live_trade_audit` (contract_id, symbol, stake, entry, exit, pnl, snapshot_of_settings_json, created_at). RLS: owner read, service_role insert, no updates/deletes ever.
- Trigger on `positions` insert/update when `is_live=true` writes to audit.

---

## Phase 6 — Auth on the dashboard

**Goal:** no anonymous access to trading state.

- Move dashboard routes under `src/routes/_authenticated/`. Public homepage stays at `/` with marketing copy + login CTA.
- Drop `anon` SELECT grants on `positions`, `settings`, `signals`, `symbol_state`, `learning_buckets`, `engine_runs`. Keep `engine_heartbeat` public-readable only for a slim status widget (or move that behind auth too).
- Fetchers use `requireSupabaseAuth` + a `has_role('owner')` check so only you can see the trading data initially.

---

## Phase 7 — Worker health alerting

**Goal:** you find out before your users do.

- Cron server route `/api/public/cron/health-check` (called every minute by pg_cron or external cron) — if `engine_heartbeat.updated_at` age > 30s, send alert.
- Alert channels: email via Resend (already available via Lovable AI Gateway? — will confirm) **and/or** Telegram bot (needs `TELEGRAM_BOT_TOKEN` + chat id).
- Alerts also fire on: `[proc] unhandledRejection`, Deriv `authorize` failure, reconciliation drift > 0.
- Simple cooldown: max 1 alert per channel per 10 min per alert-type.

**Needs from you (Phase 7):** preferred alert channel — Telegram (fastest), email (Resend), or both?

---

## What is NOT in this plan

- Phases 8–14 (rate-limit polish, position-size-vs-equity refinement beyond guardrails, migration/rollback docs, structured logs, learning-bucket review, TZ audit, T&Cs page). These are important but non-blocking; we'll do them after Phase 7 is green.
- Any auto-flip to live mode. `is_live` stays a manual toggle you control.

## Technical Details

- Worker changes deploy the same way as today: `git pull && npm i && npm run build && pm2 restart bnc-worker --update-env`.
- All new DB tables get GRANTs + RLS in the same migration.
- Encryption key `DERIV_TOKEN_ENC_KEY` will be generated via `generate_secret` (never revealed).
- Deriv OAuth `app_id` will be stored as `DERIV_APP_ID` (public, not a secret, but env-configured).
- The worker fetches decrypted tokens via a new authenticated server function using `WORKER_SHARED_SECRET` bearer — service role never leaves Lovable Cloud.

---

## Two things I need from you before I start Phase 1

1. **Deriv OAuth app**: register at https://api.deriv.com/dashboard, use redirect `https://sparky-trader.lovable.app/api/public/deriv/callback`, then paste the `app_id` (a number, e.g. `12345`) here.
2. **Alert channel preference** for Phase 7 (Telegram, email, or both).

Approve this plan and I'll start on Phase 1 immediately.
