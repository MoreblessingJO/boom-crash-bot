// Per-tick engine. Maintains in-memory tick buffers and reacts in real time.
import { db } from "./db.js";
import { SYMBOLS, type SymbolDef } from "./symbols.js";
import {
  computeState, localSignal, bucketKey, confidenceFloor, isBucketDisabled,
  type ComputedState, type Direction, type RawTick,
} from "./strategy.js";

const EWMA_ALPHA = 0.15;
const MIN_PRE_SPIKE_R = 1.0;
const STATE_WRITE_THROTTLE_MS = 1000;
const SETTINGS_REFRESH_MS = 10_000;
const BUCKETS_REFRESH_MS = 10_000;
const DAILY_PNL_REFRESH_MS = 30_000;

interface Settings {
  mode: string; stake: number; tp_r: number; sl_r: number;
  pre_spike_ratio: number; late_entry_ratio: number; max_hold_ratio: number;
  max_daily_loss: number; kill_switch: boolean; learning_enabled: boolean;
  enabled_symbols: string[]; paper_balance: number; risk_pct: number;
  external_worker_enabled: boolean;
}
interface Position {
  id: string; symbol: string; side: Direction; regime: string;
  entry_price: number; stake: number; tp_r: number; sl_r: number;
  unit: number; opened_epoch: number;
}
interface Bucket {
  bucket_key: string; symbol: string; regime: string; direction: string;
  trades: number; wins: number; losses: number; ewma_r: number; disabled: boolean;
}

export class Engine {
  private buffers = new Map<string, RawTick[]>();
  private bufferLimits = new Map<string, number>();
  private openBySym = new Map<string, Position>();
  private settings: Settings | null = null;
  private buckets = new Map<string, Bucket>();
  private dailyPnl = 0;
  private lastStateWrite = new Map<string, number>();
  private lastSettingsLoad = 0;
  private lastBucketsLoad = 0;
  private lastDailyLoad = 0;
  private symbolsConnected = 0;

  setConnectedCount(n: number) { this.symbolsConnected = n; }

  async hydrateBuffer(sym: SymbolDef, ticks: RawTick[]) {
    const limit = Math.min(5000, Math.max(300, sym.avgSpikeTicks * 3));
    this.bufferLimits.set(sym.code, limit);
    this.buffers.set(sym.code, ticks.slice(-limit));
  }

  async loadOpenPositions() {
    const { data } = await db().from("positions").select("*").eq("status", "open");
    this.openBySym.clear();
    for (const p of (data ?? []) as Position[]) this.openBySym.set(p.symbol, p);
  }

  private async refreshSettings(force = false) {
    if (!force && Date.now() - this.lastSettingsLoad < SETTINGS_REFRESH_MS) return;
    this.lastSettingsLoad = Date.now();
    const { data } = await db().from("settings").select("*").eq("id", 1).maybeSingle();
    if (data) this.settings = data as Settings;
  }

  private async refreshBuckets(force = false) {
    if (!force && Date.now() - this.lastBucketsLoad < BUCKETS_REFRESH_MS) return;
    this.lastBucketsLoad = Date.now();
    const { data } = await db().from("learning_buckets").select("*");
    this.buckets.clear();
    for (const b of (data ?? []) as Bucket[]) this.buckets.set(b.bucket_key, b);
  }

  private async refreshDailyPnl(force = false) {
    if (!force && Date.now() - this.lastDailyLoad < DAILY_PNL_REFRESH_MS) return;
    this.lastDailyLoad = Date.now();
    const since = new Date(); since.setUTCHours(0, 0, 0, 0);
    const { data } = await db().from("positions").select("pnl")
      .eq("status", "closed").gte("closed_at", since.toISOString());
    const rows = (data ?? []) as Array<{ pnl: number | null }>;
    this.dailyPnl = rows.reduce((s, p) => s + Number(p.pnl ?? 0), 0);
  }

  async bootstrap() {
    await this.refreshSettings(true);
    await this.refreshBuckets(true);
    await this.refreshDailyPnl(true);
    await this.loadOpenPositions();
  }

  // Called on EVERY live tick — must stay cheap.
  async onTick(symCode: string, tick: RawTick) {
    const sym = SYMBOLS.find((s) => s.code === symCode);
    if (!sym) return;
    const buf = this.buffers.get(symCode);
    if (!buf) return;
    buf.push(tick);
    const limit = this.bufferLimits.get(symCode) ?? 1000;
    if (buf.length > limit) buf.splice(0, buf.length - limit);

    // Cheap periodic refreshes
    void this.refreshSettings();
    void this.refreshBuckets();
    void this.refreshDailyPnl();

    if (!this.settings) return;
    if (this.settings.kill_switch) return;
    if (this.dailyPnl <= -Math.abs(this.settings.max_daily_loss)) return;
    if (!this.settings.enabled_symbols.includes(symCode)) return;

    const state = computeState(buf);

    // Throttled DB write of symbol_state so the UI reflects live data
    const now = Date.now();
    if ((this.lastStateWrite.get(symCode) ?? 0) + STATE_WRITE_THROTTLE_MS < now) {
      this.lastStateWrite.set(symCode, now);
      void db().from("symbol_state").upsert({
        symbol: symCode,
        last_epoch: state.lastEpoch,
        last_price: state.lastPrice,
        ticks_since_spike: state.ticksSinceSpike,
        last_spike_epoch: state.lastSpikeEpoch,
        median_abs_change: state.medianAbsChange,
        rsi: state.rsi, ema_fast: state.emaFast, ema_slow: state.emaSlow,
        recent_ticks: buf.slice(-60),
        updated_at: new Date().toISOString(),
      });
    }

    // 1) Manage open position
    const open = this.openBySym.get(symCode);
    if (open) {
      const closed = await this.maybeClose(open, state, sym.avgSpikeTicks);
      if (closed) {
        this.openBySym.delete(symCode);
        if (this.settings.learning_enabled) {
          await this.updateBucket(open.symbol, open.regime, open.side, closed.realized_r);
        }
        // Force daily P&L refresh after a close
        this.lastDailyLoad = 0;
      }
      return;
    }

    // 2) Consider new entry
    if (this.settings.mode === "signals") return;
    const sig = localSignal(sym, state);
    if (!sig.direction || sig.regime === "wait") return;

    const dueRatio = state.ticksSinceSpike / sym.avgSpikeTicks;
    if (sig.regime === "spike-anticipation" && dueRatio > this.settings.late_entry_ratio) return;

    if (this.settings.learning_enabled) {
      const b = this.buckets.get(bucketKey(symCode, sig.regime, sig.direction));
      if (b?.disabled) return;
      const floor = confidenceFloor(b?.trades ?? 0, b?.ewma_r ?? 0);
      if (sig.confidence < floor) return;
    } else if (sig.confidence < 0.5) return;

    const unit = Math.max(state.medianAbsChange * 5, state.lastPrice * 0.0005);
    if (!isFinite(unit) || unit <= 0) return;

    const riskPct = Number(this.settings.risk_pct ?? 0);
    const balance = Number(this.settings.paper_balance ?? 0);
    const slR = Number(this.settings.sl_r) || 1;
    const autoStake = riskPct > 0 && balance > 0
      ? (balance * riskPct) / slR
      : this.settings.stake;
    const stake = Math.max(0.35, Number(autoStake.toFixed(2)));

    const { data: inserted, error } = await db().from("positions").insert({
      symbol: symCode, side: sig.direction, regime: sig.regime,
      entry_price: state.lastPrice, stake,
      tp_r: this.settings.tp_r, sl_r: this.settings.sl_r,
      unit, status: "open", reason: sig.reason,
      confidence: sig.confidence, opened_epoch: state.lastEpoch,
    }).select("*").maybeSingle();
    if (error) { console.warn(`[engine] insert position failed`, error.message); return; }
    if (inserted) {
      this.openBySym.set(symCode, inserted as Position);
      console.log(`[engine] OPEN ${symCode} ${sig.direction} @${state.lastPrice} stake=${stake} regime=${sig.regime} conf=${sig.confidence.toFixed(2)}`);
    }

    void db().from("signals").insert({
      symbol: symCode, regime: sig.regime, direction: sig.direction,
      confidence: sig.confidence, reason: sig.reason, acted: true,
    });
  }

  private async maybeClose(pos: Position, state: ComputedState, avgSpikeTicks: number) {
    const dir = pos.side === "BUY" ? 1 : -1;
    const moved = (state.lastPrice - pos.entry_price) * dir;
    const r = moved / pos.unit;
    const tpHit = r >= pos.tp_r;
    const slHit = r <= -pos.sl_r;
    const elapsedTicks = Math.max(0, state.lastEpoch - pos.opened_epoch);
    const preSpikeExit = pos.regime === "spike-anticipation"
      && (state.ticksSinceSpike / avgSpikeTicks) >= (this.settings?.pre_spike_ratio ?? 0.8)
      && r >= MIN_PRE_SPIKE_R;
    const timeStop = elapsedTicks >= avgSpikeTicks * (this.settings?.max_hold_ratio ?? 1.2);

    if (!(tpHit || slHit || preSpikeExit || timeStop)) return null;

    // Honor SL as hard downside ceiling; upside UNCAPPED so winners
    // that gap past TP realize the actual gain (no more $20 ceiling).
    const cappedMoved = Math.max(moved, -pos.sl_r * pos.unit);
    const pnl = cappedMoved * pos.stake;
    const realized_r = pos.unit > 0 ? cappedMoved / pos.unit : 0;
    const exit_reason = tpHit ? "TP" : slHit ? "SL" : preSpikeExit ? "PRE_SPIKE" : "TIME_STOP";

    await db().from("positions").update({
      status: "closed", exit_price: state.lastPrice,
      closed_epoch: state.lastEpoch, closed_at: new Date().toISOString(),
      pnl, realized_r, exit_reason,
    }).eq("id", pos.id);
    console.log(`[engine] CLOSE ${pos.symbol} ${exit_reason} r=${realized_r.toFixed(2)} pnl=${pnl.toFixed(2)}`);
    return { realized_r, pnl, exit_reason };
  }

  private async updateBucket(symbol: string, regime: string, direction: string, realizedR: number) {
    const key = bucketKey(symbol, regime, direction);
    const b = this.buckets.get(key) ?? {
      bucket_key: key, symbol, regime, direction,
      trades: 0, wins: 0, losses: 0, ewma_r: 0, disabled: false,
    };
    b.trades += 1;
    if (realizedR > 0) b.wins += 1; else if (realizedR < 0) b.losses += 1;
    b.ewma_r = b.ewma_r * (1 - EWMA_ALPHA) + realizedR * EWMA_ALPHA;
    b.disabled = isBucketDisabled(b.trades, b.ewma_r);
    this.buckets.set(key, b);
    await db().from("learning_buckets").upsert({ ...b, updated_at: new Date().toISOString() });
  }

  async heartbeat(status: string) {
    let lastTickEpoch: number | null = null;
    for (const buf of this.buffers.values()) {
      const t = buf[buf.length - 1];
      if (t && (lastTickEpoch === null || t.epoch > lastTickEpoch)) lastTickEpoch = t.epoch;
    }
    await db().from("engine_heartbeat").upsert({
      id: 1, status, last_tick_epoch: lastTickEpoch,
      symbols_connected: this.symbolsConnected,
      updated_at: new Date().toISOString(),
    });
  }
}
