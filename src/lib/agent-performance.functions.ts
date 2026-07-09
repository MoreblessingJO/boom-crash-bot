// Per-agent performance metrics + positions + equity curve.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type AgentPerformance = {
  agent_id: string;
  slug: string;
  name: string;
  status: string;
  market: string;
  starting_balance: number;
  current_balance: number;
  return_pct: number;
  trades: number;
  wins: number;
  losses: number;
  win_rate: number;
  net_pnl: number;
  avg_win: number;
  avg_loss: number;
  best_trade: number;
  worst_trade: number;
  last_trade_at: string | null;
};

export type AgentPosition = {
  id: string;
  symbol: string;
  side: string;
  regime: string;
  entry_price: number;
  exit_price: number | null;
  stake: number;
  pnl: number | null;
  status: string;
  opened_at: string;
  closed_at: string | null;
  exit_reason: string | null;
  confidence: number | null;
};

export const listAgentPerformance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("agent_performance" as never)
      .select("*");
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as AgentPerformance[];
    // Only show boom_crash agents that are live (paper or real)
    return rows
      .filter((r) => r.status === "live" && r.market === "boom_crash")
      .sort((a, b) => (b.net_pnl ?? 0) - (a.net_pnl ?? 0));
  });

export const getAgentBySlug = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { slug: string }) => z.object({ slug: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: agent, error } = await context.supabase
      .from("agents")
      .select("*")
      .eq("slug", data.slug)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!agent) throw new Error("Agent not found");
    const { data: perf } = await context.supabase
      .from("agent_performance" as never)
      .select("*")
      .eq("agent_id", agent.id)
      .maybeSingle();
    return {
      agent: agent as unknown as {
        id: string;
        slug: string;
        name: string;
        tagline: string;
        description: string;
        status: string;
        risk_level: string;
        strategy_params: Record<string, unknown>;
      },
      performance: (perf ?? null) as AgentPerformance | null,
    };
  });

export const getAgentPositions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { agentId: string; limit?: number }) =>
    z.object({ agentId: z.string().uuid(), limit: z.number().int().min(1).max(200).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("positions")
      .select("id,symbol,side,regime,entry_price,exit_price,stake,pnl,status,opened_at,closed_at,exit_reason,confidence")
      .eq("agent_id", data.agentId)
      .order("opened_at", { ascending: false })
      .limit(data.limit ?? 50);
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as AgentPosition[];
  });

export const getAgentEquityCurve = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { agentId: string; days?: number }) =>
    z.object({ agentId: z.string().uuid(), days: z.number().int().min(1).max(90).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const since = new Date();
    since.setDate(since.getDate() - (data.days ?? 30));
    const { data: rows, error } = await context.supabase
      .from("positions")
      .select("closed_at,pnl")
      .eq("agent_id", data.agentId)
      .eq("status", "closed")
      .gte("closed_at", since.toISOString())
      .order("closed_at", { ascending: true });
    if (error) throw new Error(error.message);
    const { data: ledger } = await context.supabase
      .from("agent_paper_ledgers" as never)
      .select("starting_balance")
      .eq("agent_id", data.agentId)
      .maybeSingle();
    const start = Number((ledger as { starting_balance?: number } | null)?.starting_balance ?? 1000);
    let running = start;
    const points: { t: string; equity: number }[] = [{ t: since.toISOString(), equity: start }];
    for (const r of rows ?? []) {
      running += Number((r as { pnl: number | null }).pnl ?? 0);
      points.push({ t: (r as { closed_at: string }).closed_at, equity: Number(running.toFixed(2)) });
    }
    return points;
  });
