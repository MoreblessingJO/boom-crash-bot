// Lightweight Deriv WebSocket client (browser-only).
// Uses Deriv's public app_id 1089 for tick streaming.
// Live trading requires a user-provided API token (authorize).

export interface Tick {
  symbol: string;
  epoch: number;   // seconds
  quote: number;
}

type Listener = (tick: Tick) => void;

const DERIV_WS_URL = "wss://ws.derivws.com/websockets/v3?app_id=1089";

class DerivClient {
  private ws: WebSocket | null = null;
  private listeners = new Map<string, Set<Listener>>();
  private subscriptions = new Map<string, string>(); // symbol -> subscription id
  private pendingSubs = new Set<string>();
  private reqId = 1;
  private pending = new Map<number, (msg: any) => void>();
  private authToken: string | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  public onStatus: ((s: "connecting" | "open" | "closed") => void) | null = null;

  connect() {
    if (typeof window === "undefined") return;
    if (this.ws && this.ws.readyState <= 1) return;
    this.onStatus?.("connecting");
    this.ws = new WebSocket(DERIV_WS_URL);
    this.ws.onopen = () => {
      this.onStatus?.("open");
      if (this.authToken) this.send({ authorize: this.authToken });
      // Resubscribe to any active symbols
      for (const sym of this.pendingSubs) this.sendTickSub(sym);
      for (const sym of this.listeners.keys()) {
        if (!this.subscriptions.has(sym)) this.sendTickSub(sym);
      }
    };
    this.ws.onclose = () => {
      this.onStatus?.("closed");
      this.subscriptions.clear();
      this.scheduleReconnect();
    };
    this.ws.onerror = () => this.ws?.close();
    this.ws.onmessage = (e) => this.handleMessage(JSON.parse(e.data));
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 1500);
  }

  setAuthToken(token: string | null) {
    this.authToken = token;
    if (token && this.ws?.readyState === 1) this.send({ authorize: token });
  }

  private send(payload: any): number {
    const req_id = this.reqId++;
    const msg = { ...payload, req_id };
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(msg));
    return req_id;
  }

  request<T = any>(payload: any): Promise<T> {
    return new Promise((resolve) => {
      const id = this.send(payload);
      this.pending.set(id, resolve);
    });
  }

  private handleMessage(msg: any) {
    if (msg.req_id && this.pending.has(msg.req_id)) {
      this.pending.get(msg.req_id)!(msg);
      this.pending.delete(msg.req_id);
    }
    if (msg.msg_type === "tick" && msg.tick) {
      const t: Tick = {
        symbol: msg.tick.symbol,
        epoch: msg.tick.epoch,
        quote: Number(msg.tick.quote),
      };
      if (msg.subscription?.id)
        this.subscriptions.set(t.symbol, msg.subscription.id);
      this.listeners.get(t.symbol)?.forEach((fn) => fn(t));
    }
  }

  private sendTickSub(symbol: string) {
    this.send({ ticks: symbol, subscribe: 1 });
  }

  subscribe(symbol: string, fn: Listener): () => void {
    if (!this.listeners.has(symbol)) this.listeners.set(symbol, new Set());
    this.listeners.get(symbol)!.add(fn);
    if (this.ws?.readyState === 1 && !this.subscriptions.has(symbol)) {
      this.sendTickSub(symbol);
    } else {
      this.pendingSubs.add(symbol);
    }
    return () => {
      this.listeners.get(symbol)?.delete(fn);
      if (this.listeners.get(symbol)?.size === 0) {
        this.listeners.delete(symbol);
        const subId = this.subscriptions.get(symbol);
        if (subId) this.send({ forget: subId });
        this.subscriptions.delete(symbol);
      }
    };
  }

  async fetchHistory(symbol: string, count = 200): Promise<Tick[]> {
    if (this.ws?.readyState !== 1) return [];
    const res = await this.request<any>({
      ticks_history: symbol,
      adjust_start_time: 1,
      count,
      end: "latest",
      style: "ticks",
    });
    if (!res.history) return [];
    const { prices, times } = res.history;
    return prices.map((p: number, i: number) => ({
      symbol,
      epoch: Number(times[i]),
      quote: Number(p),
    }));
  }
}

let _client: DerivClient | null = null;
export function getDerivClient(): DerivClient {
  if (!_client) _client = new DerivClient();
  return _client;
}
