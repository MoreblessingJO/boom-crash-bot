// Signed endpoint the DigitalOcean worker calls to fetch the owner's
// decrypted Deriv access token. Auth: HMAC-SHA256 over raw body with
// WORKER_SHARED_SECRET (same pattern as worker-sync).
import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { decryptToken } from "@/lib/deriv-token.server";

function verifySig(rawBody: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    const a = Buffer.from(header, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export const Route = createFileRoute("/api/public/worker-deriv-token")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.WORKER_SHARED_SECRET;
        if (!secret) return new Response("server not configured", { status: 500 });

        const raw = await request.text();
        const sig = request.headers.get("x-worker-signature");
        if (!verifySig(raw, sig, secret)) {
          return new Response("invalid signature", { status: 401 });
        }

        let body: { ts?: number };
        try { body = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }
        const ts = typeof body.ts === "number" ? body.ts : 0;
        if (!ts || Math.abs(Date.now() - ts) > 30_000) {
          return new Response("stale request", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Find the owner user id via user_roles
        const { data: ownerRow, error: ownerErr } = await supabaseAdmin
          .from("user_roles").select("user_id").eq("role", "owner").limit(1).maybeSingle();
        if (ownerErr) return Response.json({ error: ownerErr.message }, { status: 500 });
        if (!ownerRow) return Response.json({ error: "no_owner" }, { status: 404 });

        const { data: acct, error: acctErr } = await supabaseAdmin
          .from("user_deriv_accounts")
          .select("encrypted_token, token_iv, token_tag, deriv_loginid, account_type, currency")
          .eq("user_id", ownerRow.user_id)
          .eq("is_active", true)
          .order("connected_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (acctErr) return Response.json({ error: acctErr.message }, { status: 500 });
        if (!acct) return Response.json({ error: "no_active_account" }, { status: 404 });

        try {
          const token = decryptToken(acct.encrypted_token, acct.token_iv, acct.token_tag);
          return Response.json({
            token,
            loginid: acct.deriv_loginid,
            account_type: acct.account_type,
            currency: acct.currency,
          });
        } catch (e) {
          return Response.json({ error: `decrypt_failed: ${(e as Error).message}` }, { status: 500 });
        }
      },
    },
  },
});
