import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { AppShell, Panel, SectionTitle } from "@/components/app/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { getMyRoles } from "@/lib/deriv-oauth.functions";
import { getMyRiskProfile } from "@/lib/risk.functions";
import { Button } from "@/components/ui/button";
import { ChevronRight, LogOut, Shield, SlidersHorizontal, Crown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Profile & Plan — NexxTrade" },
      { name: "description", content: "Manage your NexxTrade profile, risk settings and subscription plan." },
      { property: "og:title", content: "Profile & Plan — NexxTrade" },
      { property: "og:description", content: "Manage your profile, risk settings and subscription plan." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProfilePage,
});

const PLANS = [
  { name: "Free", price: "$0", perks: ["1 agent", "Paper trading", "Basic metrics"], current: true },
  { name: "Pro", price: "$29/mo", perks: ["All agents", "Live trading", "Maxx AI priority"] },
  { name: "Elite", price: "$99/mo", perks: ["Multi-account", "Custom risk engine", "1:1 strategy review"] },
];

function ProfilePage() {
  const nav = useNavigate();
  const [email, setEmail] = useState<string>("");
  const rolesFn = useServerFn(getMyRoles);
  const riskFn = useServerFn(getMyRiskProfile);
  const rolesQ = useQuery({ queryKey: ["my-roles"], queryFn: () => rolesFn() });
  const riskQ = useQuery({ queryKey: ["risk-profile"], queryFn: () => riskFn() });

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

  const initials = (email.slice(0, 2) || "NX").toUpperCase();

  return (
    <AppShell title="Profile">
      <Panel className="flex items-center gap-4">
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-primary text-lg font-bold text-primary-foreground">
          {initials}
        </div>
        <div className="min-w-0">
          <div className="truncate text-base font-bold">{email || "Trader"}</div>
          <div className="text-sm text-muted-foreground">
            {rolesQ.data?.isAdmin ? "Administrator" : "Free plan"}
          </div>
        </div>
      </Panel>

      <Panel className="divide-y divide-border p-0">
        <Row to="/risk" icon={SlidersHorizontal} label="Risk profile"
          hint={riskQ.data ? `Level ${riskQ.data.risk_appetite}/10` : "Not set"} />
        <Row to="/agents" icon={Crown} label="My agents" hint="Choose strategy" />
        {rolesQ.data?.isAdmin && <Row to="/admin" icon={Shield} label="Admin control" hint="Engine & guardrails" />}
      </Panel>

      <SectionTitle>Plans</SectionTitle>
      <div className="space-y-3">
        {PLANS.map((p) => (
          <Panel key={p.name} className={cn(p.current && "border-primary ring-1 ring-primary")}>
            <div className="flex items-baseline justify-between">
              <h3 className="text-lg font-bold">{p.name}</h3>
              <span className="text-sm font-semibold text-muted-foreground">{p.price}</span>
            </div>
            <ul className="mt-3 space-y-1.5">
              {p.perks.map((k) => (
                <li key={k} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Check className="h-4 w-4 text-primary" /> {k}
                </li>
              ))}
            </ul>
            <Button
              variant={p.current ? "outline" : "default"}
              disabled={p.current}
              className="mt-4 h-11 w-full rounded-2xl font-semibold"
            >
              {p.current ? "Current plan" : `Upgrade to ${p.name}`}
            </Button>
          </Panel>
        ))}
      </div>

      <Button
        variant="ghost"
        className="h-12 w-full rounded-2xl text-destructive hover:text-destructive"
        onClick={async () => {
          await supabase.auth.signOut();
          nav({ to: "/" });
        }}
      >
        <LogOut className="mr-2 h-4 w-4" /> Sign out
      </Button>
    </AppShell>
  );
}

function Row({
  to,
  icon: Icon,
  label,
  hint,
}: {
  to: "/risk" | "/agents" | "/admin";
  icon: typeof Shield;
  label: string;
  hint: string;
}) {
  return (
    <Link to={to} className="flex items-center gap-3 px-5 py-4 transition hover:bg-muted/50">
      <Icon className="h-5 w-5 shrink-0 text-primary" />
      <span className="flex-1 text-sm font-semibold">{label}</span>
      <span className="text-xs text-muted-foreground">{hint}</span>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </Link>
  );
}
