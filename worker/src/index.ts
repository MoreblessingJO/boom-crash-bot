import "dotenv/config";
import { DerivWS } from "./deriv-ws.js";
import { Engine } from "./engine.js";
import { SYMBOLS } from "./symbols.js";

// Never let a transient DB/WS failure kill the worker; PM2 restarts are noisy
// and lose in-memory buffers. Log and keep running.
process.on("unhandledRejection", (reason) => {
  const msg = reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason);
  console.warn(`[proc] unhandledRejection: ${msg}`);
});
process.on("uncaughtException", (err) => {
  console.warn(`[proc] uncaughtException: ${err.name}: ${err.message}`);
});

async function main() {
  console.log(`[boot] bnc-worker starting · pid=${process.pid}`);
  const engine = new Engine();
  await engine.bootstrap();

  const seen = new Set<string>();
  const ws = new DerivWS({
    onTick: (sym, tick) => {
      seen.add(sym);
      engine.setConnectedCount(seen.size);
      engine.onTick(sym, tick).catch((e) => console.warn(`[engine] tick error ${sym}`, e));
    },
    onConnect: async () => {
      // Hydrate buffers, then subscribe to live ticks.
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

  // 5-second heartbeat
  setInterval(() => { void engine.heartbeat("live"); }, 5000);

  // Reload open positions every 30s in case UI manually closes one
  setInterval(() => { void engine.loadOpenPositions(); }, 30_000);

  const shutdown = (sig: string) => {
    console.log(`[boot] ${sig} received, shutting down`);
    ws.stop();
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
