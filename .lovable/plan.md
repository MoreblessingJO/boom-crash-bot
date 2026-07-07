
## What that error means

`fatal: not a git repository` means the folder you ran `git pull` in on the droplet was never cloned from GitHub — it's just a directory with files in it. Nothing to pull from. This usually happens when the worker was uploaded via `scp`/`rsync`/manual copy the first time instead of `git clone`.

You have three ways forward. Pick one.

## Option A — Convert the droplet folder into a real git clone (recommended)

Best if the project is already on GitHub (or you're willing to connect it).

On the droplet:

```bash
cd /opt/bnc-worker      # or wherever the worker lives — confirm with: pm2 info bnc-worker
mv worker worker.bak    # keep a safety copy of the current files
cd /opt
git clone <YOUR_REPO_URL> bnc
cd bnc/worker
npm ci
cp /opt/bnc-worker.bak/.env .env   # reuse the working .env
npm run build
pm2 restart bnc-worker
pm2 logs bnc-worker --lines 50
```

From then on, `git pull && npm ci && npm run build && pm2 restart bnc-worker` works.

**If the repo isn't on GitHub yet:** connect it first via Lovable → Plus (+) menu → GitHub → Connect project. Takes 30 seconds.

## Option B — Copy just the 3 changed files up manually (fastest, no git needed)

Only 3 files changed on the Lovable side. From your local Windows PowerShell (or WSL):

```powershell
scp worker/src/db.ts               root@<DROPLET_IP>:/opt/bnc-worker/src/db.ts
scp worker/README.md               root@<DROPLET_IP>:/opt/bnc-worker/README.md
# The endpoint change lives on the Lovable app, not the droplet — nothing to copy for that.
```

Then on the droplet:

```bash
cd /opt/bnc-worker
npm run build
pm2 restart bnc-worker
pm2 logs bnc-worker --lines 50
```

You'll need to repeat this dance for every future update — which is why Option A is better long-term.

## Option C — Blow it away and re-clone fresh

Only if the droplet folder has drifted and you don't trust it:

```bash
pm2 stop bnc-worker
mv /opt/bnc-worker /opt/bnc-worker.old
cd /opt
git clone <YOUR_REPO_URL> bnc-worker
cd bnc-worker
npm ci
cp /opt/bnc-worker.old/.env .env
npm run build
pm2 restart bnc-worker
```

## What I need from you to pick

1. **Is the project connected to GitHub?** (Lovable → Plus menu → GitHub tells you.)
2. **Which option do you want** — A (convert to git), B (scp the 2 files), or C (fresh clone)?

Once you say, I'll walk you through the exact commands for your setup and confirm the worker comes back green in the EngineStatus badge.
