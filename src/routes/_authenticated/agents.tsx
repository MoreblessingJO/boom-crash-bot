import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { listAgents, getMyAgent, selectAgent } from "@/lib/agents.functions";
import { AgentCard } from "@/components/AgentCard";
import { AppShell } from "@/components/app/AppShell";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/agents")({
  head: () => ({
    meta: [
      { title: "AI Agents — NexxTrade" },
      { name: "description", content: "Choose which NexxTrade AI agent trades your Deriv account — Nicco, Nexx, 007 or Sniper." },
      { property: "og:title", content: "AI Agents — NexxTrade" },
      { property: "og:description", content: "Choose which AI agent trades your account. Swap strategies any time." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AgentsPage,
});


function AgentsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAgents);
  const myFn = useServerFn(getMyAgent);
  const selectFn = useServerFn(selectAgent);

  const agentsQ = useQuery({ queryKey: ["agents"], queryFn: () => listFn() });
  const myQ = useQuery({ queryKey: ["my-agent"], queryFn: () => myFn() });

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
    <AppShell title="AI Agents" subtitle="Pick one agent to trade your connected account — swap any time">
      {agentsQ.isLoading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading agents…
        </div>
      ) : (
        <div className="grid gap-4">
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
    </AppShell>
  );

}
