// AI Agents marketplace: list agents, read + set the signed-in user's selection.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type Agent = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  strategy_key: string;
  market: "boom_crash" | "crypto" | "forex";
  status: "live" | "beta" | "coming_soon";
  risk_level: "low" | "medium" | "high";
  avg_trades_per_day: number;
  sort_order: number;
};

export const listAgents = createServerFn({ method: "GET" }).handler(async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  const supa = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await supa
    .from("agents")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Agent[];
});

export const getMyAgent = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("user_agent_selections")
      .select("agent_id, updated_at, agents(*)")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return {
      agent_id: data.agent_id,
      updated_at: data.updated_at,
      agent: data.agents as unknown as Agent,
    };
  });

export const selectAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { agentId: string }) =>
    z.object({ agentId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: agent, error: aerr } = await context.supabase
      .from("agents")
      .select("id, status")
      .eq("id", data.agentId)
      .maybeSingle();
    if (aerr) throw new Error(aerr.message);
    if (!agent) throw new Error("Agent not found");
    if (agent.status === "coming_soon")
      throw new Error("This agent isn't available yet — it's still coming soon.");

    const { error } = await context.supabase
      .from("user_agent_selections")
      .upsert(
        { user_id: context.userId, agent_id: data.agentId, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
