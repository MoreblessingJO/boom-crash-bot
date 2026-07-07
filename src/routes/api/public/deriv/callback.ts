// Deriv OAuth callback.
// Deriv redirects here after the user authorizes our app. The URL carries
// token1, acct1, cur1, token2, acct2, cur2, ... for each of the user's accounts.
// We authenticate the caller via a short-lived `state` param that carries the
// user's Supabase access token, then encrypt + persist each account.
//
// NOTE: we do NOT call Deriv's WS `authorize` here — outbound WebSocket from
// Cloudflare Workers is unreliable, and the worker (on the droplet, using
// the `ws` package) will validate + fetch scopes on first use. Account type
// is derived from the Deriv loginid prefix: "VR*" = demo (virtual), else real.

import { createFileRoute, redirect } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

interface DerivAcct {
  token: string;
  loginid: string;
  currency: string;
}

function parseAccounts(url: URL): DerivAcct[] {
  const params = url.searchParams;
  const accts: DerivAcct[] = [];
  for (let i = 1; i <= 20; i++) {
    const token = params.get(`token${i}`);
    const loginid = params.get(`acct${i}`);
    const currency = params.get(`cur${i}`) ?? "";
    if (!token || !loginid) break;
    accts.push({ token, loginid, currency });
  }
  return accts;
}

function inferAccountType(loginid: string): "demo" | "real" {
  return loginid.toUpperCase().startsWith("VR") ? "demo" : "real";
}

export const Route = createFileRoute("/api/public/deriv/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const state = url.searchParams.get("state") ?? "";

        const origin = `${url.protocol}//${url.host}`;
        const errRedirect = (msg: string) =>
          redirect({ href: `${origin}/dashboard?deriv_error=${encodeURIComponent(msg)}` });

        if (!state) throw errRedirect("missing_state");

        const supaUrl = process.env.SUPABASE_URL;
        const supaKey = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!supaUrl || !supaKey) throw errRedirect("server_misconfigured");

        const authClient = createClient<Database>(supaUrl, supaKey, {
          auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
        });
        const { data: userData, error: userErr } = await authClient.auth.getUser(state);
        if (userErr || !userData?.user) throw errRedirect("invalid_session");
        const userId = userData.user.id;

        const accts = parseAccounts(url);
        if (accts.length === 0) throw errRedirect("no_tokens");

        const { encryptToken } = await import("@/lib/deriv-token.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        let saved = 0;
        for (const a of accts) {
          try {
            const enc = encryptToken(a.token);
            const { error } = await supabaseAdmin.from("user_deriv_accounts").upsert({
              user_id: userId,
              deriv_loginid: a.loginid,
              encrypted_token: enc.ciphertext,
              token_iv: enc.iv,
              token_tag: enc.tag,
              account_type: inferAccountType(a.loginid),
              currency: a.currency || null,
              scopes: [],
              is_active: true,
              connected_at: new Date().toISOString(),
            }, { onConflict: "user_id,deriv_loginid" });
            if (!error) saved += 1;
            else console.error("[deriv/callback] upsert failed", error);
          } catch (e) {
            console.error("[deriv/callback] encrypt failed", e);
          }
        }

        if (saved === 0) throw errRedirect("import_failed");
        throw redirect({ href: `${origin}/dashboard?connected=${saved}` });
      },
    },
  },
});
