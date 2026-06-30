# bnc-worker

Always-on Node worker for the Boom & Crash AI trading agent. Holds a
persistent WebSocket to Deriv, reacts to ticks within milliseconds, and writes
to the same Lovable Cloud Postgres that the dashboard reads from.

The Lovable app is the UI/control plane only. This worker is the brain.

## What it does

- Connects to `wss://ws.derivws.com/websockets/v3` with auto-reconnect (1s → 30s backoff).
- Subscribes to live ticks for all 6 Boom/Crash symbols.
- Keeps a per-symbol in-memory tick buffer sized `avgSpikeTicks × 3` (max 5000).
- On every tick: recompute state → manage open position (TP/SL/pre-spike/time-stop) → if flat, evaluate new entry through the learner gate.
- Writes `symbol_state` at most once per second per symbol (no DB hammering).
- Re-reads `settings` and `learning_buckets` every 10s so UI changes take effect without restart.
- Writes a row to `engine_heartbeat` every 5s so the dashboard shows a green/red status.

Strategy logic mirrors `src/lib/strategy.server.ts` and `src/lib/engine.server.ts`
in the Lovable app — keep them in sync if you tweak the math.

## One-time setup on a DigitalOcean Droplet

1. **Create the Droplet**
   - Ubuntu 24.04 LTS
   - Basic / Regular intel, **$6/mo** (1 vCPU, 1 GB RAM — plenty)
   - Region: `fra1` or `ams3` (closest to Deriv EU infra)
   - Add your SSH key

2. **SSH in and install deps**
   ```bash
   ssh root@<DROPLET_IP>
   curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
   apt-get install -y nodejs git
   npm i -g pm2
   ```

3. **Clone and configure**
   ```bash
   git clone <YOUR_REPO_URL> /opt/bnc-worker
   cd /opt/bnc-worker
   npm ci
   cp .env.example .env
   nano .env   # paste SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
   npm run build
   ```

4. **Launch under PM2**
   ```bash
   pm2 start ecosystem.config.cjs
   pm2 save
   pm2 startup        # run the command it prints — survives reboots
   pm2 logs bnc-worker
   ```

5. **Flip the Lovable app over to the worker**
   In the Supabase Table Editor (or via SQL), set
   `settings.external_worker_enabled = true` on the row with `id = 1`. The
   in-app 30s cron will stand down. The dashboard header should show
   **"Engine live · 6/6"** within a few seconds.

## Ops

```bash
pm2 logs bnc-worker --lines 200   # recent activity
pm2 monit                          # live CPU / memory
pm2 restart bnc-worker             # after pulling new code
pm2 reload bnc-worker              # zero-downtime restart
```

The worker auto-restarts on crash, on memory > 250 MB, and on Droplet reboot
(via the `pm2 startup` systemd hook). Heartbeat staleness > 30s in the UI
means the worker died — check `pm2 logs`.

## Updating

```bash
cd /opt/bnc-worker
git pull
npm ci
npm run build
pm2 restart bnc-worker
```

## What's NOT included (next milestone)

- Real Deriv order placement (paper mode only — fills are simulated at last tick price).
- Slippage modeling.
- Multi-region failover.
