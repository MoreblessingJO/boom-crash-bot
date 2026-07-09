// Strategy dispatch for multiple agents. Each agent has a `strategy_params`
// JSON blob controlling its behaviour. Signals returned here are consumed by
// the engine's per-agent evaluation loop.
//
// New (real) modes:
//   compression_alignment (Nexx)   — 4-way indicator alignment
//   rsi_divergence_dual   (007)    — divergence at extreme → scalper + runner
//   zone_exhaustion       (Sniper) — H4 zone + H1 streak + M5 exhaustion
//
// Legacy modes kept as fallbacks:
//   spike_anticipation / spike_anticipation_aggressive / trend_following / ai_gated
import type { SymbolDef } from "./symbols.js";
import {
  computeState, localSignal, type ComputedState, type Signal, type Direction,
} from "./strategy.js";
import {
  compressionRatio, tickPressure, pricePosition, tsslScore,
  rsiDivergence, nearExtreme, h1Streak, m5Exhaustion, rsi,
} from "./indicators.js";

export type AgentMode =
  | "spike_anticipation"
  | "spike_anticipation_aggressive"
  | "trend_following"
  | "ai_gated"
  | "compression_alignment"
  | "rsi_divergence_dual"
  | "zone_exhaustion";

export type AgentParams = {
  mode?: AgentMode;
  // Common
  stakeMult?: number;
  confFloor?: number;
  minConfidence?: number;
  // spike_anticipation*
  dueRatio?: number;
  // trend_following
  rsiHi?: number;
  rsiLo?: number;
  // compression_alignment (Nexx)
  compressionMax?: number;      // recent/prior range ratio, default 0.5
  pressureMin?: number;         // |tick pressure| min, default 0.4
  positionEdge?: number;        // 0..0.5 — must be inside edge band, default 0.33
  tsslMin?: number;             // default 0.5
  // rsi_divergence_dual (007)
  divergenceWindow?: number;    // long lookback, default 600
  extremeBand?: number;         // 0..0.5, default 0.08
  scalperTpR?: number;          // default 1.2
  scalperSlR?: number;          // default 0.8
  runnerTpR?: number;           // default 5
  runnerSlR?: number;           // default 2
  runnerStakeMult?: number;     // default 0.7
  // zone_exhaustion (Sniper)
  h4RsiHi?: number;             // default 68
  h4RsiLo?: number;             // default 32
  streakMin?: number;           // default 3
  m5RsiHi?: number;             // default 75
  m5RsiLo?: number;             // default 25
};

export type AgentRow = {
  id: string;
  slug: string;
  name: string;
  status: string;
  strategy_key: string;
  strategy_params: AgentParams | null;
};

// A single signal may declare a slot (for multi-lot strategies) and override
// stake/tp/sl per slot. The engine treats each returned signal as an
// independent position keyed by (symbol, agent, slot).
export type AgentSignal = Signal & {
  slot?: string;
  tpR?: number;
  slR?: number;
  stakeMult?: number;
};

export function evaluateAgent(
  agent: AgentRow, sym: SymbolDef, state: ComputedState,
): AgentSignal[] {
  const p: AgentParams = agent.strategy_params ?? {};
  const wait = (reason: string): AgentSignal[] =>
    [{ regime: "wait", direction: null, confidence: 0, reason }];

  switch (p.mode) {
    case "compression_alignment": return evalCompression(sym, state, p);
    case "rsi_divergence_dual":   return evalDivergence(sym, state, p);
    case "zone_exhaustion":       return evalExhaustion(sym, state, p);

    case "spike_anticipation":
    case "spike_anticipation_aggressive": {
      const base = localSignal(sym, state);
      if (base.regime !== "spike-anticipation") return wait("no spike setup");
      const dueRatio = state.ticksSinceSpike / sym.avgSpikeTicks;
      const threshold = p.dueRatio ?? 0.6;
      if (dueRatio < threshold) return wait(`due ${(dueRatio * 100).toFixed(0)}% < ${(threshold * 100).toFixed(0)}%`);
      const floor = p.confFloor ?? 0.5;
      if (base.confidence < floor) return wait(`conf ${base.confidence.toFixed(2)} < ${floor}`);
      return [base];
    }
    case "trend_following": {
      const rsiHi = p.rsiHi ?? 55, rsiLo = p.rsiLo ?? 45, floor = p.confFloor ?? 0.5;
      let dir: Direction | null = null;
      if (state.emaFast > state.emaSlow && state.rsi > rsiHi && state.rsi < 80) dir = "BUY";
      else if (state.emaFast < state.emaSlow && state.rsi < rsiLo && state.rsi > 20) dir = "SELL";
      if (!dir) return wait(`no trend (rsi ${state.rsi.toFixed(0)})`);
      const conf = dir === "BUY"
        ? 0.55 + Math.min(0.3, (state.rsi - rsiHi) / 100)
        : 0.55 + Math.min(0.3, (rsiLo - state.rsi) / 100);
      if (conf < floor) return wait(`trend conf ${conf.toFixed(2)} < ${floor}`);
      return [{ regime: "trend-following", direction: dir, confidence: conf,
        reason: `${dir} · RSI ${state.rsi.toFixed(0)} · EMA${dir === "BUY" ? "↑" : "↓"}` }];
    }
    case "ai_gated": {
      const base = localSignal(sym, state);
      const min = p.minConfidence ?? 0.75;
      if (!base.direction || base.regime === "wait") return wait("no local signal");
      if (base.confidence < min) return wait(`sniper needs ${min}+, got ${base.confidence.toFixed(2)}`);
      return [{ ...base, reason: `SNIPER · ${base.reason}` }];
    }
    default:
      return [localSignal(sym, state)];
  }
}

// ─── Nexx: 4-Green-Light Compression ────────────────────────────────────────
function evalCompression(sym: SymbolDef, state: ComputedState, p: AgentParams): AgentSignal[] {
  const wait = (r: string): AgentSignal[] => [{ regime: "wait", direction: null, confidence: 0, reason: r }];
  if (state.ticks.length < 200) return wait("warming up (need 200 ticks)");

  const compMax  = p.compressionMax ?? 0.5;
  const pressMin = p.pressureMin ?? 0.4;
  const edge     = p.positionEdge ?? 0.33;
  const tsslMin  = p.tsslMin ?? 0.5;

  const comp = compressionRatio(state.ticks);
  const press = tickPressure(state.ticks);
  const pos = pricePosition(state.ticks);
  const tssl = tsslScore(state.emaFast, state.emaSlow, state.ticksSinceSpike, sym.avgSpikeTicks);

  // Compression must be present
  if (comp > compMax) return wait(`comp ${comp.toFixed(2)} > ${compMax}`);
  // TSSL must show setup readiness
  if (tssl < tsslMin) return wait(`tssl ${tssl.toFixed(2)} < ${tsslMin}`);

  // Directional confirmation from pressure + H1 position
  // For BUY: pressure positive, price in lower edge (bounce zone). Boom bias.
  // For SELL: pressure negative, price in upper edge. Crash bias.
  const wantBuy = sym.kind === "boom";
  let dir: Direction | null = null;
  if (wantBuy && press > pressMin && pos <= edge) dir = "BUY";
  else if (!wantBuy && press < -pressMin && pos >= 1 - edge) dir = "SELL";

  if (!dir) {
    return wait(`no alignment (press ${press.toFixed(2)}, pos ${pos.toFixed(2)})`);
  }
  // Confidence = weighted goodness of all four lights
  const conf = Math.min(0.95,
    0.35 + (1 - comp / compMax) * 0.20 + Math.abs(press) * 0.20 + tssl * 0.20);
  return [{
    regime: "trend-following",
    direction: dir,
    confidence: conf,
    reason: `NEXX 4GL · comp ${comp.toFixed(2)} press ${press.toFixed(2)} pos ${pos.toFixed(2)} tssl ${tssl.toFixed(2)}`,
  }];
}

// ─── 007: RSI Divergence Kingpin (dual-lot) ─────────────────────────────────
function evalDivergence(sym: SymbolDef, state: ComputedState, p: AgentParams): AgentSignal[] {
  const wait = (r: string): AgentSignal[] => [{ regime: "wait", direction: null, confidence: 0, reason: r }];
  const win = p.divergenceWindow ?? 600;
  if (state.ticks.length < win) return wait(`warming up (need ${win} ticks)`);

  const band = p.extremeBand ?? 0.08;
  const extreme = nearExtreme(state.ticks, win, band);
  if (!extreme) return wait("not at multi-window extreme");

  const div = rsiDivergence(state.ticks, win);
  if (!div) return wait("no RSI divergence");

  // Bullish divergence at a low → BUY. Bearish at a high → SELL.
  let dir: Direction | null = null;
  if (div === "bullish" && extreme === "low") dir = "BUY";
  else if (div === "bearish" && extreme === "high") dir = "SELL";
  if (!dir) return wait(`divergence/extreme mismatch (${div}/${extreme})`);

  const conf = 0.70;
  const reason = `007 · ${div} div at ${extreme}`;
  const scalperTp = p.scalperTpR ?? 1.2, scalperSl = p.scalperSlR ?? 0.8;
  const runnerTp  = p.runnerTpR  ?? 5.0, runnerSl  = p.runnerSlR  ?? 2.0;
  const runnerMul = p.runnerStakeMult ?? 0.7;

  return [
    { regime: "trend-following", direction: dir, confidence: conf,
      reason: `${reason} · scalper`, slot: "scalp",
      tpR: scalperTp, slR: scalperSl },
    { regime: "trend-following", direction: dir, confidence: conf,
      reason: `${reason} · kingpin runner`, slot: "runner",
      tpR: runnerTp, slR: runnerSl, stakeMult: runnerMul },
  ];
}

// ─── Sniper: Zone Exhaustion Entry ──────────────────────────────────────────
function evalExhaustion(sym: SymbolDef, state: ComputedState, p: AgentParams): AgentSignal[] {
  const wait = (r: string): AgentSignal[] => [{ regime: "wait", direction: null, confidence: 0, reason: r }];
  if (state.ticks.length < 600) return wait("warming up (need 600 ticks)");

  const h4RsiHi = p.h4RsiHi ?? 68, h4RsiLo = p.h4RsiLo ?? 32;
  const streakMin = p.streakMin ?? 3;
  const m5Hi = p.m5RsiHi ?? 75, m5Lo = p.m5RsiLo ?? 25;

  const h4Rsi = rsi(state.ticks.slice(-600).map(t => t.quote), 14);
  const streak = h1Streak(state.ticks);
  const ex = m5Exhaustion(state.ticks, 30, 14, m5Hi, m5Lo);

  if (!ex) return wait(`no M5 exhaustion`);

  // SELL setup: H4 overbought + H1 up-streak + M5 exhaustion sell
  if (ex === "sell" && h4Rsi >= h4RsiHi && streak.dir === 1 && streak.count >= streakMin) {
    return [{ regime: "spike-anticipation", direction: "SELL", confidence: 0.80,
      reason: `SNIPER · H4 ${h4Rsi.toFixed(0)} · H1 up×${streak.count} · M5 exh` }];
  }
  // BUY setup: mirror
  if (ex === "buy" && h4Rsi <= h4RsiLo && streak.dir === -1 && streak.count >= streakMin) {
    return [{ regime: "spike-anticipation", direction: "BUY", confidence: 0.80,
      reason: `SNIPER · H4 ${h4Rsi.toFixed(0)} · H1 down×${streak.count} · M5 exh` }];
  }
  return wait(`no 3TF confirm (h4 ${h4Rsi.toFixed(0)} streak ${streak.dir}×${streak.count} m5 ${ex})`);
}

export function stakeMultiplier(agent: AgentRow): number {
  return agent.strategy_params?.stakeMult ?? 1;
}

export { computeState };
