// Hydrates the Zustand cache from the server and keeps it live via Realtime.
// The server-side cron loop is the source of truth; the browser is a viewer.
import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getDashboardState } from "./agent.functions";
import { useTrading, type Position, bucketKey } from "./trading-store";
import type { Direction, Regime } from "./strategy";

type DbPosition = {
  id: string;
  symbol: string;
  side: string;
  regime: string;
  entry_price: number | string;
  exit_price: number | string | null;
  stake: number | string;
  tp_r: number | string;
  sl_r: number | string;
  unit: number | string;
  pnl: number | string | null;
  realized_r: number | string | null;
  status: string;
  reason: string | null;
  exit_reason: string | null;
  opened_epoch: number | string;
  closed_epoch: number | string | null;
};

const n = (v: unknown, d = 0): number => (v == null ? d : Number(v));

function mapPosition(p: DbPosition, mode: "paper" | "signals" | "live"): Position {
  const entry = n(p.entry_price);
  const unit = n(p.unit);
  const tpR = n(p.tp_r);
  const slR = n(p.sl_r);
  const dir = p.side === "BUY" ? 1 : -1;
  return {
    id: p.id,
    symbol: p.symbol,
    direction: p.side as Direction,
    entryPrice: entry,
    entryEpoch: n(p.opened_epoch),
    stake: n(p.stake),
    status: p.status as "open" | "closed",
    exitPrice: p.exit_price == null ? undefined : n(p.exit_price),
    exitEpoch: p.closed_epoch == null ? undefined : n(p.closed_epoch),
    exitReason:
      p.exit_reason === "TP" ? "TP"
      : p.exit_reason === "SL" ? "SL"
      : p.exit_reason === "PRE_SPIKE" ? "pre-spike"
      : p.exit_reason === "TIME_STOP" ? "time"
      : p.exit_reason === "MANUAL" ? "manual"
      : undefined,
    pnl: p.pnl == null ? undefined : n(p.pnl),
    realizedR: p.realized_r == null ? undefined : n(p.realized_r),
    mode,
    reason: p.reason ?? "",
    regime: p.regime as Regime,
    rUnit: unit,
    tpPrice: entry + dir * unit * tpR,
    slPrice: entry - dir * unit * slR,
    maxHoldTicks: 0,
    ticksHeld: 0,
  };
}

export function useServerSync() {
  const fetchState = useServerFn(getDashboardState);

  useEffect(() => {
    let cancelled = false;

    async function pull() {
      const s = await fetchState();
      if (cancelled || !s) return;

      const setState = useTrading.setState;

      // Settings
      if (s.settings) {
        const cfg = s.settings;
        setState({
          mode: cfg.mode as "paper" | "signals" | "live",
          stake: n(cfg.stake, 1),
          riskPct: n((cfg as { risk_pct?: number | string }).risk_pct, 0.01),
          takeProfitR: n(cfg.tp_r, 3),
          stopLossR: n(cfg.sl_r, 1),
          preSpikeExitRatio: n(cfg.pre_spike_ratio, 0.8),
          maxHoldRatio: n(cfg.max_hold_ratio, 1.2),
          maxDailyLoss: n(cfg.max_daily_loss, 50),
          killSwitch: !!cfg.kill_switch,
          learningEnabled: !!cfg.learning_enabled,
          paperBalance: n(cfg.paper_balance, 1000),
          autoTrade: !cfg.kill_switch && cfg.mode !== "signals",
        });
      }

      // Positions
      const mode = (s.settings?.mode ?? "paper") as "paper" | "signals" | "live";
      const positions: Position[] = [
        ...(s.openPositions as DbPosition[]).map((p) => mapPosition(p, mode)),
        ...(s.recentClosed as DbPosition[]).map((p) => mapPosition(p, mode)),
      ];
      setState({ positions });

      // Learning buckets
      const learning: Record<string, ReturnType<typeof bucketShape>> = {};
      for (const b of s.buckets as Array<{
        bucket_key: string; trades: number; wins: number; losses: number;
        ewma_r: number | string; disabled: boolean; symbol: string; regime: string; direction: string;
      }>) {
        learning[b.bucket_key] = bucketShape(b);
      }
      setState({ learning });
    }

    pull();

    const channel = supabase
      .channel("agent-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "positions" }, () => pull())
      .on("postgres_changes", { event: "*", schema: "public", table: "settings" }, () => pull())
      .on("postgres_changes", { event: "*", schema: "public", table: "learning_buckets" }, () => pull())
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [fetchState]);
}

function bucketShape(b: {
  trades: number; wins: number; losses: number; ewma_r: number | string; disabled: boolean;
}) {
  const trades = b.trades;
  const ewma = n(b.ewma_r);
  let minConfidence = 0.5;
  if (trades >= 15) {
    minConfidence = 0.55 - Math.tanh(ewma) * 0.1;
    minConfidence = Math.max(0.45, Math.min(0.8, minConfidence));
  }
  return {
    trades,
    wins: b.wins,
    losses: b.losses,
    sumR: ewma * trades, // approximation; UI shows expectancy anyway
    expectancyR: ewma,
    lastUpdated: Date.now(),
    minConfidence,
    disabled: !!b.disabled,
  };
}

// Silence unused-import warning for bucketKey re-export
void bucketKey;
