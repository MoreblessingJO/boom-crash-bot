// Strategy dispatch for multiple agents. Each agent has a `strategy_params`
// JSON blob controlling its behaviour. Signals returned here are consumed by
// the engine's per-agent evaluation loop.
import type { SymbolDef } from "./symbols.js";
import {
  computeState, localSignal, type ComputedState, type Signal, type Direction,
} from "./strategy.js";

export type AgentParams = {
  mode?: "spike_anticipation" | "spike_anticipation_aggressive" | "trend_following" | "ai_gated";
  dueRatio?: number;
  confFloor?: number;
  rsiHi?: number;
  rsiLo?: number;
  minConfidence?: number;
  stakeMult?: number;
  requireAiAgreement?: boolean;
};

export type AgentRow = {
  id: string;
  slug: string;
  name: string;
  status: string;
  strategy_key: string;
  strategy_params: AgentParams | null;
};

export function evaluateAgent(
  agent: AgentRow, sym: SymbolDef, state: ComputedState,
): Signal {
  const p: AgentParams = agent.strategy_params ?? {};
  const base = localSignal(sym, state);

  switch (p.mode) {
    case "spike_anticipation":
    case "spike_anticipation_aggressive": {
      // Only trade the counter-spike leg
      if (base.regime !== "spike-anticipation") return waitSignal("no spike setup");
      const dueRatio = state.ticksSinceSpike / sym.avgSpikeTicks;
      const threshold = p.dueRatio ?? 0.6;
      if (dueRatio < threshold) return waitSignal(`due ${(dueRatio * 100).toFixed(0)}% < ${(threshold * 100).toFixed(0)}%`);
      const floor = p.confFloor ?? 0.5;
      if (base.confidence < floor) return waitSignal(`conf ${base.confidence.toFixed(2)} < ${floor}`);
      return base;
    }
    case "trend_following": {
      const rsiHi = p.rsiHi ?? 55;
      const rsiLo = p.rsiLo ?? 45;
      const floor = p.confFloor ?? 0.5;
      let dir: Direction | null = null;
      if (state.emaFast > state.emaSlow && state.rsi > rsiHi && state.rsi < 80) dir = "BUY";
      else if (state.emaFast < state.emaSlow && state.rsi < rsiLo && state.rsi > 20) dir = "SELL";
      if (!dir) return waitSignal(`no trend (rsi ${state.rsi.toFixed(0)})`);
      const conf = dir === "BUY"
        ? 0.55 + Math.min(0.3, (state.rsi - rsiHi) / 100)
        : 0.55 + Math.min(0.3, (rsiLo - state.rsi) / 100);
      if (conf < floor) return waitSignal(`trend conf ${conf.toFixed(2)} < ${floor}`);
      return {
        regime: "trend-following",
        direction: dir,
        confidence: conf,
        reason: `${dir} · RSI ${state.rsi.toFixed(0)} · EMA${dir === "BUY" ? "↑" : "↓"}`,
      };
    }
    case "ai_gated": {
      // Sniper: use local signal, only trade if confidence >= min. AI cross-check
      // is best-effort — worker doesn't call AI per-tick to save quota; the min
      // confidence + regime filter approximates the intended selectivity.
      const min = p.minConfidence ?? 0.75;
      if (!base.direction || base.regime === "wait") return waitSignal("no local signal");
      if (base.confidence < min) return waitSignal(`sniper needs ${min}+, got ${base.confidence.toFixed(2)}`);
      return { ...base, reason: `SNIPER · ${base.reason}` };
    }
    default:
      return base;
  }
}

function waitSignal(reason: string): Signal {
  return { regime: "wait", direction: null, confidence: 0, reason };
}

export function stakeMultiplier(agent: AgentRow): number {
  return agent.strategy_params?.stakeMult ?? 1;
}

export { computeState };
