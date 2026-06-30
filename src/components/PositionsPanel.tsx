import { useState } from "react";
import { useTrading } from "@/lib/trading-store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { closePosition } from "@/lib/agent.functions";
import { toast } from "sonner";

export function PositionsPanel({ livePrices }: { livePrices: Record<string, number> }) {
  const positions = useTrading((s) => s.positions);
  const paperBalance = useTrading((s) => s.paperBalance);

  const open = positions.filter((p) => p.status === "open");
  const closed = positions.filter((p) => p.status === "closed");

  const realized = closed.reduce((s, p) => s + (p.pnl ?? 0), 0);
  const wins = closed.filter((p) => (p.pnl ?? 0) > 0).length;
  const losses = closed.filter((p) => (p.pnl ?? 0) < 0).length;
  const decided = wins + losses; // exclude breakevens from win-rate denominator
  const winRate = decided ? (wins / decided) * 100 : 0;
  const unrealized = open.reduce((s, p) => {
    const px = livePrices[p.symbol];
    if (!px) return s;
    const dir = p.direction === "BUY" ? 1 : -1;
    return s + (px - p.entryPrice) * dir * p.stake;
  }, 0);

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="grid grid-cols-4 gap-3">
        <Stat label="Paper balance" value={`$${paperBalance.toFixed(2)}`} accent="primary" />
        <Stat
          label="Unrealized P&L"
          value={`${unrealized >= 0 ? "+" : ""}$${unrealized.toFixed(2)}`}
          accent={unrealized >= 0 ? "boom" : "crash"}
        />
        <Stat
          label="Realized P&L"
          value={`${realized >= 0 ? "+" : ""}$${realized.toFixed(2)}`}
          accent={realized >= 0 ? "boom" : "crash"}
        />
        <Stat label="Win rate" value={`${winRate.toFixed(0)}%`} accent="muted" />
      </div>

      <div className="flex-1 overflow-hidden rounded-lg border border-border bg-surface">
        <div className="grid grid-cols-12 gap-2 border-b border-border px-3 py-2 text-[11px] uppercase tracking-wider text-muted-foreground">
          <div className="col-span-2">Symbol</div>
          <div className="col-span-1">Dir</div>
          <div className="col-span-2">Entry</div>
          <div className="col-span-2">Mark</div>
          <div className="col-span-2">P&L</div>
          <div className="col-span-1">Mode</div>
          <div className="col-span-1">Status</div>
          <div className="col-span-1 text-right">Action</div>
        </div>
        <div className="max-h-[420px] overflow-y-auto text-tabular">
          {positions.length === 0 && (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              No positions yet — start the agent to begin paper trading.
            </div>
          )}
          {positions.map((p) => {
            const mark = livePrices[p.symbol] ?? p.exitPrice ?? p.entryPrice;
            const dir = p.direction === "BUY" ? 1 : -1;
            const pnl =
              p.status === "closed"
                ? (p.pnl ?? 0)
                : (mark - p.entryPrice) * dir * p.stake;
            return (
              <div
                key={p.id}
                className="grid grid-cols-12 items-center gap-2 border-b border-border/40 px-3 py-2 text-sm"
              >
                <div className="col-span-2 font-medium">{p.symbol}</div>
                <div
                  className={cn(
                    "col-span-1 font-semibold",
                    p.direction === "BUY" ? "text-boom" : "text-crash",
                  )}
                >
                  {p.direction}
                </div>
                <div className="col-span-2 text-muted-foreground">
                  {p.entryPrice.toFixed(4)}
                </div>
                <div className="col-span-2">{mark.toFixed(4)}</div>
                <div
                  className={cn(
                    "col-span-2 font-semibold",
                    pnl >= 0 ? "text-boom" : "text-crash",
                  )}
                >
                  {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
                </div>
                <div className="col-span-1 text-xs uppercase text-muted-foreground">
                  {p.mode}
                </div>
                <div className="col-span-2">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] uppercase",
                      p.status === "open"
                        ? "bg-primary/15 text-primary"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {p.status}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: "primary" | "boom" | "crash" | "muted";
}) {
  const color =
    accent === "primary"
      ? "text-primary"
      : accent === "boom"
        ? "text-boom"
        : accent === "crash"
          ? "text-crash"
          : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={cn("mt-0.5 text-lg font-semibold text-tabular", color)}>
        {value}
      </div>
    </div>
  );
}
