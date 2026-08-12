// Per-user AI risk profile used to configure Maxx AI.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type RiskProfile = {
  user_id: string;
  risk_appetite: number;
  trading_goal: string;
  experience: string;
  monthly_target: number;
  completed_at: string | null;
};

export const getMyRiskProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("user_risk_profiles" as never)
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data ?? null) as RiskProfile | null;
  });

const payload = z.object({
  risk_appetite: z.number().int().min(1).max(10),
  trading_goal: z.enum([
    "capital_growth",
    "capital_preservation",
    "consistent_profitability",
    "daily_income",
  ]),
  experience: z.enum(["beginner", "intermediate", "expert"]),
  monthly_target: z.number().min(0).max(1_000_000),
});

export const saveMyRiskProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof payload>) => payload.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("user_risk_profiles" as never)
      .upsert(
        {
          user_id: context.userId,
          ...data,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as never,
        { onConflict: "user_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
