import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { listAgents, getMyAgent, selectAgent } from "@/lib/agents.functions";
import { getMyRoles } from "@/lib/deriv-oauth.functions";
import { AgentCard } from "@/components/AgentCard";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ArrowLeft } from "lucide-react";
import logo from "@/assets/nexxtrade-logo.png.asset.json";

export const Route = createFileRoute("/_authenticated/agents")({
  head: () => ({
    meta: [
      { title: "AI Agents · NexxTrade" },
      { name: "description", content: "Choose which NexxTrade AI agent trades your Deriv account." },
    ],
  }),
  component: AgentsPage,
});

function AgentsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAgents);
  const myFn = useServerFn(getMyAgent);
  const selectFn = useServerFn(selectAgent);
  const getRoles = useServerFn(getMyRoles);

  const agentsQ = useQuery({ queryKey: ["agents"], queryFn: () => listFn() });
  const myQ = useQuery({ queryKey: ["my-agent"], queryFn: () => myFn() });
  const rolesQ = useQuery({ queryKey: ["my-roles"], queryFn: () => getRoles() });

  const selectM = useMutation({
    mutationFn: (agentId: string) => selectFn({ data: { agentId } }),
    onSuccess: (_r, agentId) => {
      const a = agentsQ.data?.find((x) => x.id === agentId);
      toast.success(a ? `${a.name} is now trading for you` : "Agent selected");
      qc.invalidateQueries({ queryKey: ["my-agent"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <Link to="/" className="flex items-center gap-2.5">
            <img src={logo.url} alt="NexxTrade" className="h-7 w-7" />
            <span className="font-display text-lg font-black tracking-tight">NexxTrade</span>
          </Link>
          <nav className="flex items-center gap-2 text-sm sm:gap-4">
            <Link to="/dashboard" className="text-muted-foreground hover:text-foreground">Dashboard</Link>
            <Link to="/agents" className="text-foreground font-medium">Agents</Link>
            {rolesQ.data?.isAdmin && (
              <a href="/admin" className="text-muted-foreground hover:text-foreground">Admin</a>
            )}
            <Button size="sm" variant="ghost" onClick={() => supabase.auth.signOut()}>Sign out</Button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-10">
        <div className="flex items-center justify-between gap-4">
          <div className="max-w-2xl">
            <h1 className="font-display text-4xl font-black tracking-tight sm:text-5xl">
              AI Agents
            </h1>
            <p className="mt-3 text-muted-foreground">
              Pick one agent to trade your connected Deriv account. Each agent runs a
              distinct strategy — swap between them any time. Additional strategies unlock
              as they graduate from beta.
            </p>
          </div>
          <Button asChild variant="outline" size="sm" className="shrink-0">
            <Link to="/dashboard"><ArrowLeft className="mr-1 h-4 w-4" /> Back</Link>
          </Button>
        </div>

      {agentsQ.isLoading ? (
        <div className="mt-10 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading agents…
        </div>
      ) : (
        <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {agentsQ.data?.map((a) => (
            <AgentCard
              key={a.id}
              agent={a}
              isSelected={myQ.data?.agent_id === a.id}
              onSelect={() => selectM.mutate(a.id)}
              busy={selectM.isPending && selectM.variables === a.id}
            />
          ))}
        </div>
      )}
    </main>
  );
}
