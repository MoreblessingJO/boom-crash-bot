// 24/7 trading engine. Runs from the cron endpoint.
// 1. Loads settings + open positions + learning buckets.
// 2. For each enabled symbol, fetches latest ticks from Deriv, computes state,
//    manages open position (TP/SL/pre-spike/time-stop), then evaluates entry.
// 3. Persists everything back to the DB.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { SYMBOLS, getSymbol } from "./symbols";
import { fetchTicksHistory } from "./deriv-history.server";
import {
  computeState, localSignal, bucketKey, confidenceFloor, isBucketDisabled,
  type ComputedState, type Direction,
} from "./strategy.server";

const EWMA_ALPHA = 0.15;

interface Position {
  id: string;
  symbol: string;
  side: Direction;
  regime: string;
  entry_price: number;
  stake: number;
  tp_r: number;
  sl_r: number;
  unit: number;
  opened_epoch: number;
}

interface Settings {
  mode: string;
  stake: number;
  tp_r: number;
  sl_r: number;
  pre_spike_ratio: number;
  late_entry_ratio: number;
  max_hold_ratio: number;
  max_daily_loss: number;
  kill_switch: boolean;
  learning_enabled: boolean;
  enabled_symbols: string[];
  paper_balance: number;
}

interface Bucket {
  bucket_key: string;
  symbol: string;
  regime: string;
  direction: string;
  trades: number;
  wins: number;
  losses: number;
  ewma_r: number;
  disabled: boolean;
}

export interface EngineRunResult {
  symbols_scanned: number;
  trades_opened: number;
  trades_closed: number;
  errors: string[];
}

export async function runEngine(): Promise<EngineRunResult> {
  const result: EngineRunResult = { symbols_scanned: 0, trades_opened: 0, trades_closed: 0, errors: [] };

  // Load settings
  const { data: settingsRow } = await supabaseAdmin.from("settings").select("*").eq("id", 1).maybeSingle();
  if (!settingsRow) { result.errors.push("Missing settings row"); return result; }
  const settings = settingsRow as Settings;

  if (settings.kill_switch) return result;

  // Daily P&L guard
  const since = new Date(); since.setUTCHours(0, 0, 0, 0);
  const { data: todayClosed } = await supabaseAdmin
    .from("positions")
    .select("pnl")
    .eq("status", "closed")
    .gte("closed_at", since.toISOString());
  const dailyPnl = (todayClosed ?? []).reduce((s, p) => s + Number(p.pnl ?? 0), 0);
  if (dailyPnl <= -Math.abs(settings.max_daily_loss)) {
    result.errors.push(`Daily loss limit hit (${dailyPnl.toFixed(2)})`);
    return result;
  }

  // Load open positions
  const { data: openRows } = await supabaseAdmin
    .from("positions").select("*").eq("status", "open");
  const openBySym = new Map<string, Position>();
  for (const p of (openRows ?? []) as Position[]) openBySym.set(p.symbol, p);

  // Load learning buckets
  const { data: bucketRows } = await supabaseAdmin.from("learning_buckets").select("*");
  const buckets = new Map<string, Bucket>();
  for (const b of (bucketRows ?? []) as Bucket[]) buckets.set(b.bucket_key, b);

  const symbolsToScan = SYMBOLS.filter((s) => settings.enabled_symbols.includes(s.code));

  for (const sym of symbolsToScan) {
    try {
      const ticks = await fetchTicksHistory(sym.code, 200);
      if (ticks.length < 30) continue;
      result.symbols_scanned += 1;

      const state = computeState(ticks);

      // Persist symbol state
      await supabaseAdmin.from("symbol_state").upsert({
        symbol: sym.code,
        last_epoch: state.lastEpoch,
        last_price: state.lastPrice,
        ticks_since_spike: state.ticksSinceSpike,
        last_spike_epoch: state.lastSpikeEpoch,
        median_abs_change: state.medianAbsChange,
        rsi: state.rsi,
        ema_fast: state.emaFast,
        ema_slow: state.emaSlow,
        recent_ticks: ticks.slice(-60).map((t) => ({ epoch: t.epoch, quote: t.quote })) as unknown as never,
        updated_at: new Date().toISOString(),
      });

      // 1) Manage open position for this symbol
      const open = openBySym.get(sym.code);
      if (open) {
        const closed = await maybeClosePosition(open, state, sym.avgSpikeTicks, settings);
        if (closed) {
          result.trades_closed += 1;
          openBySym.delete(sym.code);
          // Update learner bucket from realized R
          if (settings.learning_enabled) {
            await updateBucket(buckets, open.symbol, open.regime, open.side, closed.realized_r);
          }
        }
      }

      // 2) Consider new entry (only if no open position for this symbol)
      if (!openBySym.has(sym.code) && settings.mode !== "signals") {
        const sig = localSignal(sym, state);

        // Audit log
        await supabaseAdmin.from("signals").insert({
          symbol: sym.code, regime: sig.regime,
          direction: sig.direction, confidence: sig.confidence,
          reason: sig.reason, acted: false,
        });

        if (sig.direction && sig.regime !== "wait") {
          // Late-entry guard
          const dueRatio = state.ticksSinceSpike / sym.avgSpikeTicks;
          if (sig.regime === "spike-anticipation" && dueRatio > settings.late_entry_ratio) continue;

          // Learner gate
          if (settings.learning_enabled) {
            const b = buckets.get(bucketKey(sym.code, sig.regime, sig.direction));
            if (b?.disabled) continue;
            const floor = confidenceFloor(b?.trades ?? 0, b?.ewma_r ?? 0);
            if (sig.confidence < floor) continue;
          } else if (sig.confidence < 0.5) continue;

          // Size: 1R = median_abs_change * ~spikeFactor heuristic; fall back to small fraction of price
          const unit = Math.max(state.medianAbsChange * 5, state.lastPrice * 0.0005);
          if (!isFinite(unit) || unit <= 0) continue;

          await supabaseAdmin.from("positions").insert({
            symbol: sym.code,
            side: sig.direction,
            regime: sig.regime,
            entry_price: state.lastPrice,
            stake: settings.stake,
            tp_r: settings.tp_r,
            sl_r: settings.sl_r,
            unit,
            status: "open",
            reason: sig.reason,
            confidence: sig.confidence,
            opened_epoch: state.lastEpoch,
          });
          result.trades_opened += 1;
          // Mark the signal we just logged as acted (best effort: update last signal for this symbol)
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      result.errors.push(`${sym.code}: ${msg}`);
    }
  }

  return result;
}

interface ClosedInfo { realized_r: number; pnl: number; exit_reason: string }

async function maybeClosePosition(
  pos: Position, state: ComputedState, avgSpikeTicks: number, settings: Settings,
): Promise<ClosedInfo | null> {
  const dir = pos.side === "BUY" ? 1 : -1;
  const moved = (state.lastPrice - pos.entry_price) * dir;
  const r = moved / pos.unit;

  const tpHit = r >= pos.tp_r;
  const slHit = r <= -pos.sl_r;

  // Pre-spike exit for counter-spike trades: if we're close to expected spike
  const elapsedTicks = Math.max(0, state.ticks.length > 0 ? (state.lastEpoch - pos.opened_epoch) : 0);
  // Approximate ticks-since-open from epoch deltas: synthetic indices tick ~1s
  const heldTicks = Math.max(0, Math.round(elapsedTicks));
  const preSpikeExit = pos.regime === "spike-anticipation"
    && (state.ticksSinceSpike / avgSpikeTicks) >= settings.pre_spike_ratio
    && r > -pos.sl_r * 0.5; // don't pre-exit a losing trade right at SL

  // Time stop
  const timeStop = heldTicks >= avgSpikeTicks * settings.max_hold_ratio;

  if (!(tpHit || slHit || preSpikeExit || timeStop)) return null;

  const realized_r = r;
  const pnl = realized_r * pos.stake;
  const exit_reason = tpHit ? "TP" : slHit ? "SL" : preSpikeExit ? "PRE_SPIKE" : "TIME_STOP";

  await supabaseAdmin.from("positions").update({
    status: "closed",
    exit_price: state.lastPrice,
    closed_epoch: state.lastEpoch,
    closed_at: new Date().toISOString(),
    pnl,
    realized_r,
    exit_reason,
  }).eq("id", pos.id);

  return { realized_r, pnl, exit_reason };
}

async function updateBucket(
  buckets: Map<string, Bucket>, symbol: string, regime: string, direction: string, realizedR: number,
) {
  const key = bucketKey(symbol, regime, direction);
  const b = buckets.get(key) ?? {
    bucket_key: key, symbol, regime, direction,
    trades: 0, wins: 0, losses: 0, ewma_r: 0, disabled: false,
  };
  b.trades += 1;
  if (realizedR > 0) b.wins += 1;
  else if (realizedR < 0) b.losses += 1;
  b.ewma_r = b.ewma_r * (1 - EWMA_ALPHA) + realizedR * EWMA_ALPHA;
  b.disabled = isBucketDisabled(b.trades, b.ewma_r);
  buckets.set(key, b);

  await supabaseAdmin.from("learning_buckets").upsert({
    ...b,
    updated_at: new Date().toISOString(),
  });
}

// Silence unused-import warning in builds that elide getSymbol
void getSymbol;
