// Fetches the owner's decrypted Deriv access token from the Lovable app
// via HMAC-signed POST. Never persist the token to disk — hold in memory
// only, refresh periodically.
import { createHmac } from "crypto";

export interface OwnerDerivToken {
  token: string;
  loginid: string;
  account_type: "demo" | "real" | string;
  currency: string | null;
  fetchedAt: number;
}

function endpoint(): string {
  const base = process.env.LOVABLE_APP_URL;
  if (!base) throw new Error("Missing LOVABLE_APP_URL in .env");
  return base.replace(/\/$/, "") + "/api/public/worker-deriv-token";
}

function secret(): string {
  const s = process.env.WORKER_SHARED_SECRET;
  if (!s) throw new Error("Missing WORKER_SHARED_SECRET in .env");
  return s;
}

export async function fetchOwnerDerivToken(): Promise<OwnerDerivToken | null> {
  const raw = JSON.stringify({ ts: Date.now() });
  const sig = createHmac("sha256", secret()).update(raw).digest("hex");
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 10_000);
  try {
    const res = await fetch(endpoint(), {
      method: "POST",
      headers: { "content-type": "application/json", "x-worker-signature": sig },
      body: raw,
      signal: ac.signal,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.warn(`[deriv-token] fetch failed ${res.status}: ${txt.slice(0, 200)}`);
      return null;
    }
    const json = (await res.json()) as Partial<OwnerDerivToken> & { error?: string };
    if (json.error || !json.token || !json.loginid) {
      console.warn(`[deriv-token] no token: ${json.error ?? "empty response"}`);
      return null;
    }
    return {
      token: json.token,
      loginid: json.loginid,
      account_type: (json.account_type as string) ?? "demo",
      currency: (json.currency as string) ?? null,
      fetchedAt: Date.now(),
    };
  } catch (e) {
    console.warn(`[deriv-token] error`, (e as Error).message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
