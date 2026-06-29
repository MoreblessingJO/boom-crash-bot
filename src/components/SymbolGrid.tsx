import { SYMBOLS } from "@/lib/symbols";
import { cn } from "@/lib/utils";
import { useTrading } from "@/lib/trading-store";
import { useMemo } from "react";

interface Props {
  selected: string;
  onSelect: (code: string) => void;
  prices: Record<string, number>;
  changes: Record<string, number>;
  ticksSinceSpike: Record<string, number>;
}

export function SymbolGrid({ selected, onSelect, prices, changes, ticksSinceSpike }: Props) {
  const positions = useTrading((s) => s.positions);
  const stats = useMemo(() => {
    const out: Record<string, { trades: number; wins: number }> = {};
    for (const p of positions) {
      if (p.status !== "closed") continue;
      const o = (out[p.symbol] ??= { trades: 0, wins: 0 });
      o.trades += 1;
      if ((p.pnl ?? 0) > 0) o.wins += 1;
    }
    return out;
  }, [positions]);
  return (
    <div className="grid grid-cols-3 gap-2 lg:grid-cols-6">
      {SYMBOLS.map((s) => {
        const px = prices[s.code];
        const ch = changes[s.code] ?? 0;
        const tss = ticksSinceSpike[s.code] ?? 0;
        const dueRatio = tss / s.avgSpikeTicks;
        const active = selected === s.code;
        return (
          <button
            key={s.code}
            onClick={() => onSelect(s.code)}
            className={cn(
              "group rounded-lg border bg-surface px-3 py-2.5 text-left transition-all",
              active
                ? "border-primary glow-cyan"
                : "border-border hover:border-primary/40",
            )}
          >
            <div className="flex items-center justify-between">
              <span
                className={cn(
                  "text-[10px] font-bold uppercase tracking-wider",
                  s.kind === "boom" ? "text-boom" : "text-crash",
                )}
              >
                {s.kind}
              </span>
              <span className="text-[10px] text-muted-foreground">
                /{s.avgSpikeTicks}
              </span>
            </div>
            <div className="mt-1 text-sm font-semibold">{s.label}</div>
            <div className="mt-1 text-tabular text-sm">
              {px ? px.toFixed(4) : "—"}
            </div>
            <div className="mt-1 flex items-center justify-between text-[10px]">
              <span className={ch >= 0 ? "text-boom" : "text-crash"}>
                {ch >= 0 ? "▲" : "▼"} {Math.abs(ch).toFixed(2)}
              </span>
              {(() => {
                const st = stats[s.code];
                if (!st || st.trades === 0) {
                  return <span className="text-muted-foreground">—</span>;
                }
                const wr = (st.wins / st.trades) * 100;
                return (
                  <span
                    className={cn(
                      "text-tabular font-semibold",
                      wr >= 60 ? "text-boom" : wr >= 45 ? "text-warn" : "text-crash",
                    )}
                    title={`${st.wins}W / ${st.trades - st.wins}L`}
                  >
                    {wr.toFixed(0)}% ({st.trades})
                  </span>
                );
              })()}
            </div>
            <div className="mt-1 flex items-center justify-between text-[10px]">
              <span className="text-muted-foreground">since spike</span>
              <span
                className={cn(
                  "text-muted-foreground",
                  dueRatio > 0.8 && "text-warn",
                  dueRatio > 1 && "text-primary",
                )}
              >
                {tss}t
              </span>
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-border">
              <div
                className={cn(
                  "h-full transition-all",
                  dueRatio > 1 ? "bg-primary glow-cyan" : "bg-primary/60",
                )}
                style={{ width: `${Math.min(100, dueRatio * 100)}%` }}
              />
            </div>
          </button>
        );
      })}
    </div>
  );
}
