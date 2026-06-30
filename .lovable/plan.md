
# Deploy Worker to DigitalOcean Droplet

You'll run these commands yourself on the droplet — I'll guide you step by step. Nothing in the Lovable codebase needs to change for this milestone; everything is already wired (`worker/` directory, `external_worker_enabled` flag, `engine_heartbeat` table, `EngineStatus` badge).

## Step 1 — SSH into the droplet

From your local PowerShell:

```bash
ssh root@<YOUR_DROPLET_IP>
```

Accept the fingerprint on first connect.

## Step 2 — Provision Ubuntu (one-time)

```bash
apt update && apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs git
npm install -g pm2
node -v && npm -v && pm2 -v
```

## Step 3 — Clone the repo

Replace with your GitHub URL:

```bash
cd /opt
git clone https://github.com/<your-user>/<your-repo>.git bnc
cd bnc/worker
npm install
npm run build
```

## Step 4 — Configure secrets

```bash
cp .env.example .env
nano .env
```

Fill in:
- `SUPABASE_URL` — I'll give you the value from the Lovable backend
- `SUPABASE_SERVICE_ROLE_KEY` — I'll walk you through pulling this from Project Settings → Secrets in Lovable Cloud (it's the `SUPABASE_SERVICE_ROLE_KEY` runtime secret)

Save (Ctrl+O, Enter, Ctrl+X).

## Step 5 — Launch under PM2

```bash
mkdir -p logs
pm2 start ecosystem.config.cjs
pm2 logs bnc-worker --lines 50
```

You should see:
```
[boot] bnc-worker starting · pid=...
[boot] BOOM1000 hydrated N ticks, subscribed
[boot] CRASH1000 hydrated N ticks, subscribed
...
```

Press Ctrl+C to exit logs (worker keeps running).

## Step 6 — Make it survive reboots

```bash
pm2 save
pm2 startup systemd -u root --hp /root
# pm2 prints a command — copy/paste/run it
```

## Step 7 — Flip the switch in Lovable

Once the worker is alive, in the Lovable app:
1. Open **Control Panel**
2. Toggle **External Worker** ON
3. The **EngineStatus** badge in the header should turn **green** (heartbeat <30s old)
4. The in-browser cron stands down — droplet is now the brain

## Verification

```text
pm2 status              → bnc-worker = online
pm2 logs bnc-worker     → live tick activity, OPEN/CLOSE events
Lovable header badge    → green "Worker live"
Positions panel         → updates even with browser closed
```

## What I'll do during execution

- Hand you the exact `SUPABASE_URL` and walk you through retrieving the service-role key
- Debug any boot errors from `pm2 logs` output you paste back
- Confirm heartbeat is green and trades are flowing from the droplet

No code changes in this step — purely deployment.
