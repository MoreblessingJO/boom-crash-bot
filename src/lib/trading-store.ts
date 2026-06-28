import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Direction, Signal } from "./strategy";

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
  mode: Mode;
  reason: string;
  // Per-position risk snapshot — locks in the volatility at entry time
  // so SL/TP scale with the instrument rather than a fixed pip count.
  rUnit: number;            // 1R in price terms (median abs tick change @ entry)
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

  // Risk in R-multiples (multiples of median tick move captured at entry).
  // TP must be > SL — default 3:1 RR so a single loss does NOT erase a long win streak.
  takeProfitR: number;
  stopLossR: number;
  setRisk: (tpR: number, slR: number) => void;
  // Time stop as a fraction of the symbol's avgSpikeTicks.
  maxHoldRatio: number;
  setMaxHoldRatio: (r: number) => void;
  // Pre-spike exit: close trades held against the spike direction once
  // ticksSinceSpike >= preSpikeExitRatio * avgSpikeTicks.
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
      addPosition: (p) => set({ positions: [p, ...get().positions].slice(0, 200) }),
      closePosition: (id, exitPrice, exitEpoch, exitReason) =>
        set((state) => {
          const pos = state.positions.find((p) => p.id === id);
          if (!pos || pos.status === "closed") return state;
          const dir = pos.direction === "BUY" ? 1 : -1;
          const pnl = (exitPrice - pos.entryPrice) * dir * pos.stake;
          return {
            positions: state.positions.map((p) =>
              p.id === id
                ? { ...p, status: "closed", exitPrice, exitEpoch, exitReason, pnl }
                : p,
            ),
            paperBalance:
              pos.mode === "paper" ? state.paperBalance + pnl : state.paperBalance,
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
    }),
    {
      name: "boom-crash-agent",
      version: 2,
      migrate: (persisted: unknown, version) => {
        const p = (persisted ?? {}) as Record<string, unknown>;
        if (version < 2) {
          // Drop legacy fixed-pip risk fields; defaults above take over.
          delete p.takeProfitPips;
          delete p.stopLossPips;
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
      }),
    },
  ),
);
