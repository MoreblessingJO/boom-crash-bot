// Short-lived WebSocket fetch of Deriv tick history for the cron engine.
// Cloudflare Workers expose a global WebSocket constructor.

import type { RawTick } from "./strategy.server";

const DERIV_WS_URL = "wss://ws.derivws.com/websockets/v3?app_id=1089";

export async function fetchTicksHistory(
  symbol: string,
  count = 200,
  timeoutMs = 8000,
): Promise<RawTick[]> {
  return new Promise<RawTick[]>((resolve, reject) => {
    let settled = false;
    const finish = (val: RawTick[] | null, err?: Error) => {
      if (settled) return;
      settled = true;
      try { ws.close(); } catch { /* noop */ }
      if (err) reject(err);
      else resolve(val ?? []);
    };

    let ws: WebSocket;
    try {
      ws = new WebSocket(DERIV_WS_URL);
    } catch (err) {
      reject(err as Error);
      return;
    }

    const timer = setTimeout(() => finish(null, new Error(`Deriv history timeout for ${symbol}`)), timeoutMs);

    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({
        ticks_history: symbol,
        adjust_start_time: 1,
        count,
        end: "latest",
        style: "ticks",
        req_id: 1,
      }));
    });

    ws.addEventListener("message", (e: MessageEvent) => {
      try {
        const msg = JSON.parse(typeof e.data === "string" ? e.data : "");
        if (msg.error) { clearTimeout(timer); finish(null, new Error(msg.error.message)); return; }
        if (msg.history) {
          clearTimeout(timer);
          const { prices, times } = msg.history;
          const ticks: RawTick[] = prices.map((p: number, i: number) => ({
            epoch: Number(times[i]),
            quote: Number(p),
          }));
          finish(ticks);
        }
      } catch (err) {
        clearTimeout(timer);
        finish(null, err as Error);
      }
    });

    ws.addEventListener("error", () => {
      clearTimeout(timer);
      finish(null, new Error(`Deriv WS error for ${symbol}`));
    });

    ws.addEventListener("close", () => {
      if (!settled) { clearTimeout(timer); finish([]); }
    });
  });
}
