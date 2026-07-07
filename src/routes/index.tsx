import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Activity, ShieldCheck, Zap, Bot, ArrowRight } from "lucide-react";
import logo from "@/assets/nexxtrade-logo.png.asset.json";
import { LiveTradingWidget } from "@/components/LiveTradingWidget";
import { MarketsSection } from "@/components/MarketsSection";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NexxTrade — Autonomous AI trading agents" },
      { name: "description", content: "Deploy AI agents that trade Deriv Boom & Crash 24/7 on your account. Non-custodial, guardrail-protected, crypto & forex next." },
      { property: "og:title", content: "NexxTrade — Autonomous AI trading agents" },
      { property: "og:description", content: "Deploy AI agents that trade Deriv Boom & Crash 24/7 on your account. Non-custodial · Trade-only API." },
      { property: "og:type", content: "website" },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Nav />
      <main>
        <Hero />
        <MarketsSection />
        <AgentsPreview />
        <HowItWorks />
        <Safety />
      </main>
      <Footer />
    </div>
  );
}

function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
        <Link to="/" className="flex items-center gap-2.5">
          <img src={logo.url} alt="NexxTrade" className="h-8 w-8" />
          <span className="font-display text-xl font-black tracking-tight">NexxTrade</span>
        </Link>
        <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
          <a href="#agents" className="hover:text-foreground">Agents</a>
          <a href="#markets" className="hover:text-foreground">Markets</a>
          <a href="#how" className="hover:text-foreground">How it works</a>
        </nav>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/auth">Sign in</Link>
          </Button>
          <Button asChild size="sm" className="glow-boom">
            <Link to="/auth">Launch agent</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 grid-bg opacity-40" />
      <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-20 lg:grid-cols-[1.4fr_1fr] lg:items-center lg:py-28">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            <span className="text-primary">Agents live · 6 symbols streaming</span>
          </div>
          <h1 className="font-display mt-6 text-5xl font-black leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
            Autonomous AI agents<br />
            that <span className="text-primary">trade for you.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted-foreground">
            Pick an agent. Connect your Deriv account. The agent trades Boom &amp; Crash
            24/7 with server-enforced risk limits. Non-custodial. Trade-only API.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" className="glow-boom">
              <Link to="/auth">
                Deploy an agent <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#agents">See the agents</a>
            </Button>
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-primary" /> Trade-only API scope</span>
            <span className="inline-flex items-center gap-1.5"><Zap className="h-3.5 w-3.5 text-primary" /> Idempotent orders</span>
            <span className="inline-flex items-center gap-1.5"><Activity className="h-3.5 w-3.5 text-primary" /> Live audit log</span>
          </div>
        </div>
        <div className="lg:pl-6">
          <LiveTradingWidget />
        </div>
      </div>
    </section>
  );
}

const AGENTS_TEASER = [
  { name: "Nicco", tag: "Spike anticipation", status: "Live" },
  { name: "Agent Nexx", tag: "4-Green-Light compression", status: "Beta" },
  { name: "Agent 007", tag: "H4 RSI Divergence Kingpin", status: "Beta" },
  { name: "Sniper", tag: "M5 Zone Exhaustion", status: "Beta" },
];

function AgentsPreview() {
  return (
    <section id="agents" className="border-t border-border/60">
      <div className="mx-auto max-w-6xl px-4 py-20">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <span className="font-mono text-xs uppercase tracking-widest text-primary">Agents</span>
            <h2 className="font-display mt-2 text-4xl font-black tracking-tight sm:text-5xl">
              Four strategies. One account.
            </h2>
            <p className="mt-4 text-muted-foreground">
              Each agent runs a distinct edge — pick the one whose behavior matches your risk. Swap any time.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link to="/auth">Browse all agents <ArrowRight className="ml-1 h-4 w-4" /></Link>
          </Button>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {AGENTS_TEASER.map((a) => (
            <div
              key={a.name}
              className="group rounded-2xl border border-border bg-card/60 p-5 transition hover:border-primary/40"
            >
              <div className="flex items-center justify-between">
                <Bot className="h-5 w-5 text-primary" />
                <span className={a.status === "Live"
                  ? "rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary"
                  : "rounded-full border border-warn/40 bg-warn/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-warn"}>
                  {a.status}
                </span>
              </div>
              <h3 className="font-display mt-4 text-xl font-black">{a.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{a.tag}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const STEPS = [
  { n: "01", title: "Connect Deriv", body: "OAuth into your Deriv account. Token encrypted at rest, trade-only scope." },
  { n: "02", title: "Pick an agent", body: "Choose Nicco, Nexx, 007, or Sniper. Swap agents any time." },
  { n: "03", title: "Agent trades 24/7", body: "Server-enforced loss caps, position caps, and stake clamps on every order." },
];

function HowItWorks() {
  return (
    <section id="how" className="border-t border-border/60 bg-card/20">
      <div className="mx-auto max-w-6xl px-4 py-20">
        <div className="max-w-2xl">
          <span className="font-mono text-xs uppercase tracking-widest text-primary">Process</span>
          <h2 className="font-display mt-2 text-4xl font-black tracking-tight sm:text-5xl">
            Live in three steps.
          </h2>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="rounded-2xl border border-border bg-card p-6">
              <div className="font-mono text-xs text-primary">{s.n}</div>
              <h3 className="font-display mt-3 text-2xl font-black">{s.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Safety() {
  return (
    <section className="border-t border-border/60">
      <div className="mx-auto max-w-4xl px-4 py-24 text-center">
        <ShieldCheck className="mx-auto h-10 w-10 text-primary" />
        <h2 className="font-display mt-4 text-4xl font-black tracking-tight sm:text-5xl">
          Built for real money.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
          Idempotent orders, encrypted tokens, server-side kill switch, full audit trail on
          every live trade. Live mode stays disabled until you set your loss limits.
        </p>
        <Button asChild size="lg" className="mt-8 glow-boom">
          <Link to="/auth">Create your account <ArrowRight className="ml-1 h-4 w-4" /></Link>
        </Button>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-xs text-muted-foreground sm:flex-row">
        <div className="flex items-center gap-2">
          <img src={logo.url} alt="" className="h-5 w-5" />
          <span>© {new Date().getFullYear()} NexxTrade</span>
        </div>
        <span>Trading involves substantial risk. Not investment advice.</span>
      </div>
    </footer>
  );
}
