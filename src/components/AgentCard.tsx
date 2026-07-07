import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Loader2, Lock, Zap } from "lucide-react";
import type { Agent } from "@/lib/agents.functions";

const marketLabel: Record<Agent["market"], string> = {
  boom_crash: "Boom & Crash",
  crypto: "Crypto",
  forex: "Forex",
};

export function AgentCard({
  agent,
  isSelected,
  onSelect,
  busy,
}: {
  agent: Agent;
  isSelected: boolean;
  onSelect: () => void;
  busy: boolean;
}) {
  const disabled = agent.status === "coming_soon";
  return (
    <div
      className={cn(
        "group relative flex flex-col rounded-2xl border bg-card p-6 transition",
        isSelected
          ? "border-primary shadow-[0_0_0_1px_var(--primary)] glow-boom"
          : "border-border hover:border-primary/40",
        disabled && "opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-display truncate text-2xl font-black tracking-tight">
              {agent.name}
            </h3>
            {isSelected && <Check className="h-5 w-5 shrink-0 text-primary" />}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{agent.tagline}</p>
        </div>
        <StatusBadge status={agent.status} />
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        <Badge variant="outline" className="border-border/60">
          {marketLabel[agent.market]}
        </Badge>
        <Badge variant="outline" className="border-border/60 capitalize">
          {agent.risk_level} risk
        </Badge>
        {agent.avg_trades_per_day > 0 && (
          <Badge variant="outline" className="border-border/60">
            <Zap className="mr-1 h-3 w-3" />~{agent.avg_trades_per_day}/day
          </Badge>
        )}
      </div>

      <p className="mt-4 flex-1 text-sm leading-relaxed text-muted-foreground">
        {agent.description}
      </p>

      <div className="mt-6">
        {disabled ? (
          <Button disabled variant="outline" className="w-full">
            <Lock className="mr-2 h-4 w-4" /> Coming soon
          </Button>
        ) : isSelected ? (
          <Button disabled variant="outline" className="w-full border-primary/60 text-primary">
            <Check className="mr-2 h-4 w-4" /> Selected
          </Button>
        ) : (
          <Button onClick={onSelect} disabled={busy} className="w-full">
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Deploy {agent.name}
          </Button>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: Agent["status"] }) {
  if (status === "live")
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
        Live
      </span>
    );
  if (status === "beta")
    return (
      <span className="inline-flex shrink-0 items-center rounded-full border border-warn/40 bg-warn/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-warn">
        Beta
      </span>
    );
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
      Soon
    </span>
  );
}
