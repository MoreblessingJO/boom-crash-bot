import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import {
  listAgentPerformance,
  getAgentPositions,
  getAgentEquityCurve,
  type AgentPerformance,
} from "@/lib/agent-performance.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, TrendingUp, TrendingDown, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export function AgentPerformanceTabs() {
  const listFn = useServerFn(listAgentPerformance);
  const q = useQuery({
    queryKey: ["agent-performance"],
    queryFn: () => listFn(),
    refetchInterval: 15_000,
  });

  const agents = q.data ?? [];
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const active = activeSlug
    ? agents.find((a) => a.slug === activeSlug) ?? agents[0]
    : agents[0];

  if (q.isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading agent performance…
        </CardContent>
      </Card>
    );
  }
  if (!agents.length) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">
          No active agents yet. Once the engine runs a trade, metrics appear here.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-2xl font-black tracking-tight">Agent leaderboard</h2>
        <p className="text-sm text-muted-foreground">
          Each agent trades an independent $1,000 paper book. Real-money trading stays gated to Nicco.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {agents.map((a) => (
          <button
            key={a.agent_id}
            onClick={() => setActiveSlug(a.slug)}
            className={cn(
              "group rounded-xl border bg-card p-4 text-left transition",
              (active?.agent_id === a.agent_id)
                ? "border-primary shadow-[0_0_0_1px_var(--primary)]"
                : "border-border hover:border-primary/40",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-display text-lg font-black">{a.name}</div>
                <div className="mt-0.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                  {a.trades} trades · {a.win_rate}% win
                </div>
              </div>
              <ReturnPill pct={a.return_pct} />
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <div className="font-display text-2xl font-black tabular-nums">
                ${Number(a.current_balance).toFixed(2)}
              </div>
              <div className="text-xs text-muted-foreground">
                / ${Number(a.starting_balance).toFixed(0)}
              </div>
            </div>
            <div className={cn(
              "mt-1 text-xs tabular-nums",
              Number(a.net_pnl) >= 0 ? "text-primary" : "text-destructive",
            )}>
              {Number(a.net_pnl) >= 0 ? "+" : ""}${Number(a.net_pnl).toFixed(2)} net
            </div>
          </button>
        ))}
      </div>

      {active && <AgentDeepPanel agent={active} />}
    </div>
  );
}

function ReturnPill({ pct }: { pct: number }) {
  const positive = Number(pct) >= 0;
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums",
      positive ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive",
    )}>
      {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {positive ? "+" : ""}{Number(pct).toFixed(2)}%
    </span>
  );
}

function AgentDeepPanel({ agent }: { agent: AgentPerformance }) {
  const posFn = useServerFn(getAgentPositions);
  const eqFn = useServerFn(getAgentEquityCurve);
  const posQ = useQuery({
    queryKey: ["agent-positions", agent.agent_id],
    queryFn: () => posFn({ data: { agentId: agent.agent_id, limit: 20 } }),
    refetchInterval: 15_000,
  });
  const eqQ = useQuery({
    queryKey: ["agent-equity", agent.agent_id],
    queryFn: () => eqFn({ data: { agentId: agent.agent_id, days: 30 } }),
    refetchInterval: 30_000,
  });

  const equity = useMemo(() => (eqQ.data ?? []).map((p) => ({
    t: new Date(p.t).getTime(),
    equity: p.equity,
  })), [eqQ.data]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
        <div className="flex items-center gap-3">
          <CardTitle className="font-display text-xl">{agent.name}</CardTitle>
          <Badge variant="outline" className="border-primary/40 text-primary">Live paper</Badge>
        </div>
        <Link
          to="/agents/$slug"
          params={{ slug: agent.slug }}
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          Full metrics <ArrowUpRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="equity">
          <TabsList>
            <TabsTrigger value="equity">Equity curve</TabsTrigger>
            <TabsTrigger value="trades">Recent trades</TabsTrigger>
          </TabsList>
          <TabsContent value="equity" className="pt-4">
            <div className="h-56 w-full">
              {equity.length < 2 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Waiting for closed trades…
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={equity}>
                    <XAxis
                      dataKey="t"
                      type="number"
                      domain={["dataMin", "dataMax"]}
                      tickFormatter={(v) => new Date(v).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={11}
                    />
                    <YAxis
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={11}
                      domain={["auto", "auto"]}
                      tickFormatter={(v) => `$${Number(v).toFixed(0)}`}
                    />
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
          </TabsContent>
          <TabsContent value="trades" className="pt-4">
            {posQ.isLoading ? (
              <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading trades…
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
                      <TableHead className="text-right">P&L</TableHead>
                      <TableHead>Opened</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(posQ.data ?? []).map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono text-xs">{p.symbol}</TableCell>
                        <TableCell>
                          <Badge variant={p.side === "BUY" ? "default" : "destructive"} className="uppercase">{p.side}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{p.regime}</TableCell>
                        <TableCell className="text-right tabular-nums">{Number(p.entry_price).toFixed(2)}</TableCell>
                        <TableCell className="text-right tabular-nums">{p.exit_price != null ? Number(p.exit_price).toFixed(2) : "—"}</TableCell>
                        <TableCell className={cn("text-right tabular-nums font-semibold",
                          p.pnl == null ? "text-muted-foreground" : Number(p.pnl) >= 0 ? "text-primary" : "text-destructive")}>
                          {p.pnl == null ? "—" : `${Number(p.pnl) >= 0 ? "+" : ""}${Number(p.pnl).toFixed(2)}`}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(p.opened_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
