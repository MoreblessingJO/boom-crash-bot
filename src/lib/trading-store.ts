import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Direction, Regime, Signal } from "./strategy";

export type Mode = "paper" | "signals" | "live";

export interface Position {
  id: string;
  symbol: string;
  direction: Direction;
  entryPrice: number;
  entryEpoch: number;
  stake: number;
  status: "open" | "closed";
  exitPrice?: number;
  exitEpoch?: number;
  exitReason?: "TP" | "SL" | "pre-spike" | "time" | "manual";
  pnl?: number;
  realizedR?: number;
  mode: Mode;
  reason: string;
  regime: Regime;
  // Per-position risk snapshot — locks in the volatility at entry time.
  rUnit: number;
  tpPrice: number;
  slPrice: number;
  maxHoldTicks: number;
  ticksHeld: number;
}

export interface SignalLog {
  id: string;
  symbol: string;
  epoch: number;
  signal: Signal;
  acted: boolean;
}

// Per (symbol, regime, direction) bucket — the learning unit.
export interface BucketStats {
  trades: number;
  wins: number;
  losses: number;
  sumR: number;          // cumulative realized R
  expectancyR: number;   // EWMA of realized R per trade (alpha = 0.15)
  lastUpdated: number;
  // Adaptive policy derived after each close (recomputed lazily on read).
  minConfidence: number; // entry threshold for this bucket
  disabled: boolean;     // true → skip this bucket (negative expectancy)
}

export const bucketKey = (symbol: string, regime: Regime, direction: Direction) =>
  `${symbol}|${regime}|${direction}`;

const DEFAULT_BUCKET: BucketStats = {
  trades: 0,
  wins: 0,
  losses: 0,
  sumR: 0,
  expectancyR: 0,
  lastUpdated: 0,
  minConfidence: 0.6,
  disabled: false,
};

// Online learner — runs on every closed position. Updates the bucket's
// EWMA expectancy and re-derives the policy (confidence threshold + on/off).
function updateBucket(prev: BucketStats | undefined, realizedR: number): BucketStats {
  const b = prev ?? { ...DEFAULT_BUCKET };
  const trades = b.trades + 1;
  const wins = b.wins + (realizedR > 0 ? 1 : 0);
  const losses = b.losses + (realizedR <= 0 ? 1 : 0);
  const sumR = b.sumR + realizedR;
  const alpha = 0.15;
  const expectancyR =
    b.trades === 0 ? realizedR : b.expectancyR * (1 - alpha) + realizedR * alpha;

  // Policy derivation.
  // Confidence floor: shift with expectancy. Negative → demand higher conf.
  // Positive → relax slightly. Cap [0.5, 0.95].
  let minConfidence = 0.6 - Math.tanh(expectancyR) * 0.15;
  minConfidence = Math.max(0.5, Math.min(0.95, minConfidence));

  // Disable bucket only after enough samples and clearly negative edge.
  const disabled = trades >= 20 && expectancyR < -0.25;

  return {
    trades,
    wins,
    losses,
    sumR,
    expectancyR,
    lastUpdated: Date.now(),
    minConfidence,
    disabled,
  };
}

interface State {
  mode: Mode;
  setMode: (m: Mode) => void;
  apiToken: string | null;
  setApiToken: (t: string | null) => void;
  selectedSymbol: string;
  selectSymbol: (s: string) => void;
  autoTrade: boolean;
  setAutoTrade: (b: boolean) => void;
  stake: number;
  setStake: (n: number) => void;

  takeProfitR: number;
  stopLossR: number;
  setRisk: (tpR: number, slR: number) => void;
  maxHoldRatio: number;
  setMaxHoldRatio: (r: number) => void;
  preSpikeExitRatio: number;
  setPreSpikeExitRatio: (r: number) => void;

  maxDailyLoss: number;
  setMaxDailyLoss: (n: number) => void;
  positions: Position[];
  addPosition: (p: Position) => void;
  closePosition: (
    id: string,
    exitPrice: number,
    exitEpoch: number,
    exitReason?: Position["exitReason"],
  ) => void;
  tickPosition: (id: string) => void;
  signals: SignalLog[];
  pushSignal: (s: SignalLog) => void;
  paperBalance: number;
  resetPaper: () => void;
  killSwitch: boolean;
  setKill: (b: boolean) => void;

  // Continuous-learning state.
  learning: Record<string, BucketStats>;
  learningEnabled: boolean;
  setLearningEnabled: (b: boolean) => void;
  resetLearning: () => void;
  getPolicy: (symbol: string, regime: Regime, direction: Direction) => BucketStats;
}

export const useTrading = create<State>()(
  persist(
    (set, get) => ({
      mode: "paper",
      setMode: (mode) => set({ mode }),
      apiToken: null,
      setApiToken: (apiToken) => set({ apiToken }),
      selectedSymbol: "BOOM1000",
      selectSymbol: (selectedSymbol) => set({ selectedSymbol }),
      autoTrade: false,
      setAutoTrade: (autoTrade) => set({ autoTrade }),
      stake: 1,
      setStake: (stake) => set({ stake }),
      takeProfitR: 3,
      stopLossR: 1,
      setRisk: (takeProfitR, stopLossR) => set({ takeProfitR, stopLossR }),
      maxHoldRatio: 1.2,
      setMaxHoldRatio: (maxHoldRatio) => set({ maxHoldRatio }),
      preSpikeExitRatio: 0.8,
      setPreSpikeExitRatio: (preSpikeExitRatio) => set({ preSpikeExitRatio }),
      maxDailyLoss: 50,
      setMaxDailyLoss: (maxDailyLoss) => set({ maxDailyLoss }),
      positions: [],
      addPosition: (p) => set({ positions: [p, ...get().positions].slice(0, 500) }),
      closePosition: (id, exitPrice, exitEpoch, exitReason) =>
        set((state) => {
          const pos = state.positions.find((p) => p.id === id);
          if (!pos || pos.status === "closed") return state;
          const dir = pos.direction === "BUY" ? 1 : -1;
          const pnl = (exitPrice - pos.entryPrice) * dir * pos.stake;
          // Realized R = price move in R-units (independent of stake).
          const realizedR = pos.rUnit > 0
            ? ((exitPrice - pos.entryPrice) * dir) / pos.rUnit
            : 0;

          const key = bucketKey(pos.symbol, pos.regime, pos.direction);
          const learning = { ...state.learning };
          learning[key] = updateBucket(learning[key], realizedR);

          return {
            positions: state.positions.map((p) =>
              p.id === id
                ? { ...p, status: "closed", exitPrice, exitEpoch, exitReason, pnl, realizedR }
                : p,
            ),
            paperBalance:
              pos.mode === "paper" ? state.paperBalance + pnl : state.paperBalance,
            learning,
          };
        }),
      tickPosition: (id) =>
        set((state) => ({
          positions: state.positions.map((p) =>
            p.id === id && p.status === "open"
              ? { ...p, ticksHeld: p.ticksHeld + 1 }
              : p,
          ),
        })),
      signals: [],
      pushSignal: (s) => set({ signals: [s, ...get().signals].slice(0, 100) }),
      paperBalance: 1000,
      resetPaper: () => set({ paperBalance: 1000, positions: [] }),
      killSwitch: false,
      setKill: (killSwitch) => set({ killSwitch }),

      learning: {},
      learningEnabled: true,
      setLearningEnabled: (learningEnabled) => set({ learningEnabled }),
      resetLearning: () => set({ learning: {} }),
      getPolicy: (symbol, regime, direction) =>
        get().learning[bucketKey(symbol, regime, direction)] ?? DEFAULT_BUCKET,
    }),
    {
      name: "boom-crash-agent",
      version: 3,
      migrate: (persisted: unknown, version) => {
        const p = (persisted ?? {}) as Record<string, unknown>;
        if (version < 2) {
          delete p.takeProfitPips;
          delete p.stopLossPips;
        }
        if (version < 3) {
          p.learning = {};
          p.learningEnabled = true;
        }
        return p as never;
      },
      partialize: (s) => ({
        mode: s.mode,
        apiToken: s.apiToken,
        selectedSymbol: s.selectedSymbol,
        autoTrade: s.autoTrade,
        stake: s.stake,
        takeProfitR: s.takeProfitR,
        stopLossR: s.stopLossR,
        maxHoldRatio: s.maxHoldRatio,
        preSpikeExitRatio: s.preSpikeExitRatio,
        maxDailyLoss: s.maxDailyLoss,
        paperBalance: s.paperBalance,
        learning: s.learning,
        learningEnabled: s.learningEnabled,
      }),
    },
  ),
);
