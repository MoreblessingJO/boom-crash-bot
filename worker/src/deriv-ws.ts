// Persistent Deriv WebSocket client with auto-reconnect and exponential backoff.
import WebSocket from "ws";
import type { RawTick } from "./strategy.js";

// The WebSocket API only accepts the NUMERIC app_id. The OAuth client id
// (alphanumeric) is a different credential and must never be used here —
// passing it makes Deriv reject the socket, which shows up as 0 symbols connected.
const RAW_APP_ID = process.env.DERIV_WS_APP_ID ?? process.env.DERIV_APP_ID ?? "1089";
const APP_ID = /^\d+$/.test(RAW_APP_ID) ? RAW_APP_ID : "1089";
if (APP_ID !== RAW_APP_ID) {
  console.warn(`[deriv] DERIV_APP_ID "${RAW_APP_ID}" is not numeric — falling back to app_id=1089 for the tick feed. Set DERIV_WS_APP_ID to your numeric Deriv app id.`);
}
const URL = `wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}`;

type TickHandler = (symbol: string, tick: RawTick) => void;
type HistoryResolver = (ticks: RawTick[]) => void;

export class DerivWS {
  private ws: WebSocket | null = null;
  private reqId = 1000;
  private historyWaits = new Map<number, HistoryResolver>();
  private subscriptions = new Set<string>(); // symbols to (re)subscribe on connect
  private onTick: TickHandler;
  private onConnect: () => void;
  private onDisconnect: () => void;
  private backoffMs = 1000;
  private alive = true;
  private pingTimer: NodeJS.Timeout | null = null;

  constructor(opts: { onTick: TickHandler; onConnect: () => void; onDisconnect: () => void }) {
    this.onTick = opts.onTick;
    this.onConnect = opts.onConnect;
    this.onDisconnect = opts.onDisconnect;
  }

  start() { this.connect(); }

  stop() {
    this.alive = false;
    if (this.pingTimer) clearInterval(this.pingTimer);
    try { this.ws?.close(); } catch { /* noop */ }
  }

  private connect() {
    if (!this.alive) return;
    console.log(`[deriv] connecting…`);
    const ws = new WebSocket(URL);
    this.ws = ws;

    ws.on("open", () => {
      console.log(`[deriv] open`);
      this.backoffMs = 1000;
      this.onConnect();
      // Re-subscribe everything
      for (const s of this.subscriptions) this.sendSubscribe(s);
      // Ping every 30s to keep connection alive
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => {
        try { ws.send(JSON.stringify({ ping: 1 })); } catch { /* noop */ }
      }, 30_000);
    });

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.msg_type === "tick" && msg.tick) {
          this.onTick(msg.tick.symbol, { epoch: Number(msg.tick.epoch), quote: Number(msg.tick.quote) });
          return;
        }
        if (msg.msg_type === "history" && msg.history) {
          const resolver = this.historyWaits.get(msg.req_id);
          if (resolver) {
            this.historyWaits.delete(msg.req_id);
            const { prices, times } = msg.history;
            resolver(prices.map((p: number, i: number) => ({
              epoch: Number(times[i]), quote: Number(p),
            })));
          }
          return;
        }
        if (msg.error) console.warn(`[deriv] error`, msg.error);
      } catch (e) {
        console.warn(`[deriv] parse error`, e);
      }
    });

    const onDown = (why: string) => {
      console.warn(`[deriv] disconnect (${why})`);
      if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
      this.onDisconnect();
      if (!this.alive) return;
      const wait = this.backoffMs;
      this.backoffMs = Math.min(this.backoffMs * 2, 30_000);
      setTimeout(() => this.connect(), wait);
    };
    ws.on("close", () => onDown("close"));
    ws.on("error", (e) => { console.warn(`[deriv] ws error`, e.message); onDown("error"); });
  }

  fetchHistory(symbol: string, count: number, timeoutMs = 10_000): Promise<RawTick[]> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error("WS not open")); return;
      }
      const req_id = ++this.reqId;
      this.historyWaits.set(req_id, resolve);
      const timer = setTimeout(() => {
        if (this.historyWaits.has(req_id)) {
          this.historyWaits.delete(req_id);
          reject(new Error(`history timeout ${symbol}`));
        }
      }, timeoutMs);
      const onResolveCleanup = (orig: HistoryResolver): HistoryResolver => (ticks) => {
        clearTimeout(timer); orig(ticks);
      };
      this.historyWaits.set(req_id, onResolveCleanup(resolve));
      this.ws.send(JSON.stringify({
        ticks_history: symbol, adjust_start_time: 1, count,
        end: "latest", style: "ticks", req_id,
      }));
    });
  }

  subscribe(symbol: string) {
    this.subscriptions.add(symbol);
    if (this.ws?.readyState === WebSocket.OPEN) this.sendSubscribe(symbol);
  }

  private sendSubscribe(symbol: string) {
    try { this.ws!.send(JSON.stringify({ ticks: symbol, subscribe: 1 })); } catch { /* noop */ }
  }
}
