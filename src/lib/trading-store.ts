import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Direction, Regime, Signal } from "./strategy";
import { updateSettings, resetLearner, resetPaperBalance, flattenAll } from "./agent.functions";

// Fire-and-forget mirror to the server-side settings row. Local state
// updates immediately for snappy UI; server cron reads the new values
// on its next tick.
const pushServer = (patch: Record<string, unknown>) => {
  void updateSettings({ data: patch as never }).catch(() => {});
};

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
  minConfidence: 0.5,
  disabled: false,
};

// Warmup: don't let the learner gate entries until the bucket has
// enough samples. Below this, use the base floor and never disable.
const WARMUP_TRADES = 15;
const DISABLE_TRADES = 40;
const DISABLE_EXPECTANCY = -0.4;

// Online learner — runs on every closed position. Updates the bucket's
// EWMA expectancy and re-derives the policy (confidence threshold + on/off).
function updateBucket(prev: BucketStats | undefined, realizedR: number): BucketStats {
  const b = prev ?? { ...DEFAULT_BUCKET };
  const trades = b.trades + 1;
  const wins = b.wins + (realizedR > 0 ? 1 : 0);
  // Breakevens (realizedR === 0) are excluded from both wins and losses
  // so they don't drag down the displayed win rate.
  const losses = b.losses + (realizedR < 0 ? 1 : 0);
  const sumR = b.sumR + realizedR;
  const alpha = 0.15;
  const expectancyR =
    b.trades === 0 ? realizedR : b.expectancyR * (1 - alpha) + realizedR * alpha;

  // Confidence floor: only nudges after warmup, gentler swing, lower cap.
  let minConfidence = 0.5;
  if (trades >= WARMUP_TRADES) {
    minConfidence = 0.55 - Math.tanh(expectancyR) * 0.1;
    minConfidence = Math.max(0.45, Math.min(0.8, minConfidence));
  }

  const disabled = trades >= DISABLE_TRADES && expectancyR < DISABLE_EXPECTANCY;


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

  // Live market mirror — written by the dashboard tick loop so other
  // routes (Brain monitor) can render live unrealized risk in real time.
  lastPrices: Record<string, { quote: number; epoch: number }>;
  setLastPrice: (symbol: string, quote: number, epoch: number) => void;
}

export const useTrading = create<State>()(
  persist(
    (set, get) => ({
      mode: "paper",
      setMode: (mode) => { set({ mode }); pushServer({ mode }); },
      apiToken: null,
      setApiToken: (apiToken) => set({ apiToken }),
      selectedSymbol: "BOOM1000",
      selectSymbol: (selectedSymbol) => set({ selectedSymbol }),
      autoTrade: true,
      setAutoTrade: (autoTrade) => set({ autoTrade }),
      stake: 10,
      setStake: (stake) => { set({ stake }); pushServer({ stake }); },
      takeProfitR: 3,
      stopLossR: 1,
      setRisk: (takeProfitR, stopLossR) => {
        set({ takeProfitR, stopLossR });
        pushServer({ tp_r: takeProfitR, sl_r: stopLossR });
      },
      maxHoldRatio: 1.2,
      setMaxHoldRatio: (maxHoldRatio) => {
        set({ maxHoldRatio });
        pushServer({ max_hold_ratio: maxHoldRatio });
      },
      preSpikeExitRatio: 0.8,
      setPreSpikeExitRatio: (preSpikeExitRatio) => {
        set({ preSpikeExitRatio });
        pushServer({ pre_spike_ratio: preSpikeExitRatio });
      },
      maxDailyLoss: 100,
      setMaxDailyLoss: (maxDailyLoss) => {
        set({ maxDailyLoss });
        pushServer({ max_daily_loss: maxDailyLoss });
      },
      positions: [],
      addPosition: (p) => set({ positions: [p, ...get().positions].slice(0, 500) }),
      closePosition: (id, exitPrice, exitEpoch, exitReason) =>
        set((state) => {
          const pos = state.positions.find((p) => p.id === id);
          if (!pos || pos.status === "closed") return state;
          const dir = pos.direction === "BUY" ? 1 : -1;
          const pnl = (exitPrice - pos.entryPrice) * dir * pos.stake;
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
      resetPaper: () => { set({ paperBalance: 1000, positions: [] }); void resetPaperBalance({ data: undefined as never }).catch(() => {}); },
      killSwitch: false,
      setKill: (killSwitch) => { set({ killSwitch }); pushServer({ kill_switch: killSwitch }); },

      learning: {},
      learningEnabled: true,
      setLearningEnabled: (learningEnabled) => {
        set({ learningEnabled });
        pushServer({ learning_enabled: learningEnabled });
      },
      resetLearning: () => { set({ learning: {} }); void resetLearner({ data: undefined as never }).catch(() => {}); },
      getPolicy: (symbol, regime, direction) =>
        get().learning[bucketKey(symbol, regime, direction)] ?? DEFAULT_BUCKET,

      lastPrices: {},
      setLastPrice: (symbol, quote, epoch) =>
        set((state) => {
          const prev = state.lastPrices[symbol];
          if (prev && prev.epoch === epoch && prev.quote === quote) return state;
          return { lastPrices: { ...state.lastPrices, [symbol]: { quote, epoch } } };
        }),

      flatten: () => { void flattenAll({ data: undefined as never }).catch(() => {}); },
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
