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
  pnl?: number;
  mode: Mode;
  reason: string;
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
  takeProfitPips: number;
  stopLossPips: number;
  setRisk: (tp: number, sl: number) => void;
  maxDailyLoss: number;
  setMaxDailyLoss: (n: number) => void;
  positions: Position[];
  addPosition: (p: Position) => void;
  closePosition: (id: string, exitPrice: number, exitEpoch: number) => void;
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
      takeProfitPips: 5,
      stopLossPips: 3,
      setRisk: (takeProfitPips, stopLossPips) => set({ takeProfitPips, stopLossPips }),
      maxDailyLoss: 50,
      setMaxDailyLoss: (maxDailyLoss) => set({ maxDailyLoss }),
      positions: [],
      addPosition: (p) => set({ positions: [p, ...get().positions].slice(0, 200) }),
      closePosition: (id, exitPrice, exitEpoch) =>
        set({
          positions: get().positions.map((p) => {
            if (p.id !== id || p.status === "closed") return p;
            const dir = p.direction === "BUY" ? 1 : -1;
            const pnl = (exitPrice - p.entryPrice) * dir * p.stake;
            return { ...p, status: "closed", exitPrice, exitEpoch, pnl };
          }),
          paperBalance:
            get().positions.find((p) => p.id === id)?.mode === "paper"
              ? get().paperBalance +
                ((exitPrice -
                  (get().positions.find((p) => p.id === id)?.entryPrice ?? 0)) *
                  (get().positions.find((p) => p.id === id)?.direction === "BUY" ? 1 : -1) *
                  (get().positions.find((p) => p.id === id)?.stake ?? 0))
              : get().paperBalance,
        }),
      signals: [],
      pushSignal: (s) => set({ signals: [s, ...get().signals].slice(0, 100) }),
      paperBalance: 1000,
      resetPaper: () => set({ paperBalance: 1000, positions: [] }),
      killSwitch: false,
      setKill: (killSwitch) => set({ killSwitch }),
    }),
    {
      name: "boom-crash-agent",
      partialize: (s) => ({
        mode: s.mode,
        apiToken: s.apiToken,
        selectedSymbol: s.selectedSymbol,
        autoTrade: s.autoTrade,
        stake: s.stake,
        takeProfitPips: s.takeProfitPips,
        stopLossPips: s.stopLossPips,
        maxDailyLoss: s.maxDailyLoss,
        paperBalance: s.paperBalance,
      }),
    },
  ),
);
