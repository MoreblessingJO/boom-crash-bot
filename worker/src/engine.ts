// Per-tick multi-agent engine. Each active agent (Nicco, Nexx, 007, Sniper)
// evaluates every tick independently, opens its own positions tagged with
// agent_id, and its paper P&L accrues into agent_paper_ledgers via DB trigger.
// Only Nicco can run live-money (governed by settings.is_live). All other
// agents are always paper regardless of the global live toggle.
import { randomUUID } from "crypto";
import { db } from "./db.js";
import { SYMBOLS, type SymbolDef } from "./symbols.js";
import {
  computeState, bucketKey, confidenceFloor, isBucketDisabled,
  type ComputedState, type Direction, type RawTick,
} from "./strategy.js";
import { evaluateAgent, stakeMultiplier, type AgentRow, type AgentSignal } from "./strategies.js";
import type { DerivAuthWS } from "./deriv-auth-ws.js";
import { checkGuardrails, auditEvent, type Guardrails } from "./guardrails.js";

const EWMA_ALPHA = 0.15;
const STATE_WRITE_THROTTLE_MS = 1000;
const SETTINGS_REFRESH_MS = 10_000;
const BUCKETS_REFRESH_MS = 10_000;
const AGENTS_REFRESH_MS = 30_000;
const DAILY_PNL_REFRESH_MS = 30_000;
const BUY_COOLDOWN_MS = 3000;

function warnAsync(label: string, promise: PromiseLike<unknown>) {
  promise.then(undefined, (e) => console.warn(`[engine] ${label}`, e instanceof Error ? e.message : e));
}

interface Settings extends Guardrails {
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
  agent_id?: string | null;
  slot?: string | null;
  deriv_contract_id?: string | null;
  status?: string;
}
interface Bucket {
  bucket_key: string; symbol: string; regime: string; direction: string;
  trades: number; wins: number; losses: number; ewma_r: number; disabled: boolean;
}

const key = (symbol: string, agentId: string, slot = "main") => `${symbol}|${agentId}|${slot}`;

export class Engine {
  private buffers = new Map<string, RawTick[]>();
  private bufferLimits = new Map<string, number>();
  private openByKey = new Map<string, Position>();      // "symbol|agentId" -> Position
  private lastBuyAt = new Map<string, number>();        // same key
  private settings: Settings | null = null;
  private buckets = new Map<string, Bucket>();
  private agents: AgentRow[] = [];
  private niccoId: string | null = null;
  private dailyPnl = 0;
  private lastStateWrite = new Map<string, number>();
  private lastSettingsLoad = 0;
  private lastBucketsLoad = 0;
  private lastAgentsLoad = 0;
  private lastDailyLoad = 0;
  private symbolsConnected = 0;
  private authWs: DerivAuthWS | null = null;

  setConnectedCount(n: number) { this.symbolsConnected = n; }
  setAuthWs(ws: DerivAuthWS | null) { this.authWs = ws; }

  async hydrateBuffer(sym: SymbolDef, ticks: RawTick[]) {
    // Multi-timeframe strategies (Nexx/007/Sniper) need up to 600-tick lookback,
    // so keep at least 3000 ticks per symbol.
    const limit = Math.min(5000, Math.max(3000, sym.avgSpikeTicks * 3));
    this.bufferLimits.set(sym.code, limit);
    this.buffers.set(sym.code, ticks.slice(-limit));
  }

  async loadOpenPositions() {
    const { data } = await db().from("positions").select("*").eq("status", "open");
    this.openByKey.clear();
    for (const p of (data ?? []) as Position[]) {
      if (!p.agent_id) continue;
      this.openByKey.set(key(p.symbol, p.agent_id), p);
    }
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

  private async refreshAgents(force = false) {
    if (!force && Date.now() - this.lastAgentsLoad < AGENTS_REFRESH_MS) return;
    this.lastAgentsLoad = Date.now();
    const { data } = await db().from("agents").select("id,slug,name,status,strategy_key,strategy_params")
      .eq("market", "boom_crash").eq("status", "live");
    this.agents = (data ?? []) as AgentRow[];
    this.niccoId = this.agents.find((a) => a.slug === "nicco")?.id ?? null;
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
    await this.refreshAgents(true);
    await this.refreshDailyPnl(true);
    await this.loadOpenPositions();
  }

  async onTick(symCode: string, tick: RawTick) {
    const sym = SYMBOLS.find((s) => s.code === symCode);
    if (!sym) return;
    const buf = this.buffers.get(symCode);
    if (!buf) return;
    buf.push(tick);
    const limit = this.bufferLimits.get(symCode) ?? 1000;
    if (buf.length > limit) buf.splice(0, buf.length - limit);

    warnAsync("refresh settings failed", this.refreshSettings());
    warnAsync("refresh buckets failed", this.refreshBuckets());
    warnAsync("refresh agents failed", this.refreshAgents());
    warnAsync("refresh daily pnl failed", this.refreshDailyPnl());

    if (!this.settings) return;
    if (this.settings.kill_switch) return;
    if (this.dailyPnl <= -Math.abs(this.settings.max_daily_loss)) return;
    if (!this.settings.enabled_symbols.includes(symCode)) return;

    const state = computeState(buf);

    const now = Date.now();
    if ((this.lastStateWrite.get(symCode) ?? 0) + STATE_WRITE_THROTTLE_MS < now) {
      this.lastStateWrite.set(symCode, now);
      warnAsync("symbol state write failed", db().from("symbol_state").upsert({
        symbol: symCode,
        last_epoch: state.lastEpoch,
        last_price: state.lastPrice,
        ticks_since_spike: state.ticksSinceSpike,
        last_spike_epoch: state.lastSpikeEpoch,
        median_abs_change: state.medianAbsChange,
        rsi: state.rsi, ema_fast: state.emaFast, ema_slow: state.emaSlow,
        recent_ticks: buf.slice(-60),
        updated_at: new Date().toISOString(),
      }));
    }

    // Evaluate every active agent for this symbol
    for (const agent of this.agents) {
      await this.tickAgent(agent, sym, state, now);
    }
  }

  private async tickAgent(agent: AgentRow, sym: SymbolDef, state: ComputedState, now: number) {
    const k = key(sym.code, agent.id);

    // 1) Manage open position for this agent+symbol
    const open = this.openByKey.get(k);
    if (open) {
      const closed = await this.maybeClose(open, state, sym.avgSpikeTicks);
      if (closed) {
        this.openByKey.delete(k);
        if (this.settings!.learning_enabled) {
          await this.updateBucket(open.symbol, open.regime, open.side, closed.realized_r);
        }
        this.lastDailyLoad = 0;
      }
      return;
    }

    if (this.settings!.mode === "signals") return;
    if ((this.lastBuyAt.get(k) ?? 0) + BUY_COOLDOWN_MS > now) return;

    const sig = evaluateAgent(agent, sym, state);
    if (!sig.direction || sig.regime === "wait") return;

    const dueRatio = state.ticksSinceSpike / sym.avgSpikeTicks;
    if (sig.regime === "spike-anticipation" && dueRatio > this.settings!.late_entry_ratio) return;

    if (this.settings!.learning_enabled) {
      const b = this.buckets.get(bucketKey(sym.code, sig.regime, sig.direction));
      if (b?.disabled) return;
      const floor = confidenceFloor(b?.trades ?? 0, b?.ewma_r ?? 0);
      if (sig.confidence < floor) return;
    } else if (sig.confidence < 0.5) return;

    const unit = Math.max(state.medianAbsChange * 5, state.lastPrice * 0.0005);
    if (!isFinite(unit) || unit <= 0) return;

    const riskPct = Number(this.settings!.risk_pct ?? 0);
    const balance = Number(this.settings!.paper_balance ?? 0);
    const slR = Number(this.settings!.sl_r) || 1;
    const autoStake = riskPct > 0 && balance > 0
      ? (balance * riskPct) / slR
      : this.settings!.stake;
    let stake = Math.max(0.35, Number((autoStake * stakeMultiplier(agent)).toFixed(2)));

    // Only Nicco can go live; every other agent is forced-paper
    const isLive = !!this.settings!.is_live && agent.id === this.niccoId;

    const openCount = Array.from(this.openByKey.values()).filter((p) => p.agent_id === agent.id).length;
    const equity = this.authWs?.getAuthorized()?.balance ?? null;
    const guards: Guardrails = {
      halt_engine: !!this.settings!.halt_engine,
      is_live: isLive,
      daily_loss_limit: Number(this.settings!.daily_loss_limit ?? 0),
      max_open_positions: Number(this.settings!.max_open_positions ?? 0),
      max_stake_per_trade: Number(this.settings!.max_stake_per_trade ?? 0),
      max_stake_pct_equity: Number(this.settings!.max_stake_pct_equity ?? 0),
    };
    const snapshot = { symbol: sym.code, agent: agent.slug, guards, dailyPnl: this.dailyPnl, equity };
    const gate = await checkGuardrails({
      symbol: sym.code, proposedStake: stake, equity,
      openOrPendingCount: openCount, dailyPnl: this.dailyPnl,
      guards, settingsSnapshot: snapshot,
    });
    if (!gate.ok) {
      // Only log for live to keep paper noise down
      if (isLive) console.log(`[engine] BLOCK ${agent.slug} ${sym.code} ${sig.direction}: ${gate.reason}`);
      return;
    }
    stake = gate.stake;
    this.lastBuyAt.set(k, now);

    if (isLive) {
      await this.openLive(agent, sym.code, sig, state, stake, unit, snapshot);
    } else {
      await this.openPaper(agent, sym.code, sig, state, stake, unit);
    }

    warnAsync("signal write failed", db().from("signals").insert({
      symbol: sym.code, regime: sig.regime, direction: sig.direction,
      confidence: sig.confidence, reason: sig.reason, acted: true,
      agent_id: agent.id,
    }));
  }

  private async openPaper(
    agent: AgentRow, symCode: string, sig: { direction: Direction | null; regime: string; confidence: number; reason: string },
    state: ComputedState, stake: number, unit: number,
  ) {
    if (!sig.direction || !this.settings) return;
    const { data: inserted, error } = await db().from("positions").insert({
      symbol: symCode, side: sig.direction, regime: sig.regime,
      entry_price: state.lastPrice, stake,
      tp_r: this.settings.tp_r, sl_r: this.settings.sl_r,
      unit, status: "open", reason: sig.reason,
      confidence: sig.confidence, opened_epoch: state.lastEpoch,
      client_req_id: randomUUID(),
      agent_id: agent.id,
    }).select("*").maybeSingle();
    if (error) { console.warn(`[engine] paper insert failed`, error.message); return; }
    if (inserted) {
      this.openByKey.set(key(symCode, agent.id), inserted as Position);
      console.log(`[engine] PAPER OPEN ${agent.slug} ${symCode} ${sig.direction} @${state.lastPrice} stake=${stake} conf=${sig.confidence.toFixed(2)}`);
    }
  }

  private async openLive(
    agent: AgentRow, symCode: string, sig: { direction: Direction | null; regime: string; confidence: number; reason: string },
    state: ComputedState, stake: number, unit: number, snapshot: unknown,
  ) {
    if (!sig.direction || !this.settings) return;
    if (!this.authWs || !this.authWs.isReady()) {
      console.warn(`[engine] LIVE requested but auth-ws not ready — skipping`);
      await auditEvent("LIVE_NO_AUTH", { symbol: symCode, stake, settings_snapshot: snapshot });
      return;
    }

    const clientReqId = randomUUID();
    const { data: pendingRaw, error: insErr } = await db().from("positions").insert({
      symbol: symCode, side: sig.direction, regime: sig.regime,
      entry_price: state.lastPrice, stake,
      tp_r: this.settings.tp_r, sl_r: this.settings.sl_r,
      unit, status: "pending", reason: sig.reason,
      confidence: sig.confidence, opened_epoch: state.lastEpoch,
      client_req_id: clientReqId, agent_id: agent.id,
    }).select("*").maybeSingle();
    if (insErr || !pendingRaw) {
      console.warn(`[engine] pending insert failed`, insErr?.message);
      return;
    }
    const pending = pendingRaw as Position;

    try {
      const buy = await this.authWs.buy(symCode, sig.direction, stake);
      await db().from("positions").update({
        status: "open", deriv_contract_id: buy.contract_id,
        entry_price: buy.buy_price, opened_epoch: buy.start_time,
      }).eq("id", pending.id);
      const open: Position = {
        ...(pending as Position), status: "open",
        entry_price: buy.buy_price, opened_epoch: buy.start_time,
        deriv_contract_id: buy.contract_id, agent_id: agent.id,
      };
      this.openByKey.set(key(symCode, agent.id), open);
      await auditEvent("LIVE_OPEN", {
        position_id: pending.id, contract_id: buy.contract_id, symbol: symCode,
        stake, entry: buy.buy_price, settings_snapshot: snapshot,
      });
      console.log(`[engine] LIVE OPEN ${agent.slug} ${symCode} ${sig.direction} contract=${buy.contract_id} price=${buy.buy_price}`);
    } catch (e) {
      const msg = (e as Error).message;
      console.warn(`[engine] LIVE buy failed ${symCode}: ${msg}`);
      await db().from("positions").update({
        status: "failed", exit_reason: `BUY_ERROR: ${msg.slice(0, 100)}`,
        closed_at: new Date().toISOString(),
      }).eq("id", pending.id);
      await auditEvent("LIVE_BUY_FAILED", {
        position_id: pending.id, symbol: symCode, stake,
        settings_snapshot: { error: msg, ...(snapshot as object) },
      });
    }
  }

  private async maybeClose(pos: Position, state: ComputedState, avgSpikeTicks: number) {
    if (this.settings?.is_live && pos.deriv_contract_id) return null;
    const dir = pos.side === "BUY" ? 1 : -1;
    const moved = (state.lastPrice - pos.entry_price) * dir;
    const r = moved / pos.unit;
    const tpHit = r >= pos.tp_r;
    const slHit = r <= -pos.sl_r;
    const elapsedTicks = Math.max(0, state.lastEpoch - pos.opened_epoch);
    const preSpikeExit = pos.regime === "spike-anticipation"
      && (state.ticksSinceSpike / avgSpikeTicks) >= (this.settings?.pre_spike_ratio ?? 0.8)
      && r >= 1.0;
    const timeStop = elapsedTicks >= avgSpikeTicks * (this.settings?.max_hold_ratio ?? 1.2);
    if (!(tpHit || slHit || preSpikeExit || timeStop)) return null;

    const cappedMoved = Math.max(moved, -pos.sl_r * pos.unit);
    const pnl = cappedMoved * pos.stake;
    const realized_r = pos.unit > 0 ? cappedMoved / pos.unit : 0;
    const exit_reason = tpHit ? "TP" : slHit ? "SL" : preSpikeExit ? "PRE_SPIKE" : "TIME_STOP";

    await db().from("positions").update({
      status: "closed", exit_price: state.lastPrice,
      closed_epoch: state.lastEpoch, closed_at: new Date().toISOString(),
      pnl, realized_r, exit_reason,
    }).eq("id", pos.id);
    console.log(`[engine] CLOSE ${pos.symbol} agent=${pos.agent_id?.slice(0,8)} ${exit_reason} r=${realized_r.toFixed(2)} pnl=${pnl.toFixed(2)}`);
    return { realized_r, pnl, exit_reason };
  }

  private async updateBucket(symbol: string, regime: string, direction: string, realizedR: number) {
    const k = bucketKey(symbol, regime, direction);
    const b = this.buckets.get(k) ?? {
      bucket_key: k, symbol, regime, direction,
      trades: 0, wins: 0, losses: 0, ewma_r: 0, disabled: false,
    };
    b.trades += 1;
    if (realizedR > 0) b.wins += 1; else if (realizedR < 0) b.losses += 1;
    b.ewma_r = b.ewma_r * (1 - EWMA_ALPHA) + realizedR * EWMA_ALPHA;
    b.disabled = isBucketDisabled(b.trades, b.ewma_r);
    this.buckets.set(k, b);
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
