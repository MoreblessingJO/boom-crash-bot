# TODO

## Architecture: Path B (signed HTTP proxy) — permanent

Lovable Cloud does **not** expose `SUPABASE_SERVICE_ROLE_KEY` to users or
support (platform policy, confirmed 2026-07-04). Path A (worker → Supabase
direct with service role) is therefore permanently off the table.

The DigitalOcean worker uses Path B: it signs each batch of DB ops with
HMAC-SHA256 (`WORKER_SHARED_SECRET`, includes a `ts` for replay protection)
and POSTs to `/api/public/worker-sync`, which executes them via
`supabaseAdmin` server-side.

Hardening in place:
- Signed payload includes `ts`; server rejects requests >30 s old.
- Worker uses a keep-alive `undici` Agent (no per-request TLS handshake).
- 3 s request timeout + one retry with jitter on network / timeout errors.
- Hot-path writes (`symbol_state`, `signals`) are fire-and-forget.

Deferred (open only if we actually see a problem):
- Per-caller rate limit on `/api/public/worker-sync`.
- Structured `worker_audit` table for op-level tracing.
