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

interface OAuthState {
  accessToken: string;
  verifier: string;
  loginId: string;
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

function decodeOAuthState(state: string): OAuthState | null {
  try {
    const normalized = state.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const parsed = JSON.parse(globalThis.atob(padded)) as Partial<OAuthState>;
    if (!parsed.accessToken || !parsed.verifier || !parsed.loginId) return null;
    return {
      accessToken: parsed.accessToken,
      verifier: parsed.verifier,
      loginId: parsed.loginId,
    };
  } catch {
    return null;
  }
}

async function exchangeOAuthCode({
  code,
  verifier,
  clientId,
  redirectUri,
}: {
  code: string;
  verifier: string;
  clientId: string;
  redirectUri: string;
}) {
  const body = new URLSearchParams();
  body.set("grant_type", "authorization_code");
  body.set("client_id", clientId);
  body.set("code", code);
  body.set("code_verifier", verifier);
  body.set("redirect_uri", redirectUri);

  const res = await fetch("https://auth.deriv.com/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await res.json().catch(() => ({})) as { access_token?: string; error?: string; error_description?: string };
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || "token_exchange_failed");
  }
  return json.access_token;
}

export const Route = createFileRoute("/api/public/deriv/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const state = url.searchParams.get("state") ?? "";
        const code = url.searchParams.get("code") ?? "";
        const oauthError = url.searchParams.get("error") ?? "";

        const origin = `${url.protocol}//${url.host}`;
        const errRedirect = (msg: string) =>
          redirect({ href: `${origin}/dashboard?deriv_error=${encodeURIComponent(msg)}` });

        if (oauthError) throw errRedirect(oauthError);

        if (!state) throw errRedirect("missing_state");

        const supaUrl = process.env.SUPABASE_URL;
        const supaKey = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!supaUrl || !supaKey) throw errRedirect("server_misconfigured");

        const oauthState = decodeOAuthState(state);
        const userAccessToken = oauthState?.accessToken ?? state;

        const authClient = createClient<Database>(supaUrl, supaKey, {
          auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
        });
        const { data: userData, error: userErr } = await authClient.auth.getUser(userAccessToken);
        if (userErr || !userData?.user) throw errRedirect("invalid_session");
        const userId = userData.user.id;

        let accts = parseAccounts(url);
        if (code) {
          if (!oauthState) throw errRedirect("invalid_state");
          const clientId = process.env.DERIV_APP_ID ?? process.env.VITE_DERIV_APP_ID;
          if (!clientId) throw errRedirect("server_misconfigured");
          try {
            const token = await exchangeOAuthCode({
              code,
              verifier: oauthState.verifier,
              clientId,
              redirectUri: `${origin}/api/public/deriv/callback`,
            });
            accts = [{ token, loginid: oauthState.loginId, currency: "" }];
          } catch (e) {
            console.error("[deriv/callback] oauth exchange failed", e);
            throw errRedirect("oauth_exchange_failed");
          }
        }
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
