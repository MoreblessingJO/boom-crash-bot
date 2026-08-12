import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, Panel, SectionTitle } from "@/components/app/AppShell";
import { BookOpen, ShieldCheck, Bot, LineChart, HelpCircle, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/resources")({
  head: () => ({
    meta: [
      { title: "Resources & Learning — NexxTrade" },
      { name: "description", content: "Learn how NexxTrade AI agents work, how risk controls protect your capital, and how to go live safely." },
      { property: "og:title", content: "Resources & Learning — NexxTrade" },
      { property: "og:description", content: "Guides on AI agents, risk controls and going live safely on NexxTrade." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ResourcesPage,
});

const GUIDES = [
  {
    icon: Bot,
    title: "How AI agents trade",
    body: "Each agent runs its own edge — spike anticipation, compression alignment, RSI divergence or exhaustion entries — and executes autonomously on your linked account.",
  },
  {
    icon: ShieldCheck,
    title: "Risk controls that protect you",
    body: "Every order is size-capped at a percentage of live equity, daily loss limits halt the engine, and orders are idempotent so a retry can never double-fill.",
  },
  {
    icon: LineChart,
    title: "Reading your performance",
    body: "Win rate alone is meaningless. Watch net P&L, average win vs average loss, and drawdown across at least 100 trades before scaling your stake.",
  },
  {
    icon: BookOpen,
    title: "Paper first, then live",
    body: "Every agent runs a paper ledger starting at $1,000. Let an agent prove itself on paper, then connect real funds with a small allocation.",
  },
];

const FAQ = [
  { q: "Does NexxTrade hold my funds?", a: "No. NexxTrade is non-custodial — your capital stays in your own Deriv account and we hold trade-only API access." },
  { q: "Can I switch agents any time?", a: "Yes. Pick a different agent from the Agents screen; open positions are managed to completion first." },
  { q: "What happens if I hit my loss limit?", a: "The engine halts new entries for the rest of the day and Maxx AI notifies you." },
];

function ResourcesPage() {
  return (
    <AppShell title="Resources" subtitle="Learn how to trade with your AI safely">
      <SectionTitle>Guides</SectionTitle>
      <div className="space-y-3">
        {GUIDES.map((g) => (
          <Panel key={g.title}>
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary">
                <g.icon className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold">{g.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{g.body}</p>
              </div>
            </div>
          </Panel>
        ))}
      </div>

      <SectionTitle>FAQ</SectionTitle>
      <Panel className="divide-y divide-border p-0">
        {FAQ.map((f) => (
          <details key={f.q} className="group px-5 py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold">
              {f.q}
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-open:rotate-90" />
            </summary>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
          </details>
        ))}
      </Panel>

      <Panel className="flex items-center gap-3">
        <HelpCircle className="h-5 w-5 shrink-0 text-electric" />
        <p className="text-sm">
          Still stuck? Ask{" "}
          <Link to="/ai" className="font-semibold text-primary">
            Maxx AI
          </Link>{" "}
          — it knows your account and your agents.
        </p>
      </Panel>

      <p className="pb-2 text-center text-xs text-muted-foreground">
        Trading involves substantial risk. Not investment advice.
      </p>
    </AppShell>
  );
}
