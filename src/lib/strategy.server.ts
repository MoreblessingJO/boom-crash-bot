// Pure strategy math, server-safe. Mirrors src/lib/strategy.ts but rebuilds
// state from a window of raw ticks rather than incremental tick-by-tick updates.
import type { SymbolDef } from "./symbols";

export interface RawTick {
  epoch: number;
  quote: number;
}

const SPIKE_FACTOR = 5;

export interface ComputedState {
  ticks: RawTick[];
  lastEpoch: number;
  lastPrice: number;
  ticksSinceSpike: number;
  lastSpikeEpoch: number | null;
  medianAbsChange: number;
  rsi: number;
  emaFast: number;
  emaSlow: number;
}

export function computeState(ticks: RawTick[]): ComputedState {
  const n = ticks.length;
  if (n === 0) {
    return {
      ticks: [], lastEpoch: 0, lastPrice: 0, ticksSinceSpike: 0,
      lastSpikeEpoch: null, medianAbsChange: 0, rsi: 50, emaFast: 0, emaSlow: 0,
    };
  }

  // Median abs change over last 100 ticks
  const abs: number[] = [];
  for (let i = Math.max(1, n - 100); i < n; i++) {
    const d = Math.abs(ticks[i].quote - ticks[i - 1].quote);
    if (d > 0) abs.push(d);
  }
  abs.sort((a, b) => a - b);
  const median = abs.length ? abs[Math.floor(abs.length / 2)] : 0;

  // Find ticks since last spike by scanning backwards
  let ticksSinceSpike = n - 1;
  let lastSpikeEpoch: number | null = null;
  if (median > 0) {
    for (let i = n - 1; i >= 1; i--) {
      const d = Math.abs(ticks[i].quote - ticks[i - 1].quote);
      if (d > median * SPIKE_FACTOR) {
        ticksSinceSpike = n - 1 - i;
        lastSpikeEpoch = ticks[i].epoch;
        break;
      }
    }
  }

  // EMA fast / slow
  const kF = 2 / (10 + 1);
  const kS = 2 / (30 + 1);
  let emaFast = ticks[0].quote;
  let emaSlow = ticks[0].quote;
  for (let i = 1; i < n; i++) {
    emaFast = ticks[i].quote * kF + emaFast * (1 - kF);
    emaSlow = ticks[i].quote * kS + emaSlow * (1 - kS);
  }

  // RSI(14)
  const period = 14;
  const start = Math.max(1, n - period);
  let gains = 0, losses = 0;
  for (let i = start; i < n; i++) {
    const d = ticks[i].quote - ticks[i - 1].quote;
    if (d >= 0) gains += d; else losses -= d;
  }
  const avgG = gains / period, avgL = losses / period;
  const rs = avgL === 0 ? 100 : avgG / avgL;
  const rsi = 100 - 100 / (1 + rs);

  const last = ticks[n - 1];
  return {
    ticks, lastEpoch: last.epoch, lastPrice: last.quote,
    ticksSinceSpike, lastSpikeEpoch,
    medianAbsChange: median, rsi, emaFast, emaSlow,
  };
}

export type Regime = "spike-anticipation" | "trend-following" | "wait";
export type Direction = "BUY" | "SELL";

export interface Signal {
  regime: Regime;
  direction: Direction | null;
  confidence: number;
  reason: string;
}

export function localSignal(sym: SymbolDef, s: ComputedState): Signal {
  if (s.ticks.length < 30) {
    return { regime: "wait", direction: null, confidence: 0, reason: "Warming up tick history" };
  }
  const expected = sym.avgSpikeTicks;
  const dueRatio = s.ticksSinceSpike / expected;

  if (dueRatio > 0.6) {
    const direction: Direction = sym.kind === "boom" ? "SELL" : "BUY";
    const confidence = Math.min(0.95, 0.4 + dueRatio * 0.4);
    return {
      regime: "spike-anticipation",
      direction,
      confidence,
      reason: `${s.ticksSinceSpike}/${expected} ticks since last spike (${(dueRatio * 100).toFixed(0)}% of mean). Counter-spike entry.`,
    };
  }

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

// Learner gate: minimum confidence threshold based on bucket expectancy
export function bucketKey(symbol: string, regime: string, direction: string) {
  return `${symbol}|${regime}|${direction}`;
}

export function confidenceFloor(trades: number, ewmaR: number): number {
  // Warmup: flat 0.5 until 15 trades
  if (trades < 15) return 0.5;
  // Softer adaptive floor in [0.45, 0.80]
  // ewmaR > 0 → lower floor (be more willing); ewmaR < 0 → higher floor
  const nudge = Math.max(-0.35, Math.min(0.30, -ewmaR * 0.4));
  return Math.max(0.45, Math.min(0.80, 0.6 + nudge));
}

export function isBucketDisabled(trades: number, ewmaR: number): boolean {
  return trades >= 40 && ewmaR < -0.4;
}
