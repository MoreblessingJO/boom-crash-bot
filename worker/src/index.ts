import "dotenv/config";
import { DerivWS } from "./deriv-ws.js";
import { DerivAuthWS } from "./deriv-auth-ws.js";
import { Engine } from "./engine.js";
import { SYMBOLS } from "./symbols.js";
import { fetchOwnerDerivToken } from "./deriv-token.js";
import { startReconciler } from "./reconciler.js";
import { db } from "./db.js";

process.on("unhandledRejection", (reason) => {
  const msg = reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason);
  console.warn(`[proc] unhandledRejection: ${msg}`);
});
process.on("uncaughtException", (err) => {
  console.warn(`[proc] uncaughtException: ${err.name}: ${err.message}`);
});

const TOKEN_REFRESH_MS = 30 * 60 * 1000;

async function isLiveEnabled(): Promise<boolean> {
  try {
    const { data } = await db().from("settings").select("*").eq("id", 1).maybeSingle();
    return !!(data as any)?.is_live;
  } catch {
    return false;
  }
}

async function ensureAuthWs(authWs: DerivAuthWS, engine: Engine): Promise<void> {
  const live = await isLiveEnabled();
  if (!live) {
    if (authWs.isReady()) {
      console.log(`[boot] is_live=false — stopping auth ws`);
      authWs.stop();
    }
    engine.setAuthWs(null);
    return;
  }
  if (authWs.isReady()) return;
  const t = await fetchOwnerDerivToken();
  if (!t) {
    console.warn(`[boot] is_live=true but no owner Deriv token available`);
    return;
  }
  authWs.setToken(t.token);
  authWs.start();
  engine.setAuthWs(authWs);
  console.log(`[boot] auth ws starting for loginid=${t.loginid} type=${t.account_type}`);
}

async function main() {
  console.log(`[boot] bnc-worker starting · pid=${process.pid}`);
  const engine = new Engine();
  await engine.bootstrap();

  const authWs = new DerivAuthWS();
  await ensureAuthWs(authWs, engine);
  // Refresh token + auth ws periodically
  setInterval(() => { void ensureAuthWs(authWs, engine); }, TOKEN_REFRESH_MS);
  // Also re-check every 30s so toggling is_live in admin picks up fast
  setInterval(() => { void ensureAuthWs(authWs, engine); }, 30_000);

  // Start reconciliation loop (no-op while authWs not ready)
  startReconciler(authWs, 60_000);

  const seen = new Set<string>();
  const ws = new DerivWS({
    onTick: (sym, tick) => {
      seen.add(sym);
      engine.setConnectedCount(seen.size);
      engine.onTick(sym, tick).catch((e) => console.warn(`[engine] tick error ${sym}`, e));
    },
    onConnect: async () => {
      for (const s of SYMBOLS) {
        try {
          const count = Math.min(5000, Math.max(300, Math.round(s.avgSpikeTicks * 2.5)));
          const hist = await ws.fetchHistory(s.code, count);
          await engine.hydrateBuffer(s, hist);
          ws.subscribe(s.code);
          console.log(`[boot] ${s.code} hydrated ${hist.length} ticks, subscribed`);
        } catch (e) {
          console.warn(`[boot] hydrate failed ${s.code}`, (e as Error).message);
        }
      }
      await engine.heartbeat("live");
    },
    onDisconnect: () => {
      seen.clear();
      engine.setConnectedCount(0);
      void engine.heartbeat("disconnected");
    },
  });
  ws.start();

  setInterval(() => { void engine.heartbeat("live"); }, 5000);
  setInterval(() => { void engine.loadOpenPositions(); }, 30_000);

  const shutdown = (sig: string) => {
    console.log(`[boot] ${sig} received, shutting down`);
    ws.stop();
    authWs.stop();
    void engine.heartbeat("stopped");
    setTimeout(() => process.exit(0), 500);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((e) => {
  console.error("[boot] fatal", e);
  process.exit(1);
});
