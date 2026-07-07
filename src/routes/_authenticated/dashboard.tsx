// User dashboard: Connect Deriv account, view connection status, disconnect.
import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getMyDerivAccount, disconnectDerivAccount, getMyRoles } from "@/lib/deriv-oauth.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Link2, Unlink, ShieldCheck, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

const searchSchema = z.object({
  connected: z.string().optional(),
  deriv_error: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/dashboard")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Your Account · Sparky Trader" },
      { name: "description", content: "Connect your Deriv account and manage your Sparky Trader connection." },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const search = useSearch({ from: "/_authenticated/dashboard" });
  const qc = useQueryClient();
  const getAcct = useServerFn(getMyDerivAccount);
  const getRoles = useServerFn(getMyRoles);
  const disconnect = useServerFn(disconnectDerivAccount);

  const acctQ = useQuery({ queryKey: ["deriv-account"], queryFn: () => getAcct() });
  const rolesQ = useQuery({ queryKey: ["my-roles"], queryFn: () => getRoles() });

  const disconnectM = useMutation({
    mutationFn: (id: string) => disconnect({ data: { id } }),
    onSuccess: () => {
      toast.success("Deriv account disconnected");
      qc.invalidateQueries({ queryKey: ["deriv-account"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  useEffect(() => {
    if (search.connected) toast.success(`Connected ${search.connected} Deriv account(s)`);
    if (search.deriv_error) toast.error(`Deriv error: ${search.deriv_error}`);
  }, [search.connected, search.deriv_error]);

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Your Account</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect your Deriv account so Sparky Trader can execute strategies on your behalf.
        </p>
      </div>

      {rolesQ.data?.isAdmin && (
        <Card className="border-primary/50 bg-primary/5">
          <CardContent className="flex items-center gap-3 py-4">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <div className="flex-1">
              <div className="font-medium">Admin access</div>
              <div className="text-xs text-muted-foreground">You have access to the engine control panel.</div>
            </div>
            <Button variant="outline" size="sm" asChild>
              <a href="/admin">Open Admin</a>
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Link2 className="h-5 w-5" /> Deriv Connection</CardTitle>
          <CardDescription>
            Sparky Trader needs an authorized token from your Deriv account to place trades.
            Tokens are encrypted at rest — never stored in plain text.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {acctQ.isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
          ) : acctQ.data ? (
            <ConnectedAccount
              acct={acctQ.data}
              onDisconnect={() => disconnectM.mutate(acctQ.data!.id)}
              disconnecting={disconnectM.isPending}
            />
          ) : (
            <NotConnected />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What happens next?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>1. Click <b>Connect Deriv</b> — you'll be redirected to Deriv to authorize.</p>
          <p>2. Choose which account (demo or real) to link. You can link multiple.</p>
          <p>3. The engine will start reading tick data and can execute paper trades immediately.</p>
          <p>4. Real-money trading stays OFF until an admin enables live mode with your loss limits set.</p>
        </CardContent>
      </Card>
    </main>
  );
}

function ConnectedAccount({
  acct, onDisconnect, disconnecting,
}: {
  acct: { id: string; deriv_loginid: string; account_type: string; currency: string | null; scopes: string[]; connected_at: string };
  onDisconnect: () => void;
  disconnecting: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Login ID" value={acct.deriv_loginid} />
        <Field label="Account" value={<Badge variant={acct.account_type === "real" ? "destructive" : "secondary"}>{acct.account_type.toUpperCase()}</Badge>} />
        <Field label="Currency" value={acct.currency ?? "—"} />
        <Field label="Connected" value={new Date(acct.connected_at).toLocaleString()} />
      </div>
      <div>
        <div className="text-xs text-muted-foreground mb-1">Granted scopes</div>
        <div className="flex flex-wrap gap-1">
          {acct.scopes.length === 0
            ? <Badge variant="outline">read-only</Badge>
            : acct.scopes.map((s) => <Badge key={s} variant="outline">{s}</Badge>)}
        </div>
      </div>
      <Button variant="destructive" size="sm" onClick={onDisconnect} disabled={disconnecting}>
        {disconnecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Unlink className="mr-2 h-4 w-4" />}
        Disconnect
      </Button>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}

function NotConnected() {
  const [busy, setBusy] = useState(false);

  async function connect() {
    setBusy(true);
    // Deriv OAuth flow. We pass our Supabase access token in `state` so the
    // server-side callback can identify the user. Deriv preserves `state`.
    const { data: sess } = await supabase.auth.getSession();
    const accessToken = sess.session?.access_token;
    if (!accessToken) {
      toast.error("Please sign in again");
      setBusy(false);
      return;
    }
    const appId = import.meta.env.VITE_DERIV_APP_ID ?? "1089";
    const redirectUri = `${window.location.origin}/api/public/deriv/callback`;
    const url = new URL("https://oauth.deriv.com/oauth2/authorize");
    url.searchParams.set("app_id", appId);
    url.searchParams.set("l", "EN");
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", accessToken);
    window.location.href = url.toString();
  }

  return (
    <div className="rounded-md border border-dashed p-6 text-center">
      <p className="text-sm text-muted-foreground mb-4">No Deriv account connected yet.</p>
      <Button onClick={connect} disabled={busy}>
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-2 h-4 w-4" />}
        Connect Deriv Account
      </Button>
      <p className="mt-3 text-xs text-muted-foreground">
        You'll authorize on Deriv.com and be returned here.
      </p>
    </div>
  );
}
