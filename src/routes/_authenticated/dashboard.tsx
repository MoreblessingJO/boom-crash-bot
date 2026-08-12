// Home screen: greeting, portfolio hero, AI agent, quick actions.
import { createFileRoute, useSearch, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getMyRoles } from "@/lib/deriv-oauth.functions";
import { getMyAgent } from "@/lib/agents.functions";
import { getMyRiskProfile } from "@/lib/risk.functions";
import { listAgentPerformance, getAgentEquityCurve } from "@/lib/agent-performance.functions";
import { AppShell, Panel, SectionTitle, Stat, Sparkline } from "@/components/app/AppShell";
import { useDerivAccount } from "@/components/app/DerivConnect";
import { Button } from "@/components/ui/button";
import {
  Loader2, Bot, ArrowRight, TrendingUp, TrendingDown, Sparkles, Link2,
  SlidersHorizontal, ShieldCheck, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { cn } from "@/lib/utils";

const searchSchema = z.object({
  connected: z.string().optional(),
  deriv_error: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/dashboard")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Home — NexxTrade AI Trading" },
      { name: "description", content: "Your NexxTrade home: portfolio value, active AI agent, live performance and quick actions." },
      { property: "og:title", content: "Home — NexxTrade AI Trading" },
      { property: "og:description", content: "Portfolio value, active AI agent and live performance at a glance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DashboardPage,
});

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function DashboardPage() {
  const search = useSearch({ from: "/_authenticated/dashboard" });
  const [name, setName] = useState("Trader");

  const rolesQ = useQuery({ queryKey: ["my-roles"], queryFn: useServerFn(getMyRoles) });
  const agentFn = useServerFn(getMyAgent);
  const agentQ = useQuery({ queryKey: ["my-agent"], queryFn: () => agentFn() });
  const riskFn = useServerFn(getMyRiskProfile);
  const riskQ = useQuery({ queryKey: ["risk-profile"], queryFn: () => riskFn() });
  const perfFn = useServerFn(listAgentPerformance);
  const perfQ = useQuery({ queryKey: ["agent-performance"], queryFn: () => perfFn(), staleTime: 20_000 });
  const curveFn = useServerFn(getAgentEquityCurve);
  const acctQ = useDerivAccount();

  const agents = perfQ.data ?? [];
  const total = agents.reduce((s, a) => s + Number(a.current_balance ?? 0), 0);
  const start = agents.reduce((s, a) => s + Number(a.starting_balance ?? 0), 0);
  const net = total - start;
  const pct = start ? (net / start) * 100 : 0;
  const trades = agents.reduce((s, a) => s + Number(a.trades ?? 0), 0);
  const wins = agents.reduce((s, a) => s + Number(a.wins ?? 0), 0);
  const lead = agents[0];

  const curveQ = useQuery({
    queryKey: ["equity-curve", lead?.agent_id],
    queryFn: () => curveFn({ data: { agentId: lead!.agent_id, days: 30 } }),
    enabled: !!lead,
  });

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const meta = data.user?.user_metadata as { full_name?: string; name?: string } | undefined;
      const n = meta?.full_name ?? meta?.name ?? data.user?.email?.split("@")[0];
      if (n) setName(n.split(" ")[0]);
    });
  }, []);

  useEffect(() => {
    if (search.connected) toast.success(`Connected ${search.connected} Deriv account(s)`);
    if (search.deriv_error) toast.error(`Deriv error: ${search.deriv_error}`);
  }, [search.connected, search.deriv_error]);

  return (
    <AppShell title={`${greeting()}, ${name}`} subtitle="Here's how your AI is performing today">
      <Panel className="relative overflow-hidden bg-navy text-background">
        <div className="text-xs font-medium uppercase tracking-wide opacity-70">Portfolio value</div>
        <div className="mt-1 text-[40px] font-bold leading-none tracking-tight text-tabular">
          ${total.toFixed(2)}
        </div>
        <div
          className={cn(
            "mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
            net >= 0 ? "bg-primary/20 text-primary" : "bg-destructive/25 text-destructive",
          )}
        >
          {net >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
          {net >= 0 ? "+" : ""}${net.toFixed(2)} ({pct.toFixed(1)}%)
        </div>
        {(curveQ.data?.length ?? 0) > 1 && (
          <Sparkline points={curveQ.data!.map((p) => p.equity)} tone={net >= 0 ? "up" : "down"} className="mt-4 h-20" />
        )}
        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-background/15 pt-4">
          <Stat label="Agents" value={agents.length} />
          <Stat label="Trades" value={trades} />
          <Stat label="Win rate" value={`${trades ? Math.round((wins / trades) * 100) : 0}%`} />
        </div>
      </Panel>

      {!riskQ.isLoading && !riskQ.data && (
        <Link to="/risk" className="block">
          <Panel className="flex items-center gap-3 border-primary bg-primary/8">
            <SlidersHorizontal className="h-5 w-5 shrink-0 text-primary" />
            <div className="flex-1">
              <div className="text-sm font-bold">Complete your risk assessment</div>
              <div className="text-xs text-muted-foreground">Maxx AI needs it to size your trades.</div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Panel>
        </Link>
      )}

      <SectionTitle>Your AI agent</SectionTitle>
      {agentQ.isLoading ? (
        <Panel className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading your agent…
        </Panel>
      ) : agentQ.data ? (
        <Panel className="flex items-center gap-4">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary">
            <Bot className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-lg font-bold">{agentQ.data.agent.name}</span>
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">
                Deployed
              </span>
            </div>
            <div className="mt-0.5 truncate text-sm text-muted-foreground">{agentQ.data.agent.tagline}</div>
          </div>
          <Button asChild variant="outline" size="sm" className="rounded-full">
            <Link to="/agents">Change</Link>
          </Button>
        </Panel>
      ) : (
        <Panel className="border-primary bg-primary/8">
          <div className="flex items-center gap-3">
            <Bot className="h-6 w-6 shrink-0 text-primary" />
            <div className="flex-1">
              <div className="text-base font-bold">Pick your agent</div>
              <div className="text-sm text-muted-foreground">Choose which AI strategy trades your account.</div>
            </div>
          </div>
          <Button asChild className="mt-4 h-12 w-full rounded-2xl font-semibold glow-boom">
            <Link to="/agents">
              Browse agents <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </Panel>
      )}

      {!acctQ.isLoading && !acctQ.data && (
        <Link to="/assets" className="block">
          <Panel className="flex items-center gap-3">
            <Link2 className="h-5 w-5 shrink-0 text-electric" />
            <div className="flex-1">
              <div className="text-sm font-bold">Connect your exchange</div>
              <div className="text-xs text-muted-foreground">Link Deriv to let your agent execute.</div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Panel>
        </Link>
      )}

      <SectionTitle>Agent leaderboard</SectionTitle>
      <Panel className="divide-y divide-border p-0">
        {agents.length === 0 && (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">No agent data yet.</div>
        )}
        {agents.map((a, i) => {
          const up = Number(a.net_pnl) >= 0;
          return (
            <Link
              key={a.agent_id}
              to="/agents/$slug"
              params={{ slug: a.slug }}
              className="flex items-center gap-3 px-5 py-4 transition hover:bg-muted/50"
            >
              <span className="w-4 shrink-0 text-sm font-bold text-muted-foreground">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold">{a.name}</div>
                <div className="text-xs text-muted-foreground">
                  {a.trades} trades · {a.win_rate}% win
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-sm font-bold text-tabular">${Number(a.current_balance).toFixed(2)}</div>
                <div className={cn("text-xs font-semibold text-tabular", up ? "text-primary" : "text-destructive")}>
                  {up ? "+" : ""}${Number(a.net_pnl).toFixed(2)}
                </div>
              </div>
            </Link>
          );
        })}
      </Panel>

      <SectionTitle>Quick actions</SectionTitle>
      <div className="grid grid-cols-2 gap-3">
        <QuickAction to="/ai" icon={Sparkles} label="Ask Maxx AI" hint="Your co-pilot" />
        <QuickAction to="/trades" icon={TrendingUp} label="Trade history" hint="Every fill" />
        <QuickAction to="/risk" icon={SlidersHorizontal} label="Risk settings" hint="Tune sizing" />
        {rolesQ.data?.isAdmin ? (
          <QuickAction to="/admin" icon={ShieldCheck} label="Admin" hint="Engine control" />
        ) : (
          <QuickAction to="/resources" icon={Bot} label="Learn" hint="Guides & FAQ" />
        )}
      </div>
    </AppShell>
  );
}

function QuickAction({
  to,
  icon: Icon,
  label,
  hint,
}: {
  to: "/ai" | "/trades" | "/risk" | "/admin" | "/resources";
  icon: typeof Bot;
  label: string;
  hint: string;
}) {
  return (
    <Link to={to}>
      <Panel className="h-full p-4 transition hover:border-primary">
        <Icon className="h-5 w-5 text-primary" />
        <div className="mt-3 text-sm font-bold">{label}</div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </Panel>
    </Link>
  );
}
