import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell, Panel, SectionTitle, Sparkline } from "@/components/app/AppShell";
import { DerivConnectPanel } from "@/components/app/DerivConnect";
import { listAgentPerformance, getAgentEquityCurve } from "@/lib/agent-performance.functions";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";

export const Route = createFileRoute("/_authenticated/assets")({
  head: () => ({
    meta: [
      { title: "Assets & Allocation — NexxTrade" },
      { name: "description", content: "See how your capital is allocated across NexxTrade AI agents and markets, and connect your exchange." },
      { property: "og:title", content: "Assets & Allocation — NexxTrade" },
      { property: "og:description", content: "Capital allocation across AI agents and markets, plus exchange connections." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AssetsPage,
});

function AssetsPage() {
  const perfFn = useServerFn(listAgentPerformance);
  const curveFn = useServerFn(getAgentEquityCurve);
  const perfQ = useQuery({ queryKey: ["agent-performance"], queryFn: () => perfFn(), staleTime: 20_000 });
  const agents = perfQ.data ?? [];
  const total = agents.reduce((s, a) => s + Number(a.current_balance ?? 0), 0);
  const start = agents.reduce((s, a) => s + Number(a.starting_balance ?? 0), 0);
  const net = total - start;
  const top = agents[0];

  const curveQ = useQuery({
    queryKey: ["equity-curve", top?.agent_id],
    queryFn: () => curveFn({ data: { agentId: top!.agent_id, days: 30 } }),
    enabled: !!top,
  });
  const points = (curveQ.data ?? []).map((p) => p.equity);

  return (
    <AppShell title="Assets" subtitle="Allocation across agents and markets">
      <Panel className="bg-navy text-background">
        <div className="text-xs font-medium uppercase tracking-wide opacity-70">Total portfolio value</div>
        <div className="mt-1 text-4xl font-bold tracking-tight text-tabular">${total.toFixed(2)}</div>
        <div className={cn("mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
          net >= 0 ? "bg-primary/20 text-primary" : "bg-destructive/20 text-destructive")}
        >
          {net >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
          {net >= 0 ? "+" : ""}${net.toFixed(2)} all time
        </div>
        {points.length > 1 && <Sparkline points={points} tone={net >= 0 ? "up" : "down"} className="mt-3 h-20" />}
      </Panel>

      <SectionTitle>Allocation</SectionTitle>
      <Panel className="space-y-4">
        {agents.length === 0 && <p className="text-sm text-muted-foreground">No agents allocated yet.</p>}
        {agents.map((a) => {
          const pct = total ? (Number(a.current_balance) / total) * 100 : 0;
          const up = Number(a.net_pnl) >= 0;
          return (
            <div key={a.agent_id}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-semibold">{a.name}</span>
                <span className="text-tabular text-muted-foreground">
                  ${Number(a.current_balance).toFixed(2)} · {pct.toFixed(0)}%
                </span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full rounded-full", up ? "bg-primary" : "bg-destructive")}
                  style={{ width: `${Math.max(2, pct)}%` }}
                />
              </div>
            </div>
          );
        })}
      </Panel>

      <SectionTitle>Markets</SectionTitle>
      <div className="grid grid-cols-3 gap-2">
        {[
          { name: "Boom & Crash", state: "Active" },
          { name: "Crypto", state: "Soon" },
          { name: "Forex", state: "Soon" },
        ].map((m) => (
          <Panel key={m.name} className="p-4 text-center">
            <div className="text-sm font-bold leading-tight">{m.name}</div>
            <div
              className={cn(
                "mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                m.state === "Active" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
              )}
            >
              {m.state}
            </div>
          </Panel>
        ))}
      </div>

      <SectionTitle>Exchanges</SectionTitle>
      <DerivConnectPanel />
    </AppShell>
  );
}
