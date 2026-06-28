import type { Tick } from "./deriv-client";
import type { SymbolDef } from "./symbols";

// Spike threshold: change > 5x median absolute tick change is a spike.
const SPIKE_FACTOR = 5;

export interface SymbolState {
  ticks: Tick[];               // capped window
  ticksSinceSpike: number;
  lastSpikeEpoch: number | null;
  medianAbsChange: number;
  rsi: number;                 // 0-100
  emaFast: number;
  emaSlow: number;
}

export const emptyState = (): SymbolState => ({
  ticks: [],
  ticksSinceSpike: 0,
  lastSpikeEpoch: null,
  medianAbsChange: 0,
  rsi: 50,
  emaFast: 0,
  emaSlow: 0,
});

const MAX_TICKS = 500;

export function pushTick(state: SymbolState, tick: Tick): SymbolState {
  const ticks = [...state.ticks, tick].slice(-MAX_TICKS);
  const prev = ticks[ticks.length - 2];
  const change = prev ? tick.quote - prev.quote : 0;

  // Median absolute change (rolling)
  const abs = ticks.slice(-100).map((t, i, a) =>
    i === 0 ? 0 : Math.abs(t.quote - a[i - 1].quote),
  ).filter((x) => x > 0).sort((a, b) => a - b);
  const median = abs.length ? abs[Math.floor(abs.length / 2)] : 0;

  // Spike detection
  const isSpike = median > 0 && Math.abs(change) > median * SPIKE_FACTOR;
  const ticksSinceSpike = isSpike ? 0 : state.ticksSinceSpike + 1;
  const lastSpikeEpoch = isSpike ? tick.epoch : state.lastSpikeEpoch;

  // EMA fast / slow
  const kF = 2 / (10 + 1);
  const kS = 2 / (30 + 1);
  const emaFast = state.emaFast === 0 ? tick.quote : tick.quote * kF + state.emaFast * (1 - kF);
  const emaSlow = state.emaSlow === 0 ? tick.quote : tick.quote * kS + state.emaSlow * (1 - kS);

  // RSI (14)
  const period = 14;
  const recent = ticks.slice(-(period + 1));
  let gains = 0, losses = 0;
  for (let i = 1; i < recent.length; i++) {
    const d = recent[i].quote - recent[i - 1].quote;
    if (d >= 0) gains += d; else losses -= d;
  }
  const avgG = gains / period, avgL = losses / period;
  const rs = avgL === 0 ? 100 : avgG / avgL;
  const rsi = 100 - 100 / (1 + rs);

  return { ticks, ticksSinceSpike, lastSpikeEpoch, medianAbsChange: median, rsi, emaFast, emaSlow };
}

export type Regime = "spike-anticipation" | "trend-following" | "wait";
export type Direction = "BUY" | "SELL";

export interface Signal {
  regime: Regime;
  direction: Direction | null;
  confidence: number;   // 0-1
  reason: string;
}

// Heuristic signal — fast, deterministic. AI layer can refine via /api/ai-signal.
export function localSignal(sym: SymbolDef, s: SymbolState): Signal {
  if (s.ticks.length < 30) {
    return { regime: "wait", direction: null, confidence: 0, reason: "Warming up tick history" };
  }
  const expected = sym.avgSpikeTicks;
  const dueRatio = s.ticksSinceSpike / expected; // >1 means overdue

  // Spike anticipation: as we approach/exceed the expected spike interval,
  // trade against the spike direction (Boom spikes up → SELL between spikes; Crash spikes down → BUY between spikes).
  if (dueRatio > 0.6) {
    const direction: Direction = sym.kind === "boom" ? "SELL" : "BUY";
    const confidence = Math.min(0.95, 0.4 + dueRatio * 0.4);
    return {
      regime: "spike-anticipation",
      direction,
      confidence,
      reason: `${s.ticksSinceSpike}/${expected} ticks since last spike (${(dueRatio * 100).toFixed(0)}% of mean interval). Counter-spike entry.`,
    };
  }

  // Trend following between spikes
  const trendUp = s.emaFast > s.emaSlow && s.rsi > 55 && s.rsi < 80;
  const trendDn = s.emaFast < s.emaSlow && s.rsi < 45 && s.rsi > 20;
  if (trendUp) {
    return {
      regime: "trend-following",
      direction: "BUY",
      confidence: 0.55 + Math.min(0.3, (s.rsi - 55) / 100),
      reason: `EMA10>EMA30, RSI ${s.rsi.toFixed(0)} — momentum long`,
    };
  }
  if (trendDn) {
    return {
      regime: "trend-following",
      direction: "SELL",
      confidence: 0.55 + Math.min(0.3, (45 - s.rsi) / 100),
      reason: `EMA10<EMA30, RSI ${s.rsi.toFixed(0)} — momentum short`,
    };
  }
  return { regime: "wait", direction: null, confidence: 0.2, reason: "No clear regime — staying flat" };
}
