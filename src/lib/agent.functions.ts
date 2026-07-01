// UI-facing server functions. Read DB snapshots and mutate settings.
// Public reads — anon SELECT policy guards the tables.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getDashboardState = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [settings, symbolState, openPositions, recentClosed, buckets, signals, runs] = await Promise.all([
    supabaseAdmin.from("settings").select("*").eq("id", 1).maybeSingle(),
    supabaseAdmin.from("symbol_state").select("*"),
    supabaseAdmin.from("positions").select("*").eq("status", "open"),
    supabaseAdmin.from("positions").select("*").eq("status", "closed").order("closed_at", { ascending: false }).limit(200),
    supabaseAdmin.from("learning_buckets").select("*"),
    supabaseAdmin.from("signals").select("*").order("created_at", { ascending: false }).limit(50),
    supabaseAdmin.from("engine_runs").select("*").order("started_at", { ascending: false }).limit(1),
  ]);
  return {
    settings: settings.data,
    symbolState: symbolState.data ?? [],
    openPositions: openPositions.data ?? [],
    recentClosed: recentClosed.data ?? [],
    buckets: buckets.data ?? [],
    signals: signals.data ?? [],
    lastRun: runs.data?.[0] ?? null,
  };
});

const SettingsPatch = z.object({
  mode: z.enum(["paper", "signals", "live"]).optional(),
  stake: z.number().positive().optional(),
  risk_pct: z.number().min(0).max(0.5).optional(),
  tp_r: z.number().positive().optional(),
  sl_r: z.number().positive().optional(),
  pre_spike_ratio: z.number().min(0).max(2).optional(),
  late_entry_ratio: z.number().min(0).max(2).optional(),
  max_hold_ratio: z.number().min(0).max(5).optional(),
  max_daily_loss: z.number().positive().optional(),
  kill_switch: z.boolean().optional(),
  learning_enabled: z.boolean().optional(),
  enabled_symbols: z.array(z.string()).optional(),
});

export const updateSettings = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => SettingsPatch.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("settings")
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const resetLearner = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("learning_buckets").delete().neq("bucket_key", "");
  return { ok: true };
});

export const flattenAll = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: open } = await supabaseAdmin.from("positions").select("*").eq("status", "open");
  const { data: states } = await supabaseAdmin.from("symbol_state").select("symbol,last_price,last_epoch");
  const pxMap = new Map((states ?? []).map((s) => [s.symbol, s]));
  for (const p of (open ?? [])) {
    const cur = pxMap.get(p.symbol);
    const exitPrice = Number(cur?.last_price ?? p.entry_price);
    const dir = p.side === "BUY" ? 1 : -1;
    const moved = (exitPrice - Number(p.entry_price)) * dir;
    const realized_r = p.unit > 0 ? moved / Number(p.unit) : 0;
    const pnl = moved * Number(p.stake);
    await supabaseAdmin.from("positions").update({
      status: "closed",
      exit_price: exitPrice,
      closed_epoch: cur?.last_epoch ?? p.opened_epoch,
      closed_at: new Date().toISOString(),
      pnl,
      realized_r,
      exit_reason: "MANUAL",
    }).eq("id", p.id);
  }
  return { ok: true, closed: (open ?? []).length };
});

export const closePosition = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: p } = await supabaseAdmin.from("positions").select("*").eq("id", data.id).eq("status", "open").maybeSingle();
    if (!p) return { ok: false, reason: "not_open" };
    const { data: st } = await supabaseAdmin.from("symbol_state").select("last_price,last_epoch").eq("symbol", p.symbol).maybeSingle();
    const exitPrice = Number(st?.last_price ?? p.entry_price);
    const dir = p.side === "BUY" ? 1 : -1;
    const moved = (exitPrice - Number(p.entry_price)) * dir;
    const realized_r = p.unit > 0 ? moved / Number(p.unit) : 0;
    const pnl = moved * Number(p.stake);
    await supabaseAdmin.from("positions").update({
      status: "closed",
      exit_price: exitPrice,
      closed_epoch: st?.last_epoch ?? p.opened_epoch,
      closed_at: new Date().toISOString(),
      pnl,
      realized_r,
      exit_reason: "MANUAL",
    }).eq("id", p.id);
    return { ok: true, pnl, realized_r };
  });

export const resetPaperBalance = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("settings").update({ paper_balance: 1000 }).eq("id", 1);
  await supabaseAdmin.from("positions").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  return { ok: true };
});

export const triggerEngine = createServerFn({ method: "POST" }).handler(async () => {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const { runEngine } = await import("@/lib/engine.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let result;
  try {
    result = await runEngine();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result = { symbols_scanned: 0, trades_opened: 0, trades_closed: 0, errors: [msg] };
  }
  await supabaseAdmin.from("engine_runs").insert({
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    duration_ms: Date.now() - t0,
    symbols_scanned: result.symbols_scanned,
    trades_opened: result.trades_opened,
    trades_closed: result.trades_closed,
    error: result.errors.length ? result.errors.join(" | ") : null,
  });
  return result;
});
