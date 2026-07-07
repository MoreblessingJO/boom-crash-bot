// Server functions for the user-side Deriv account connection flow.
// - getMyDerivAccount: read the signed-in user's connected account (no token exposure)
// - disconnectDerivAccount: soft-delete their connection
// - getMyRoles: return { isOwner, isAdmin } for the current user
// Token connection itself happens server-to-server in the /api/public/deriv/callback route.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const getMyDerivAccount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("user_deriv_accounts")
      .select("id, deriv_loginid, account_type, currency, scopes, is_active, connected_at, updated_at")
      .eq("user_id", context.userId)
      .eq("is_active", true)
      .order("connected_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

export const disconnectDerivAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("user_deriv_accounts")
      .update({ is_active: false })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getMyRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    const roles = (data ?? []).map((r) => r.role as string);
    return {
      isOwner: roles.includes("owner"),
      isAdmin: roles.includes("owner") || roles.includes("admin"),
      roles,
    };
  });
