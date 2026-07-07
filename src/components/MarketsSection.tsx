import { cn } from "@/lib/utils";
import { Lock, Zap } from "lucide-react";

const MARKETS = [
  {
    name: "Boom & Crash",
    tagline: "Deriv synthetic indices",
    status: "live" as const,
    detail: "6 symbols · 24/7 · spike anticipation live",
  },
  {
    name: "Crypto",
    tagline: "BTC · ETH · SOL and more",
    status: "soon" as const,
    detail: "Momentum + funding-rate strategy in development",
  },
  {
    name: "Forex",
    tagline: "Major FX pairs",
    status: "soon" as const,
    detail: "Session-open scalping · EUR/USD, GBP/USD, USD/JPY",
  },
];

export function MarketsSection() {
  return (
    <section id="markets" className="border-t border-border/60">
      <div className="mx-auto max-w-6xl px-4 py-20">
        <div className="max-w-2xl">
          <span className="font-mono text-xs uppercase tracking-widest text-primary">
            Markets
          </span>
          <h2 className="font-display mt-2 text-4xl font-black tracking-tight sm:text-5xl">
            One platform. Every market.
          </h2>
          <p className="mt-4 text-muted-foreground">
            NexxTrade launches on Deriv Boom & Crash. Crypto and Forex agents are
            already in build.
          </p>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {MARKETS.map((m) => (
            <div
              key={m.name}
              className={cn(
                "rounded-2xl border p-6 transition",
                m.status === "live"
                  ? "border-primary/40 bg-primary/5"
                  : "border-border bg-card/50 opacity-70",
              )}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-display text-2xl font-black">{m.name}</h3>
                {m.status === "live" ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                    <Zap className="h-3 w-3" /> Live
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    <Lock className="h-3 w-3" /> Soon
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{m.tagline}</p>
              <p className="mt-4 text-xs text-muted-foreground">{m.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
