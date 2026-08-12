import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppShell, Panel, Stat } from "@/components/app/AppShell";
import { listAgentPerformance, getAgentPositions } from "@/lib/agent-performance.functions";
import { cn } from "@/lib/utils";
import { ArrowUpRight, ArrowDownRight, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/trades")({
  head: () => ({
    meta: [
      { title: "Trades — NexxTrade" },
      { name: "description", content: "Every trade your NexxTrade AI agents have taken, with entry, exit and profit or loss." },
      { property: "og:title", content: "Trades — NexxTrade" },
      { property: "og:description", content: "Every trade your NexxTrade AI agents have taken, with entry, exit and P&L." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TradesPage,
});

function TradesPage() {
  const perfFn = useServerFn(listAgentPerformance);
  const posFn = useServerFn(getAgentPositions);
  const perfQ = useQuery({ queryKey: ["agent-performance"], queryFn: () => perfFn(), staleTime: 20_000 });
  const [agentId, setAgentId] = useState<string | null>(null);
  const agents = perfQ.data ?? [];
  const active = agentId ?? agents[0]?.agent_id ?? null;

  const posQ = useQuery({
    queryKey: ["agent-positions", active],
    queryFn: () => posFn({ data: { agentId: active as string, limit: 100 } }),
    enabled: !!active,
  });

  const rows = posQ.data ?? [];
  const closed = rows.filter((r) => r.status === "closed");
  const wins = closed.filter((r) => Number(r.pnl) > 0).length;
  const net = closed.reduce((s, r) => s + Number(r.pnl ?? 0), 0);

  return (
    <AppShell title="Trades" subtitle="Live execution history across your agents">
      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
        {agents.map((a) => (
          <button
            key={a.agent_id}
            onClick={() => setAgentId(a.agent_id)}
            className={cn(
              "shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition",
              a.agent_id === active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {a.name}
          </button>
        ))}
      </div>

      <Panel className="grid grid-cols-3 gap-2">
        <Stat label="Trades" value={closed.length} />
        <Stat label="Win rate" value={`${closed.length ? Math.round((wins / closed.length) * 100) : 0}%`} />
        <Stat label="Net P&L" value={`${net >= 0 ? "+" : ""}$${net.toFixed(2)}`} tone={net >= 0 ? "up" : "down"} />
      </Panel>

      {posQ.isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <Panel className="py-10 text-center text-sm text-muted-foreground">
          No trades recorded yet for this agent.
        </Panel>
      ) : (
        <div className="space-y-2">
          {rows.map((p) => {
            const pnl = Number(p.pnl ?? 0);
            const up = pnl >= 0;
            return (
              <Panel key={p.id} className="flex items-center gap-3 py-4">
                <div
                  className={cn(
                    "grid h-10 w-10 shrink-0 place-items-center rounded-full",
                    up ? "bg-primary/15 text-primary" : "bg-destructive/10 text-destructive",
                  )}
                >
                  {up ? <ArrowUpRight className="h-5 w-5" /> : <ArrowDownRight className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-bold">{p.symbol}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                      {p.side}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {new Date(p.opened_at).toLocaleString()} · stake ${Number(p.stake).toFixed(2)}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  {p.status === "closed" ? (
                    <div className={cn("text-sm font-bold text-tabular", up ? "text-primary" : "text-destructive")}>
                      {up ? "+" : ""}${pnl.toFixed(2)}
                    </div>
                  ) : (
                    <div className="text-xs font-semibold text-electric">OPEN</div>
                  )}
                  <div className="text-[11px] text-muted-foreground">{p.exit_reason ?? "—"}</div>
                </div>
              </Panel>
            );
          })}
        </div>
      )}

      <Link to="/agents" className="block pt-2 text-center text-sm font-semibold text-primary">
        Browse all agents →
      </Link>
    </AppShell>
  );
}
