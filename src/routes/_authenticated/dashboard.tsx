// User dashboard: Deploy an AI agent + connect a Deriv account.
import { createFileRoute, useSearch, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getMyDerivAccount, disconnectDerivAccount, getMyRoles } from "@/lib/deriv-oauth.functions";
import { getMyAgent } from "@/lib/agents.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Link2, Unlink, ShieldCheck, ExternalLink, Bot, ArrowRight, Lock } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import logo from "@/assets/nexxtrade-logo.png.asset.json";

const searchSchema = z.object({
  connected: z.string().optional(),
  deriv_error: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/dashboard")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Your Account · NexxTrade" },
      { name: "description", content: "Deploy a NexxTrade AI agent and connect your Deriv account." },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const search = useSearch({ from: "/_authenticated/dashboard" });
  const qc = useQueryClient();
  const getAcct = useServerFn(getMyDerivAccount);
  const getRoles = useServerFn(getMyRoles);
  const getAgent = useServerFn(getMyAgent);
  const disconnect = useServerFn(disconnectDerivAccount);

  const acctQ = useQuery({ queryKey: ["deriv-account"], queryFn: () => getAcct() });
  const rolesQ = useQuery({ queryKey: ["my-roles"], queryFn: () => getRoles() });
  const agentQ = useQuery({ queryKey: ["my-agent"], queryFn: () => getAgent() });

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
    <div className="min-h-screen">
      <header className="border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <Link to="/" className="flex items-center gap-2.5">
            <img src={logo.url} alt="NexxTrade" className="h-7 w-7" />
            <span className="font-display text-lg font-black tracking-tight">NexxTrade</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link to="/agents" className="text-muted-foreground hover:text-foreground">Agents</Link>
            {rolesQ.data?.isAdmin && (
              <a href="/admin" className="text-muted-foreground hover:text-foreground">Admin</a>
            )}
            <Button size="sm" variant="ghost" onClick={() => supabase.auth.signOut()}>Sign out</Button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-10">
        <div>
          <h1 className="font-display text-4xl font-black tracking-tight sm:text-5xl">Your account</h1>
          <p className="mt-2 text-muted-foreground">
            Pick an agent and connect your Deriv account. The agent trades on your behalf,
            24/7, with server-enforced risk limits.
          </p>
        </div>

        <AgentCardBlock agent={agentQ.data ?? null} isLoading={agentQ.isLoading} />

        <MarketsTabs>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Link2 className="h-5 w-5" /> Deriv connection</CardTitle>
              <CardDescription>
                NexxTrade needs an authorized token from your Deriv account to place trades.
                Tokens are encrypted at rest — never stored in plain text.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {acctQ.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
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
        </MarketsTabs>

        {rolesQ.data?.isAdmin && (
          <Card className="border-primary/40 bg-primary/5">
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
      </main>
    </div>
  );
}

function AgentCardBlock({
  agent,
  isLoading,
}: {
  agent: Awaited<ReturnType<typeof getMyAgent>>;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading your agent…
        </CardContent>
      </Card>
    );
  }
  if (!agent) {
    return (
      <Card className="border-primary/40 bg-primary/5">
        <CardContent className="flex flex-col items-start gap-3 py-6 sm:flex-row sm:items-center">
          <Bot className="h-6 w-6 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <div className="font-display text-lg font-bold">Pick your agent</div>
            <div className="text-sm text-muted-foreground">Choose which AI strategy trades your account.</div>
          </div>
          <Button asChild className="glow-boom">
            <Link to="/agents">Browse agents <ArrowRight className="ml-1 h-4 w-4" /></Link>
          </Button>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="border-primary/40">
      <CardContent className="flex flex-col items-start gap-4 py-6 sm:flex-row sm:items-center">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/15 glow-boom">
          <Bot className="h-6 w-6 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-display truncate text-xl font-black">{agent.agent.name}</div>
            <Badge variant="outline" className="border-primary/40 text-primary">Deployed</Badge>
          </div>
          <div className="mt-1 text-sm text-muted-foreground">{agent.agent.tagline}</div>
        </div>
        <Button asChild variant="outline">
          <Link to="/agents">Change agent</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function MarketsTabs({ children }: { children: React.ReactNode }) {
  const [tab, setTab] = useState<"boom" | "crypto" | "forex">("boom");
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        <TabBtn active={tab === "boom"} onClick={() => setTab("boom")} label="Boom & Crash" live />
        <TabBtn active={tab === "crypto"} onClick={() => setTab("crypto")} label="Crypto" />
        <TabBtn active={tab === "forex"} onClick={() => setTab("forex")} label="Forex" />
      </div>
      {tab === "boom" ? children : <ComingSoonPanel market={tab === "crypto" ? "Crypto" : "Forex"} />}
    </div>
  );
}

function TabBtn({ active, onClick, label, live }: { active: boolean; onClick: () => void; label: string; live?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={
        "inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium transition " +
        (active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-card text-muted-foreground hover:text-foreground")
      }
    >
      {label}
      {live ? (
        <span className="inline-flex items-center rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">Live</span>
      ) : (
        <span className="inline-flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground"><Lock className="h-2.5 w-2.5" />Soon</span>
      )}
    </button>
  );
}

function ComingSoonPanel({ market }: { market: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="h-8 w-8 text-muted-foreground" />
        <div className="font-display text-2xl font-black">{market} · Coming soon</div>
        <p className="max-w-md text-sm text-muted-foreground">
          We're building the {market.toLowerCase()} adapter. You'll get an email at your
          account address when {market} agents go live — no extra signup needed.
        </p>
      </CardContent>
    </Card>
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
        <div className="mb-1 text-xs text-muted-foreground">Granted scopes</div>
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
      <p className="mb-4 text-sm text-muted-foreground">No Deriv account connected yet.</p>
      <Button onClick={connect} disabled={busy} className="glow-boom">
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-2 h-4 w-4" />}
        Connect Deriv account
      </Button>
      <p className="mt-3 text-xs text-muted-foreground">
        You'll authorize on Deriv.com and be returned here.
      </p>
    </div>
  );
}
