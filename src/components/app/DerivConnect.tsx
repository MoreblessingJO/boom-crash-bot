import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getMyDerivAccount, disconnectDerivAccount } from "@/lib/deriv-oauth.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ExternalLink, Unlink, Link2 } from "lucide-react";
import { Panel } from "./AppShell";

function base64Url(bytes: Uint8Array) {
  let raw = "";
  bytes.forEach((b) => { raw += String.fromCharCode(b); });
  return window.btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function useDerivAccount() {
  const getAcct = useServerFn(getMyDerivAccount);
  return useQuery({ queryKey: ["deriv-account"], queryFn: () => getAcct() });
}

export function DerivConnectPanel() {
  const qc = useQueryClient();
  const acctQ = useDerivAccount();
  const disconnect = useServerFn(disconnectDerivAccount);
  const disconnectM = useMutation({
    mutationFn: (id: string) => disconnect({ data: { id } }),
    onSuccess: () => {
      toast.success("Deriv account disconnected");
      qc.invalidateQueries({ queryKey: ["deriv-account"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <Panel>
      <div className="flex items-center gap-2">
        <Link2 className="h-4.5 w-4.5 text-primary" />
        <h2 className="text-base font-bold">Connect Exchange</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Link your Deriv account so your AI can execute. Tokens are encrypted at rest.
      </p>
      <div className="mt-4">
        {acctQ.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : acctQ.data ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Login ID" value={acctQ.data.deriv_loginid} />
              <Field
                label="Account"
                value={
                  <Badge variant={acctQ.data.account_type === "real" ? "destructive" : "secondary"}>
                    {acctQ.data.account_type.toUpperCase()}
                  </Badge>
                }
              />
              <Field label="Currency" value={acctQ.data.currency ?? "—"} />
              <Field label="Connected" value={new Date(acctQ.data.connected_at).toLocaleDateString()} />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={() => disconnectM.mutate(acctQ.data!.id)}
              disabled={disconnectM.isPending}
            >
              {disconnectM.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Unlink className="mr-2 h-4 w-4" />}
              Disconnect
            </Button>
          </div>
        ) : (
          <NotConnected />
        )}
      </div>
    </Panel>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-muted/60 px-3 py-2.5">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-semibold">{value}</div>
    </div>
  );
}

const EXCHANGES = ["Deriv", "Binance", "Bybit", "OKX", "MEXC", "Gate"];

function NotConnected() {
  const [busy, setBusy] = useState(false);
  const [loginId, setLoginId] = useState("");

  async function connect() {
    setBusy(true);
    const normalizedLoginId = loginId.trim().toUpperCase();
    if (!normalizedLoginId) {
      toast.error("Enter your Deriv Standard/CFD login ID first");
      setBusy(false);
      return;
    }
    const { data: sess } = await supabase.auth.getSession();
    const accessToken = sess.session?.access_token;
    if (!accessToken) {
      toast.error("Please sign in again");
      setBusy(false);
      return;
    }
    const bytes = new Uint8Array(32);
    window.crypto.getRandomValues(bytes);
    const verifier = base64Url(bytes);
    const digest = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    const challenge = base64Url(new Uint8Array(digest));
    const clientId = import.meta.env.VITE_DERIV_APP_ID ?? "1089";
    const url = new URL("https://auth.deriv.com/oauth2/auth");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", `${window.location.origin}/api/public/deriv/callback`);
    url.searchParams.set("scope", "trade account_manage");
    url.searchParams.set(
      "state",
      base64Url(new TextEncoder().encode(JSON.stringify({ accessToken, verifier, loginId: normalizedLoginId }))),
    );
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    window.location.href = url.toString();
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        {EXCHANGES.map((x) => (
          <div
            key={x}
            className={
              "rounded-2xl border px-2 py-3 text-center text-xs font-semibold " +
              (x === "Deriv"
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border bg-muted/50 text-muted-foreground")
            }
          >
            {x}
            {x !== "Deriv" && <div className="text-[10px] font-normal">soon</div>}
          </div>
        ))}
      </div>
      <input
        value={loginId}
        onChange={(e) => setLoginId(e.target.value)}
        placeholder="Deriv Standard/CFD login ID"
        className="mt-4 h-12 w-full rounded-2xl border border-input bg-background px-4 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
      />
      <Button onClick={connect} disabled={busy} className="mt-3 h-12 w-full rounded-2xl text-base font-semibold">
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-2 h-4 w-4" />}
        Connect Exchange
      </Button>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        You'll authorize on Deriv.com and be returned here.
      </p>
    </div>
  );
}
