import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Sparkles, Bot, ArrowRight, LineChart, Lock } from "lucide-react";
import logo from "@/assets/nexxtrade-logo.png.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NexxTrade — Autonomous AI trading agents" },
      { name: "description", content: "Deploy AI agents that trade Deriv Boom & Crash 24/7 on your own account. Non-custodial, guardrail-protected, crypto & forex next." },
      { property: "og:title", content: "NexxTrade — Autonomous AI trading agents" },
      { property: "og:description", content: "Deploy AI agents that trade Deriv Boom & Crash 24/7 on your account. Non-custodial · Trade-only API." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-surface">
      <div className="mx-auto min-h-screen max-w-xl bg-background sm:border-x sm:border-border">
        <Nav />
        <main>
          <Hero />
          <Agents />
          <Markets />
          <Steps />
          <Safety />
        </main>
        <Footer />
      </div>
    </div>
  );
}

function Nav() {
  return (
    <header className="glass sticky top-0 z-40 border-b border-border px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <Link to="/" className="flex items-center gap-2.5">
          <img src={logo.url} alt="NexxTrade" className="h-8 w-8" />
          <span className="font-display text-lg font-bold tracking-tight">NexxTrade</span>
        </Link>
        <Button asChild size="sm" className="rounded-full px-5 font-semibold">
          <Link to="/auth">Get started</Link>
        </Button>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden px-5 pb-12 pt-10 text-center">
      <div className="absolute inset-0 grid-bg opacity-70" />
      <div className="relative">
        <div className="orb mx-auto h-32 w-32 rounded-full" />
        <h1 className="mt-8 text-[40px] font-bold leading-[1.05] tracking-tight">
          AI that trades
          <br />
          <span className="text-primary">while you live.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-sm text-[15px] leading-relaxed text-muted-foreground">
          Pick an agent, connect your Deriv account, and let autonomous strategies work
          your capital 24/7 — with server-enforced risk limits.
        </p>
        <div className="mt-7 space-y-2.5">
          <Button asChild className="h-14 w-full rounded-2xl text-base font-semibold glow-boom">
            <Link to="/auth">
              Start trading with AI <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-14 w-full rounded-2xl text-base font-semibold">
            <Link to="/auth">I already have an account</Link>
          </Button>
        </div>
        <div className="mt-6 flex items-center justify-center gap-4 text-[11px] font-medium text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-primary" /> Non-custodial</span>
          <span className="inline-flex items-center gap-1.5"><Lock className="h-3.5 w-3.5 text-primary" /> Trade-only API</span>
          <span className="inline-flex items-center gap-1.5"><LineChart className="h-3.5 w-3.5 text-primary" /> Live audit</span>
        </div>
      </div>
    </section>
  );
}

const AGENTS = [
  { name: "Nicco", tag: "Spike anticipation", status: "Live" },
  { name: "Agent Nexx", tag: "4-Green-Light compression", status: "Beta" },
  { name: "Agent 007", tag: "H4 RSI divergence kingpin", status: "Beta" },
  { name: "Sniper", tag: "M5 zone exhaustion", status: "Beta" },
];

function Agents() {
  return (
    <section className="border-t border-border px-5 py-12">
      <span className="text-xs font-bold uppercase tracking-widest text-primary">Agents</span>
      <h2 className="mt-2 text-3xl font-bold tracking-tight">Four strategies. One account.</h2>
      <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
        Each agent runs a distinct edge. Pick the one that matches your risk — swap any time.
      </p>
      <div className="mt-6 grid gap-3">
        {AGENTS.map((a) => (
          <div key={a.name} className="card-soft rounded-[20px] border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <div className="grid h-10 w-10 place-items-center rounded-2xl bg-primary/15 text-primary">
                <Bot className="h-5 w-5" />
              </div>
              <span
                className={
                  "rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider " +
                  (a.status === "Live"
                    ? "bg-primary/15 text-primary"
                    : "bg-muted text-muted-foreground")
                }
              >
                {a.status}
              </span>
            </div>
            <h3 className="mt-4 text-xl font-bold">{a.name}</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">{a.tag}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Markets() {
  return (
    <section className="border-t border-border bg-surface px-5 py-12">
      <span className="text-xs font-bold uppercase tracking-widest text-primary">Markets</span>
      <h2 className="mt-2 text-3xl font-bold tracking-tight">Synthetics now. Crypto & forex next.</h2>
      <div className="mt-6 grid grid-cols-3 gap-2">
        {[
          { name: "Boom & Crash", state: "Live" },
          { name: "Crypto", state: "Soon" },
          { name: "Forex", state: "Soon" },
        ].map((m) => (
          <div key={m.name} className="card-soft rounded-[20px] border border-border bg-card p-4 text-center">
            <div className="text-sm font-bold leading-tight">{m.name}</div>
            <div
              className={
                "mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase " +
                (m.state === "Live" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")
              }
            >
              {m.state}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

const STEPS = [
  { n: "01", title: "Set your risk profile", body: "Maxx AI learns your appetite, goal and experience in under a minute." },
  { n: "02", title: "Connect Deriv", body: "OAuth into your own account. Token encrypted at rest, trade-only scope." },
  { n: "03", title: "Your agent trades 24/7", body: "Server-enforced loss caps, position caps and stake clamps on every order." },
];

function Steps() {
  return (
    <section className="border-t border-border px-5 py-12">
      <span className="text-xs font-bold uppercase tracking-widest text-primary">Process</span>
      <h2 className="mt-2 text-3xl font-bold tracking-tight">Live in three steps.</h2>
      <div className="mt-6 space-y-3">
        {STEPS.map((s) => (
          <div key={s.n} className="card-soft flex gap-4 rounded-[20px] border border-border bg-card p-5">
            <div className="text-sm font-bold text-primary">{s.n}</div>
            <div>
              <h3 className="text-lg font-bold">{s.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Safety() {
  return (
    <section className="border-t border-border px-5 py-14 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/15 text-primary">
        <ShieldCheck className="h-7 w-7" />
      </div>
      <h2 className="mt-5 text-3xl font-bold tracking-tight">Built for real money.</h2>
      <p className="mx-auto mt-3 max-w-sm text-[15px] leading-relaxed text-muted-foreground">
        Idempotent orders, encrypted tokens, a server-side kill switch and a full audit trail
        on every live trade. Live mode stays off until you set your loss limits.
      </p>
      <Button asChild className="mt-7 h-14 w-full rounded-2xl text-base font-semibold glow-boom">
        <Link to="/auth">
          Create your account <Sparkles className="ml-1 h-4 w-4" />
        </Link>
      </Button>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border px-5 py-8 text-center text-xs text-muted-foreground">
      <div className="flex items-center justify-center gap-2">
        <img src={logo.url} alt="" className="h-5 w-5" />
        <span>© {new Date().getFullYear()} NexxTrade</span>
      </div>
      <p className="mt-2">Trading involves substantial risk. Not investment advice.</p>
    </footer>
  );
}
