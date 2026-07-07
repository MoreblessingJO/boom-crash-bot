import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Activity, ShieldCheck, Zap, TrendingUp, Lock, Bot } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sparky Trader — Autonomous Boom & Crash AI" },
      { name: "description", content: "Autonomous AI trading agent for Deriv Boom & Crash indices. Spike anticipation, trend detection, and adaptive learning — 24/7." },
      { property: "og:title", content: "Sparky Trader — Autonomous Boom & Crash AI" },
      { property: "og:description", content: "24/7 autonomous trading agent for Deriv Boom & Crash. Connect your account and let the engine trade with server-enforced risk guardrails." },
      { property: "og:type", content: "website" },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link to="/" className="flex items-center gap-2 font-bold text-lg">
            <Bot className="h-5 w-5 text-primary" />
            Sparky Trader
          </Link>
          <nav className="flex items-center gap-3">
            <Button asChild variant="ghost" size="sm"><Link to="/auth">Sign in</Link></Button>
            <Button asChild size="sm"><Link to="/auth">Get started</Link></Button>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-4 py-20 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            Live engine · 6 pairs streaming
          </div>
          <h1 className="mt-6 text-5xl font-bold tracking-tight sm:text-6xl">
            Autonomous trading for<br />Boom &amp; Crash indices.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            Connect your Deriv account. The engine watches every tick, anticipates spikes,
            and executes with server-enforced risk limits. Paper mode by default.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Button asChild size="lg"><Link to="/auth">Connect Deriv →</Link></Button>
            <Button asChild size="lg" variant="outline"><a href="#how">How it works</a></Button>
          </div>
        </section>

        <section id="how" className="mx-auto max-w-6xl px-4 py-16">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <Card key={f.title} className="p-6">
                <f.icon className="h-6 w-6 text-primary" />
                <h3 className="mt-3 text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
              </Card>
            ))}
          </div>
        </section>

        <section className="border-t bg-card/30">
          <div className="mx-auto max-w-4xl px-4 py-16 text-center">
            <h2 className="text-3xl font-bold">Built with real-money safety in mind.</h2>
            <p className="mt-4 text-muted-foreground">
              Idempotent orders, encrypted tokens, server-side kill switch, and full audit logs
              on every live trade. Real trading stays disabled until an admin flips it on.
            </p>
            <Button asChild size="lg" className="mt-8"><Link to="/auth">Create your account</Link></Button>
          </div>
        </section>

        <footer className="border-t">
          <div className="mx-auto max-w-6xl px-4 py-8 text-center text-xs text-muted-foreground">
            Trading involves risk. Sparky Trader is not investment advice.
          </div>
        </footer>
      </main>
    </div>
  );
}

const FEATURES = [
  { icon: Activity, title: "Tick-level intelligence", body: "Every Deriv tick feeds spike anticipation, trend, and reversal models — no polling delays." },
  { icon: ShieldCheck, title: "Server-enforced guardrails", body: "Daily loss cap, max open positions, max stake per trade — enforced before every buy." },
  { icon: Zap, title: "Idempotent orders", body: "Every trade carries a client req_id. Restarts and races cannot cause a double-buy." },
  { icon: TrendingUp, title: "Adaptive learning", body: "Per-regime buckets track realized R and auto-disable losing strategies." },
  { icon: Lock, title: "Encrypted tokens", body: "Your Deriv token is encrypted with AES-256-GCM at rest. Never logged, never exported." },
  { icon: Bot, title: "24/7 autonomous", body: "The engine runs on a keep-alive worker with heartbeat monitoring and health alerts." },
];
