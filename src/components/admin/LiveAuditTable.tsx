import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listLiveAudit } from "@/lib/admin-live.functions";
import { cn } from "@/lib/utils";

interface Row {
  id: string;
  event: string;
  symbol: string | null;
  stake: number | null;
  entry: number | null;
  exit_price: number | null;
  pnl: number | null;
  contract_id: string | null;
  created_at: string;
}

const EVENT_COLOR: Record<string, string> = {
  LIVE_OPEN: "text-primary",
  LIVE_ADOPTED_AFTER_ERROR: "text-warn",
  LIVE_BUY_FAILED: "text-crash",
  LIVE_NO_AUTH: "text-crash",
  BLOCKED_HALT: "text-crash",
  BLOCKED_DAILY_LOSS: "text-crash",
  BLOCKED_MAX_OPEN: "text-warn",
  STAKE_CLAMPED: "text-warn",
  RECONCILED_CLOSE: "text-boom",
  ADOPTED_ORPHAN: "text-warn",
};

export function LiveAuditTable() {
  const load = useServerFn(listLiveAudit);
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    async function refresh() {
      try {
        const data = await load();
        setRows(data as Row[]);
        setErr(null);
      } catch (e) {
        setErr((e as Error).message);
      }
    }
    refresh();
    const t = setInterval(refresh, 10_000);
    return () => clearInterval(t);
  }, []);

  if (err) return <div className="text-xs text-crash">{err}</div>;

  return (
    <div className="max-h-[420px] overflow-auto">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-card">
          <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
            <th className="p-1.5">Time</th>
            <th className="p-1.5">Event</th>
            <th className="p-1.5">Symbol</th>
            <th className="p-1.5 text-right">Stake</th>
            <th className="p-1.5 text-right">P&amp;L</th>
            <th className="p-1.5">Contract</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={6} className="p-3 text-center text-muted-foreground">No audit rows yet.</td></tr>
          )}
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-border/50">
              <td className="p-1.5 text-muted-foreground">{new Date(r.created_at).toLocaleTimeString()}</td>
              <td className={cn("p-1.5 font-semibold", EVENT_COLOR[r.event] ?? "")}>{r.event}</td>
              <td className="p-1.5">{r.symbol ?? "—"}</td>
              <td className="p-1.5 text-right text-tabular">{r.stake?.toFixed(2) ?? "—"}</td>
              <td className={cn("p-1.5 text-right text-tabular",
                (r.pnl ?? 0) > 0 ? "text-boom" : (r.pnl ?? 0) < 0 ? "text-crash" : "")}>
                {r.pnl != null ? r.pnl.toFixed(2) : "—"}
              </td>
              <td className="p-1.5 truncate max-w-[120px] text-muted-foreground">{r.contract_id ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
