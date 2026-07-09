import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo } from "react";
import {
  getAgentBySlug,
  getAgentPositions,
  getAgentEquityCurve,
} from "@/lib/agent-performance.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, ArrowLeft, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export const Route = createFileRoute("/_authenticated/agents/$slug")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.slug} · Agent · NexxTrade` },
      { name: "description", content: `Deep performance metrics for the ${params.slug} NexxTrade agent.` },
    ],
  }),
  component: AgentDetail,
});

function AgentDetail() {
  const { slug } = Route.useParams();
  const agentFn = useServerFn(getAgentBySlug);
  const posFn = useServerFn(getAgentPositions);
  const eqFn = useServerFn(getAgentEquityCurve);

  const q = useQuery({ queryKey: ["agent-by-slug", slug], queryFn: () => agentFn({ data: { slug } }) });
  const agentId = q.data?.agent.id;

  const posQ = useQuery({
    queryKey: ["agent-positions-full", agentId],
    queryFn: () => posFn({ data: { agentId: agentId!, limit: 100 } }),
    enabled: !!agentId,
    refetchInterval: 15_000,
  });
  const eqQ = useQuery({
    queryKey: ["agent-equity-full", agentId],
    queryFn: () => eqFn({ data: { agentId: agentId!, days: 30 } }),
    enabled: !!agentId,
    refetchInterval: 30_000,
  });

  const equity = useMemo(() => (eqQ.data ?? []).map((p) => ({
    t: new Date(p.t).getTime(),
    equity: p.equity,
  })), [eqQ.data]);

  if (q.isLoading) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-10">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading agent…
        </div>
      </main>
    );
  }
  if (q.error || !q.data) throw notFound();

  const { agent, performance } = q.data;
  const perf = performance ?? {
    starting_balance: 1000, current_balance: 1000, return_pct: 0,
    trades: 0, wins: 0, losses: 0, win_rate: 0, net_pnl: 0,
    avg_win: 0, avg_loss: 0, best_trade: 0, worst_trade: 0, last_trade_at: null,
  };
  const profitFactor = Number(perf.avg_loss) < 0
    ? Math.abs((Number(perf.avg_win) * (perf.wins || 0)) / (Number(perf.avg_loss) * (perf.losses || 1)))
    : 0;

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <Link to="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to dashboard
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-4xl font-black tracking-tight">{agent.name}</h1>
            <Badge variant="outline" className="border-primary/40 text-primary uppercase">{agent.status}</Badge>
          </div>
          <p className="mt-1 max-w-2xl text-muted-foreground">{agent.tagline}</p>
        </div>
        <div className="text-right">
          <div className="font-display text-4xl font-black tabular-nums">
            ${Number(perf.current_balance).toFixed(2)}
          </div>
          <div className={cn(
            "mt-1 inline-flex items-center gap-1 text-sm tabular-nums",
            Number(perf.return_pct) >= 0 ? "text-primary" : "text-destructive",
          )}>
            {Number(perf.return_pct) >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            {Number(perf.return_pct) >= 0 ? "+" : ""}{Number(perf.return_pct).toFixed(2)}%
            <span className="text-muted-foreground">since ${Number(perf.starting_balance).toFixed(0)} start</span>
          </div>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Total trades" value={String(perf.trades)} />
        <Metric label="Win rate" value={`${Number(perf.win_rate).toFixed(1)}%`} sub={`${perf.wins}W / ${perf.losses}L`} />
        <Metric label="Net P&L" value={`${Number(perf.net_pnl) >= 0 ? "+" : ""}$${Number(perf.net_pnl).toFixed(2)}`} tone={Number(perf.net_pnl) >= 0 ? "up" : "down"} />
        <Metric label="Profit factor" value={profitFactor > 0 ? profitFactor.toFixed(2) : "—"} />
        <Metric label="Avg win" value={`+$${Number(perf.avg_win).toFixed(2)}`} tone="up" />
        <Metric label="Avg loss" value={`$${Number(perf.avg_loss).toFixed(2)}`} tone="down" />
        <Metric label="Best trade" value={`+$${Number(perf.best_trade).toFixed(2)}`} tone="up" />
        <Metric label="Worst trade" value={`$${Number(perf.worst_trade).toFixed(2)}`} tone="down" />
      </div>

      <Card>
        <CardHeader><CardTitle>Equity curve (30 days)</CardTitle></CardHeader>
        <CardContent>
          <div className="h-72 w-full">
            {equity.length < 2 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Not enough closed trades yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={equity}>
                  <XAxis
                    dataKey="t" type="number" domain={["dataMin", "dataMax"]}
                    tickFormatter={(v) => new Date(v).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    stroke="hsl(var(--muted-foreground))" fontSize={11}
                  />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} domain={["auto", "auto"]}
                    tickFormatter={(v) => `$${Number(v).toFixed(0)}`} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                    labelFormatter={(v) => new Date(v as number).toLocaleString()}
                    formatter={(v) => [`$${Number(v).toFixed(2)}`, "Equity"]}
                  />
                  <Line type="monotone" dataKey="equity" stroke="var(--primary)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Strategy parameters</CardTitle></CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded-md bg-muted/30 p-4 text-xs">
            {JSON.stringify(agent.strategy_params ?? {}, null, 2)}
          </pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Recent trades</CardTitle></CardHeader>
        <CardContent>
          {posQ.isLoading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : (posQ.data ?? []).length === 0 ? (
            <div className="py-4 text-sm text-muted-foreground">No trades yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Symbol</TableHead>
                    <TableHead>Side</TableHead>
                    <TableHead>Regime</TableHead>
                    <TableHead className="text-right">Entry</TableHead>
                    <TableHead className="text-right">Exit</TableHead>
                    <TableHead className="text-right">Stake</TableHead>
                    <TableHead className="text-right">P&L</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Opened</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(posQ.data ?? []).map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs">{p.symbol}</TableCell>
                      <TableCell><Badge variant={p.side === "BUY" ? "default" : "destructive"}>{p.side}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{p.regime}</TableCell>
                      <TableCell className="text-right tabular-nums">{Number(p.entry_price).toFixed(2)}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.exit_price != null ? Number(p.exit_price).toFixed(2) : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">${Number(p.stake).toFixed(2)}</TableCell>
                      <TableCell className={cn("text-right tabular-nums font-semibold",
                        p.pnl == null ? "text-muted-foreground" : Number(p.pnl) >= 0 ? "text-primary" : "text-destructive")}>
                        {p.pnl == null ? "—" : `${Number(p.pnl) >= 0 ? "+" : ""}${Number(p.pnl).toFixed(2)}`}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{p.exit_reason ?? (p.status === "open" ? "open" : "—")}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(p.opened_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

function Metric({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "up" | "down" }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("mt-2 font-display text-2xl font-black tabular-nums",
        tone === "up" && "text-primary", tone === "down" && "text-destructive")}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}
