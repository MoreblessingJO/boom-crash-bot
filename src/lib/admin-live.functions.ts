// Admin-only server functions for the live-trading control panel.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase
    .from("user_roles").select("role").eq("user_id", context.userId);
  if (error) throw new Error(error.message);
  const roles = (data ?? []).map((r: any) => r.role as string);
  if (!roles.includes("owner") && !roles.includes("admin")) {
    throw new Error("Forbidden: admin only");
  }
}

export const getLiveSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("settings")
      .select("id, halt_engine, is_live, daily_loss_limit, max_open_positions, max_stake_per_trade, max_stake_pct_equity, kill_switch, mode")
      .eq("id", 1).maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

const GuardrailsSchema = z.object({
  daily_loss_limit: z.number().min(0).max(1_000_000),
  max_open_positions: z.number().int().min(0).max(100),
  max_stake_per_trade: z.number().min(0).max(100_000),
  max_stake_pct_equity: z.number().min(0).max(1),
});

export const updateGuardrails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => GuardrailsSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("settings").update({ ...data, updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setHaltEngine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { halt: boolean }) => z.object({ halt: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("settings").update({ halt_engine: data.halt, updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setLiveMode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { is_live: boolean }) => z.object({ is_live: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    // Owner Deriv account required to go live
    if (data.is_live) {
      const { data: owner } = await context.supabase
        .from("user_roles").select("user_id").eq("role", "owner").limit(1).maybeSingle();
      if (!owner) throw new Error("No owner user exists");
      const { data: acct } = await context.supabase
        .from("user_deriv_accounts").select("id, deriv_loginid, account_type")
        .eq("user_id", owner.user_id).eq("is_active", true).limit(1).maybeSingle();
      if (!acct) throw new Error("Owner has not connected a Deriv account yet");
    }
    const { error } = await context.supabase
      .from("settings").update({ is_live: data.is_live, updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getOwnerDerivSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data: owner } = await context.supabase
      .from("user_roles").select("user_id").eq("role", "owner").limit(1).maybeSingle();
    if (!owner) return null;
    const { data: acct } = await context.supabase
      .from("user_deriv_accounts")
      .select("deriv_loginid, account_type, currency, connected_at")
      .eq("user_id", owner.user_id).eq("is_active", true)
      .order("connected_at", { ascending: false }).limit(1).maybeSingle();
    return acct;
  });

export const listLiveAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("live_trade_audit")
      .select("id, event, symbol, stake, entry, exit_price, pnl, contract_id, position_id, settings_snapshot, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
