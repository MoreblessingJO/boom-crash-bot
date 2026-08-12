import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { AppShell, Panel } from "@/components/app/AppShell";
import { getMyRiskProfile, saveMyRiskProfile } from "@/lib/risk.functions";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/risk")({
  head: () => ({
    meta: [
      { title: "AI Risk Assessment — NexxTrade" },
      { name: "description", content: "Tell Maxx AI your risk appetite, goal and experience so it can match you with the right trading agent." },
      { property: "og:title", content: "AI Risk Assessment — NexxTrade" },
      { property: "og:description", content: "Set your risk appetite, goal and target so your AI trades the way you want." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RiskPage,
});

const GOALS = [
  { key: "capital_growth", label: "Grow my capital", hint: "Compound over months" },
  { key: "consistent_profitability", label: "Consistent profits", hint: "Steady, lower variance" },
  { key: "daily_income", label: "Daily income", hint: "Frequent smaller wins" },
  { key: "capital_preservation", label: "Protect capital", hint: "Defence first" },
] as const;

const LEVELS = [
  { key: "beginner", label: "Beginner" },
  { key: "intermediate", label: "Intermediate" },
  { key: "expert", label: "Expert" },
] as const;

type Goal = (typeof GOALS)[number]["key"];
type Level = (typeof LEVELS)[number]["key"];

function RiskPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const getFn = useServerFn(getMyRiskProfile);
  const saveFn = useServerFn(saveMyRiskProfile);
  const q = useQuery({ queryKey: ["risk-profile"], queryFn: () => getFn() });

  const [appetite, setAppetite] = useState(5);
  const [goal, setGoal] = useState<Goal>("capital_growth");
  const [level, setLevel] = useState<Level>("intermediate");
  const [target, setTarget] = useState(2000);

  useEffect(() => {
    if (!q.data) return;
    setAppetite(q.data.risk_appetite);
    setGoal(q.data.trading_goal as Goal);
    setLevel(q.data.experience as Level);
    setTarget(Number(q.data.monthly_target));
  }, [q.data]);

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          risk_appetite: appetite,
          trading_goal: goal,
          experience: level,
          monthly_target: target,
        },
      }),
    onSuccess: () => {
      toast.success("Risk profile saved — Maxx AI is calibrated");
      qc.invalidateQueries({ queryKey: ["risk-profile"] });
      nav({ to: "/dashboard" });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save"),
  });

  const tone = appetite <= 3 ? "Conservative" : appetite <= 7 ? "Balanced" : "Aggressive";

  return (
    <AppShell title="Risk assessment" subtitle="Maxx AI uses this to size and select your trades">
      <Panel>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">Risk appetite</h2>
          <span className="rounded-full bg-primary/15 px-3 py-1 text-xs font-bold text-primary">{tone}</span>
        </div>
        <input
          type="range"
          min={1}
          max={10}
          value={appetite}
          onChange={(e) => setAppetite(Number(e.target.value))}
          className="mt-5 w-full accent-[var(--primary)]"
        />
        <div className="mt-1 flex justify-between text-xs text-muted-foreground">
          <span>Protect capital</span>
          <span className="font-bold text-foreground">{appetite}/10</span>
          <span>Maximum growth</span>
        </div>
      </Panel>

      <Panel>
        <h2 className="text-base font-bold">Primary goal</h2>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {GOALS.map((g) => (
            <button
              key={g.key}
              onClick={() => setGoal(g.key)}
              className={cn(
                "rounded-2xl border p-3 text-left transition",
                goal === g.key ? "border-primary bg-primary/10" : "border-border hover:border-primary/50",
              )}
            >
              <div className="text-sm font-semibold">{g.label}</div>
              <div className="text-xs text-muted-foreground">{g.hint}</div>
            </button>
          ))}
        </div>
      </Panel>

      <Panel>
        <h2 className="text-base font-bold">Experience</h2>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {LEVELS.map((l) => (
            <button
              key={l.key}
              onClick={() => setLevel(l.key)}
              className={cn(
                "rounded-2xl border py-3 text-sm font-semibold transition",
                level === l.key ? "border-primary bg-primary/10" : "border-border hover:border-primary/50",
              )}
            >
              {l.label}
            </button>
          ))}
        </div>
      </Panel>

      <Panel>
        <h2 className="text-base font-bold">Monthly profit target</h2>
        <div className="mt-3 flex items-center gap-2">
          <span className="text-2xl font-bold">$</span>
          <input
            type="number"
            min={0}
            value={target}
            onChange={(e) => setTarget(Number(e.target.value))}
            className="h-12 w-full rounded-2xl border border-input bg-background px-4 text-lg font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          A target is a plan, not a promise. Trading involves substantial risk.
        </p>
      </Panel>

      <Button
        className="h-14 w-full rounded-2xl text-base font-semibold glow-boom"
        onClick={() => save.mutate()}
        disabled={save.isPending}
      >
        {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
        Save profile
      </Button>
    </AppShell>
  );
}
