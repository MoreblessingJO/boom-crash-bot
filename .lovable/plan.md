
## Context

Lovable Cloud does not expose `SUPABASE_SERVICE_ROLE_KEY` to users or support — that's a platform policy, not a temporary block. So **Path A (worker talks directly to Supabase with the service-role key) is permanently off the table** for this project.

The good news: **Path B is already built, deployed, and working.** The worker on the DigitalOcean droplet signs each batch of DB ops with HMAC-SHA256 using `WORKER_SHARED_SECRET`, POSTs to `/api/public/worker-sync`, and the Lovable server executes them with `supabaseAdmin` server-side. This is a completely valid production architecture — many real systems run this way on purpose (single audited DB entry point, easy to add rate-limits and audit logs, no service-role key on a third-party VM).

So the next best update isn't a migration — it's **making Path B permanent and hardening it** so latency and reliability match what Path A would have given us.

## Proposed plan

### 1. Retire the Path A todo
- Delete the "Path A — Migrate worker to direct Supabase service-role access" block from `.lovable/todo.md`.
- Replace it with a short "Architecture: Path B (signed HTTP proxy) — permanent" note explaining why, so future you doesn't re-open the question.

### 2. Update the worker README + plan docs
- `worker/README.md` currently mentions pasting `SUPABASE_SERVICE_ROLE_KEY` into `.env`. Rewrite the setup section to reflect Path B only: `LOVABLE_APP_URL` + `WORKER_SHARED_SECRET`.
- `.lovable/plan.md` Step 4 asks you to fetch the service-role key. Rewrite it to reference `WORKER_SHARED_SECRET` (which you already have) and remove the service-role instructions.

### 3. Latency & reliability hardening on Path B
The one real downside of Path B is a ~50–150 ms round-trip per DB batch (worker → Lovable Worker → Supabase) vs. ~20–40 ms direct. Mitigations:

- **Batch aggressively.** The endpoint already accepts up to 25 ops per request. Audit `worker/src/engine.ts` for spots that fire single-op writes in a hot loop (tick handler, heartbeat, symbol_state) and coalesce them into one signed request per tick cycle.
- **Fire-and-forget for non-critical writes.** `engine_heartbeat` and `symbol_state` don't need to block the tick loop — send them without awaiting.
- **Timeout + retry with jitter.** Wrap `sendOps` in a 3 s timeout and one retry on network error, so a transient Lovable Worker cold-start doesn't kill a tick.
- **Connection reuse.** Use a single `undici` Agent with keep-alive so we avoid TLS handshake on every request. (Currently each `fetch` may open a fresh connection.)

### 4. Endpoint hardening on the Lovable side
`/api/public/worker-sync` is public by URL and only guarded by the HMAC. Small tightening:

- **Timestamp in the signed body** + reject requests older than 30 s → prevents replay if a signed payload ever leaks.
- **Rate limit** by signature-verified caller (simple in-memory or per-instance token bucket) so a runaway worker can't DOS the DB.
- **Structured audit log** of ops to a new `worker_audit` table (op count, tables touched, ms taken) — cheap, and gives us a "what did the droplet just do?" trail without adding infra.

### 5. Optional: reduce writes with an outbox pattern
For very-high-frequency ticks (`symbol_state` writes), batch to an in-memory buffer on the droplet and flush every 500 ms in one op instead of per-tick. Same UI freshness, ~10× fewer round-trips.

## Out of scope
- Any attempt to fetch, generate, or work around `SUPABASE_SERVICE_ROLE_KEY` — not possible on Lovable Cloud, don't burn cycles on it.
- Moving the worker off DigitalOcean.
- Rewriting engine logic.

## Deliverables after approval
- Updated `.lovable/todo.md`, `worker/README.md`, `.lovable/plan.md`
- `worker/src/db.ts` gains keep-alive agent + timeout/retry
- `worker/src/engine.ts` audited for batchable writes; heartbeat + symbol_state made fire-and-forget
- `src/routes/api/public/worker-sync.ts` gains timestamp check + per-caller rate limit
- New migration for `worker_audit` table (if you want the audit log — say the word and I'll include it, otherwise I'll skip)

## Question before I build
Do you want **all of the above** (full hardening pass), or just the **minimum** — docs + todo cleanup + keep-alive/timeout — and defer the rate-limit/audit-log work until you actually see a problem?
