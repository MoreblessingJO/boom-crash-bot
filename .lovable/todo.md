# TODO

## Path A — Migrate worker to direct Supabase service-role access
**Remind: 7 hours after 2026-07-01 (user request)**

Currently the DigitalOcean worker uses **Path B** (signed HTTP proxy via
`/api/public/worker-sync`). This works but adds latency (worker → Lovable app → DB).

To switch to Path A (direct DB, lower latency):
1. Contact Lovable support and request `SUPABASE_SERVICE_ROLE_KEY` for project
   `lizlrjoyvsgkxadxuthy` (external worker use case).
2. On the droplet, edit `/opt/bnc/worker/.env`:
   ```
   SUPABASE_URL=https://lizlrjoyvsgkxadxuthy.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<the key from support>
   ```
3. Restore the original direct-Supabase `worker/src/db.ts` (see git history —
   the Path B version replaced it).
4. `npm run build && pm2 restart bnc-worker`.
