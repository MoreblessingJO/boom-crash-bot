// Deriv OAuth callback.
// Deriv redirects here after the user authorizes our app. The URL carries
// token1, acct1, cur1, token2, acct2, cur2, ... for each of the user's accounts.
// We authenticate the caller via a short-lived `state` param that carries the
// user's Supabase access token (URL-encoded), then:
//   1. Validate the token by fetching the user
//   2. For each account, call Deriv `authorize` to fetch account_type + scopes
//   3. Encrypt token, upsert into user_deriv_accounts
//   4. Redirect back to /dashboard?connected=1
//
// Deriv docs: https://developers.deriv.com/docs/oauth

import { createFileRoute, redirect } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import WebSocket from "ws";

const DERIV_WS = "wss://ws.derivws.com/websockets/v3?app_id=";

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

async function derivAuthorize(appId: string, token: string): Promise<{
  loginid: string;
  currency: string;
  is_virtual: number;
  scopes: string[];
}> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(DERIV_WS + encodeURIComponent(appId));
    const timeout = setTimeout(() => {
      try { ws.close(); } catch {}
      reject(new Error("Deriv authorize timeout"));
    }, 8000);
    ws.on("open", () => ws.send(JSON.stringify({ authorize: token })));
    ws.on("message", (buf) => {
      try {
        const msg = JSON.parse(buf.toString());
        clearTimeout(timeout);
        try { ws.close(); } catch {}
        if (msg.error) return reject(new Error(msg.error.message ?? "Deriv authorize error"));
        const a = msg.authorize;
        resolve({
          loginid: a.loginid,
          currency: a.currency,
          is_virtual: a.is_virtual,
          scopes: a.scopes ?? [],
        });
      } catch (e) {
        clearTimeout(timeout);
        reject(e as Error);
      }
    });
    ws.on("error", (err) => { clearTimeout(timeout); reject(err); });
  });
}

export const Route = createFileRoute("/api/public/deriv/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const state = url.searchParams.get("state") ?? "";
        const appId = process.env.DERIV_APP_ID ?? "1089";

        // Redirect base — always same-origin
        const origin = `${url.protocol}//${url.host}`;
        const errRedirect = (msg: string) =>
          redirect({ href: `${origin}/dashboard?deriv_error=${encodeURIComponent(msg)}` });

        // The `state` param carries the user's Supabase access token so we can
        // authenticate this server-to-server callback. We validate it via getUser().
        if (!state) throw errRedirect("missing_state");

        const supabaseAuthClient = createClient<Database>(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_PUBLISHABLE_KEY!,
          {
            auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
            global: { headers: { Authorization: `Bearer ${state}` } },
          },
        );
        const { data: userData, error: userErr } = await supabaseAuthClient.auth.getUser(state);
        if (userErr || !userData?.user) throw errRedirect("invalid_session");
        const userId = userData.user.id;

        const accts = parseAccounts(url);
        if (accts.length === 0) throw errRedirect("no_tokens");

        // Encrypt + persist each account
        const { encryptToken } = await import("@/lib/deriv-token.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        let saved = 0;
        for (const a of accts) {
          try {
            const info = await derivAuthorize(appId, a.token);
            const enc = encryptToken(a.token);
            const { error } = await supabaseAdmin.from("user_deriv_accounts").upsert({
              user_id: userId,
              deriv_loginid: info.loginid,
              encrypted_token: enc.ciphertext,
              token_iv: enc.iv,
              token_tag: enc.tag,
              account_type: info.is_virtual ? "demo" : "real",
              currency: info.currency,
              scopes: info.scopes,
              is_active: true,
              connected_at: new Date().toISOString(),
            }, { onConflict: "user_id,deriv_loginid" });
            if (!error) saved += 1;
          } catch (e) {
            console.error("[deriv/callback] account import failed", e);
          }
        }

        if (saved === 0) throw errRedirect("import_failed");
        throw redirect({ href: `${origin}/dashboard?connected=${saved}` });
      },
    },
  },
});
