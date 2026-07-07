// Authenticated Deriv WebSocket for order placement, portfolio, and contract
// state. Separate from the anonymous ticks WS so a token issue can't kill the
// price feed.
import WebSocket from "ws";

const APP_ID = process.env.DERIV_APP_ID ?? "1089";
const URL_ = `wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}`;

export interface AuthorizeInfo {
  loginid: string;
  balance: number;
  currency: string;
  is_virtual: boolean;
}

export interface BuyResult {
  contract_id: string;
  buy_price: number;
  transaction_id: string;
  start_time: number;
  longcode: string;
}

export interface PortfolioContract {
  contract_id: string;
  symbol: string;
  contract_type: string;
  buy_price: number;
  purchase_time: number;
  longcode: string;
}

interface Pending {
  resolve: (v: any) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class DerivAuthWS {
  private ws: WebSocket | null = null;
  private reqId = 1;
  private pending = new Map<number, Pending>();
  private token: string | null = null;
  private connected = false;
  private authorized: AuthorizeInfo | null = null;
  private alive = true;
  private pingTimer: NodeJS.Timeout | null = null;
  private backoffMs = 1000;

  setToken(token: string) { this.token = token; }
  getAuthorized(): AuthorizeInfo | null { return this.authorized; }
  isReady(): boolean { return this.connected && !!this.authorized; }

  start() { if (this.token) this.connect(); }
  stop() {
    this.alive = false;
    if (this.pingTimer) clearInterval(this.pingTimer);
    try { this.ws?.close(); } catch { /* noop */ }
  }

  private connect() {
    if (!this.alive || !this.token) return;
    console.log(`[deriv-auth] connecting…`);
    const ws = new WebSocket(URL_);
    this.ws = ws;
    this.connected = false;
    this.authorized = null;

    ws.on("open", async () => {
      console.log(`[deriv-auth] open, authorizing`);
      this.connected = true;
      this.backoffMs = 1000;
      try {
        const res = await this.request({ authorize: this.token });
        if (res.error) {
          console.warn(`[deriv-auth] authorize failed: ${res.error.message}`);
          this.stop();
          return;
        }
        this.authorized = {
          loginid: res.authorize.loginid,
          balance: Number(res.authorize.balance),
          currency: res.authorize.currency,
          is_virtual: !!res.authorize.is_virtual,
        };
        console.log(`[deriv-auth] authorized as ${this.authorized.loginid} bal=${this.authorized.balance} ${this.authorized.currency}`);
        // Subscribe to balance updates
        this.send({ balance: 1, subscribe: 1 }).catch(() => {});
      } catch (e) {
        console.warn(`[deriv-auth] authorize threw`, (e as Error).message);
      }

      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => {
        try { ws.send(JSON.stringify({ ping: 1 })); } catch { /* noop */ }
      }, 30_000);
    });

    ws.on("message", (data) => {
      let msg: any;
      try { msg = JSON.parse(data.toString()); } catch { return; }

      // Async balance updates
      if (msg.msg_type === "balance" && msg.balance && !msg.req_id) {
        if (this.authorized) this.authorized.balance = Number(msg.balance.balance);
        return;
      }

      const p = this.pending.get(msg.req_id);
      if (p) {
        this.pending.delete(msg.req_id);
        clearTimeout(p.timer);
        p.resolve(msg);
      }
    });

    const onDown = (why: string) => {
      console.warn(`[deriv-auth] disconnect (${why})`);
      if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
      this.connected = false;
      this.authorized = null;
      for (const [, p] of this.pending) {
        clearTimeout(p.timer);
        p.reject(new Error(`disconnected: ${why}`));
      }
      this.pending.clear();
      if (!this.alive) return;
      const wait = this.backoffMs;
      this.backoffMs = Math.min(this.backoffMs * 2, 30_000);
      setTimeout(() => this.connect(), wait);
    };
    ws.on("close", () => onDown("close"));
    ws.on("error", (e) => { console.warn(`[deriv-auth] ws error`, e.message); onDown("error"); });
  }

  private send(payload: object): Promise<any> {
    return this.request(payload);
  }

  request(payload: object, timeoutMs = 15_000): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error("auth-ws not open")); return;
      }
      const req_id = ++this.reqId;
      const timer = setTimeout(() => {
        if (this.pending.has(req_id)) {
          this.pending.delete(req_id);
          reject(new Error(`request timeout`));
        }
      }, timeoutMs);
      this.pending.set(req_id, { resolve, reject, timer });
      try {
        this.ws.send(JSON.stringify({ ...payload, req_id }));
      } catch (e) {
        this.pending.delete(req_id);
        clearTimeout(timer);
        reject(e as Error);
      }
    });
  }

  // Rise/Fall 5-tick contract, matching current strategy.
  async buy(symbol: string, dir: "BUY" | "SELL", stake: number): Promise<BuyResult> {
    const contract_type = dir === "BUY" ? "CALL" : "PUT";
    const proposal = await this.request({
      proposal: 1, amount: stake, basis: "stake", contract_type,
      currency: this.authorized?.currency ?? "USD",
      duration: 5, duration_unit: "t", symbol,
    });
    if (proposal.error) throw new Error(`proposal: ${proposal.error.message}`);
    const id = proposal.proposal?.id;
    if (!id) throw new Error("proposal: no id");

    const buy = await this.request({ buy: id, price: stake });
    if (buy.error) throw new Error(`buy: ${buy.error.message}`);
    const b = buy.buy;
    return {
      contract_id: String(b.contract_id),
      buy_price: Number(b.buy_price),
      transaction_id: String(b.transaction_id),
      start_time: Number(b.start_time),
      longcode: String(b.longcode ?? ""),
    };
  }

  async portfolio(): Promise<PortfolioContract[]> {
    const res = await this.request({ portfolio: 1 });
    if (res.error) throw new Error(`portfolio: ${res.error.message}`);
    const contracts = (res.portfolio?.contracts ?? []) as any[];
    return contracts.map((c) => ({
      contract_id: String(c.contract_id),
      symbol: String(c.symbol),
      contract_type: String(c.contract_type),
      buy_price: Number(c.buy_price),
      purchase_time: Number(c.purchase_time),
      longcode: String(c.longcode ?? ""),
    }));
  }

  async openContract(contractId: string): Promise<any> {
    const res = await this.request({ proposal_open_contract: 1, contract_id: contractId });
    if (res.error) throw new Error(`poc: ${res.error.message}`);
    return res.proposal_open_contract;
  }

  async sell(contractId: string, price = 0): Promise<any> {
    const res = await this.request({ sell: contractId, price });
    if (res.error) throw new Error(`sell: ${res.error.message}`);
    return res.sell;
  }
}
