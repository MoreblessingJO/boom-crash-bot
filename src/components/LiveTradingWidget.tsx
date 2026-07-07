// Landing-page side card: shows recent live/paper trades as social proof.
// Reads from Supabase directly with the anon key (RLS allows public/read where policy permits;
// falls back to seeded demo rows when empty).
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type Row = { symbol: string; direction: "BUY" | "SELL"; pnl: number | null; when: string };

const DEMO: Row[] = [
  { symbol: "BOOM 500", direction: "BUY", pnl: 0.42, when: "2m ago" },
  { symbol: "CRASH 1000", direction: "SELL", pnl: 0.31, when: "5m ago" },
  { symbol: "BOOM 300", direction: "BUY", pnl: -0.18, when: "8m ago" },
  { symbol: "CRASH 500", direction: "SELL", pnl: 0.55, when: "11m ago" },
  { symbol: "BOOM 1000", direction: "BUY", pnl: 0.27, when: "14m ago" },
  { symbol: "CRASH 300", direction: "SELL", pnl: 0.19, when: "18m ago" },
];

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function LiveTradingWidget() {
  const [rows, setRows] = useState<Row[]>(DEMO);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("positions")
        .select("symbol, side, pnl, opened_at")
        .order("opened_at", { ascending: false })
        .limit(6);
      if (cancelled || !data || data.length === 0) return;
      setRows(
        data.map((d) => ({
          symbol: d.symbol,
          direction: d.side === "SELL" ? "SELL" : "BUY",
          pnl: d.pnl,
          when: timeAgo(d.opened_at),
        })),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="rounded-2xl border border-border bg-card/60 p-5 backdrop-blur">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
          <h3 className="font-display text-sm font-bold uppercase tracking-wider">
            Live trades
          </h3>
        </div>
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
          Streaming
        </span>
      </div>
      <ul className="space-y-2">
        {rows.map((r, i) => (
          <li
            key={i}
            className="flex items-center justify-between rounded-lg border border-border/50 bg-background/50 px-3 py-2 text-sm"
          >
            <div className="flex min-w-0 items-center gap-2">
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] font-black",
                  r.direction === "BUY"
                    ? "bg-primary/15 text-primary"
                    : "bg-crash/15 text-crash",
                )}
              >
                {r.direction}
              </span>
              <span className="truncate font-medium">{r.symbol}</span>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span
                className={cn(
                  "text-tabular font-bold",
                  r.pnl == null
                    ? "text-muted-foreground"
                    : r.pnl >= 0
                      ? "text-primary"
                      : "text-crash",
                )}
              >
                {r.pnl == null ? "—" : `${r.pnl >= 0 ? "+" : ""}${r.pnl.toFixed(2)}`}
              </span>
              <span className="text-muted-foreground">{r.when}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
