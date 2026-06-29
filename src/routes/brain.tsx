import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useTrading } from "@/lib/trading-store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/brain")({
  head: () => ({
    meta: [
      { title: "Brain Monitor — Boom & Crash AI Agent" },
      {
        name: "description",
        content:
          "Per-strategy and per-indicator performance breakdown for the autonomous trading agent.",
      },
    ],
  }),
  component: BrainMonitor,
});

type Agg = {
  key: string;
  trades: number;
  wins: number;
  losses: number;
  sumR: number;
  expectancyR: number; // simple avg R (sumR / trades) for aggregates
  pnl: number;
  bestSymbol?: { sym: string; r: number };
  worstSymbol?: { sym: string; r: number };
};

const REGIME_LABEL: Record<string, string> = {
  "spike-anticipation": "Spike Anticipation",
  "trend-following": "Trend Following",
  wait: "Wait / Flat",
};

const REGIME_DESC: Record<string, string> = {
  "spike-anticipation":
    "Counter-spike entries (fade Boom up-spikes, fade Crash down-spikes) when the tick interval is overdue.",
  "trend-following":
    "EMA(10/30) crossover with RSI(14) confirmation — rides momentum between spikes.",
  wait: "No clean setup — stays flat.",
};

// Win rate excludes breakevens — denominator is decided trades (W + L).
const wrPct = (wins: number, losses: number) =>
  wins + losses > 0 ? (wins / (wins + losses)) * 100 : 0;

function BrainMonitor() {
  const { learning, positions, resetLearning, lastPrices } = useTrading();

  // Live pulse — re-render every second so "time since last tick" and
  // unrealized R reflect the freshest market data even between ticks.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);

  const newestEpoch = useMemo(
    () => Object.values(lastPrices).reduce((m, p) => Math.max(m, p.epoch), 0),
    [lastPrices],
  );
  const secondsSinceTick = newestEpoch ? Math.max(0, Math.floor(now / 1000 - newestEpoch)) : null;
  const isLive = secondsSinceTick !== null && secondsSinceTick < 5;

  // Live open-position risk
  const openRisk = useMemo(() => {
    const open = positions.filter((p) => p.status === "open");
    let totalRiskR = 0;
    let totalUnrealizedR = 0;
    let totalUnrealizedPnl = 0;
    const rows = open.map((p) => {
      const lp = lastPrices[p.symbol];
      const dir = p.direction === "BUY" ? 1 : -1;
      const last = lp?.quote ?? p.entryPrice;
      const unrealizedR = p.rUnit > 0 ? ((last - p.entryPrice) * dir) / p.rUnit : 0;
      const unrealizedPnl = (last - p.entryPrice) * dir * p.stake;
      const distToTpR = p.rUnit > 0 ? ((p.tpPrice - last) * dir) / p.rUnit : 0;
      const distToSlR = p.rUnit > 0 ? ((last - p.slPrice) * dir) / p.rUnit : 0;
      const holdPct = p.maxHoldTicks > 0 ? (p.ticksHeld / p.maxHoldTicks) * 100 : 0;
      totalRiskR += 1; // each open trade risks 1R
      totalUnrealizedR += unrealizedR;
      totalUnrealizedPnl += unrealizedPnl;
      return { p, last, unrealizedR, unrealizedPnl, distToTpR, distToSlR, holdPct };
    });
    return { rows, totalRiskR, totalUnrealizedR, totalUnrealizedPnl };
  }, [positions, lastPrices]);

  // Per-regime aggregate from learning buckets
  const byRegime = useMemo(() => {
    const map = new Map<string, Agg>();
    for (const [key, b] of Object.entries(learning)) {
      const [sym, regime] = key.split("|");
      const a =
        map.get(regime) ??
        ({
          key: regime,
          trades: 0,
          wins: 0,
          losses: 0,
          sumR: 0,
          expectancyR: 0,
          pnl: 0,
        } as Agg);
      a.trades += b.trades;
      a.wins += b.wins;
      a.losses += b.losses;
      a.sumR += b.sumR;
      const r = b.trades ? b.sumR / b.trades : 0;
      if (!a.bestSymbol || r > a.bestSymbol.r) a.bestSymbol = { sym, r };
      if (!a.worstSymbol || r < a.worstSymbol.r) a.worstSymbol = { sym, r };
      map.set(regime, a);
    }
    // realized PnL per regime from positions
    for (const p of positions) {
      if (p.status !== "closed") continue;
      const a = map.get(p.regime);
      if (a) a.pnl += p.pnl ?? 0;
    }
    for (const a of map.values()) {
      a.expectancyR = a.trades ? a.sumR / a.trades : 0;
    }
    return Array.from(map.values()).sort((a, b) => b.expectancyR - a.expectancyR);
  }, [learning, positions]);

  // Per regime + direction
  const byRegimeDir = useMemo(() => {
    const map = new Map<string, Agg>();
    for (const [key, b] of Object.entries(learning)) {
      const [, regime, dir] = key.split("|");
      const k = `${regime}·${dir}`;
      const a =
        map.get(k) ??
        ({
          key: k,
          trades: 0,
          wins: 0,
          losses: 0,
          sumR: 0,
          expectancyR: 0,
          pnl: 0,
        } as Agg);
      a.trades += b.trades;
      a.wins += b.wins;
      a.losses += b.losses;
      a.sumR += b.sumR;
      map.set(k, a);
    }
    for (const a of map.values()) {
      a.expectancyR = a.trades ? a.sumR / a.trades : 0;
    }
    return Array.from(map.values()).sort((a, b) => b.expectancyR - a.expectancyR);
  }, [learning]);

  // Indicator buckets — derived from regime semantics
  const indicators = useMemo(() => {
    const spike = byRegime.find((r) => r.key === "spike-anticipation");
    const trend = byRegime.find((r) => r.key === "trend-following");
    return [
      {
        name: "Spike interval (ticks-since-spike / mean)",
        used: "spike-anticipation",
        agg: spike,
        note: "Triggers when dueRatio > 0.6. Higher dueRatio → higher confidence on counter-spike entries.",
      },
      {
        name: "EMA(10) vs EMA(30) crossover",
        used: "trend-following",
        agg: trend,
        note: "Fast above slow → long bias; fast below slow → short bias.",
      },
      {
        name: "RSI(14) momentum gate",
        used: "trend-following",
        agg: trend,
        note: "Longs require RSI 55–80; shorts require RSI 20–45. Filters chop and exhaustion.",
      },
    ];
  }, [byRegime]);

  const totals = byRegime.reduce(
    (acc, r) => {
      acc.trades += r.trades;
      acc.wins += r.wins;
      acc.losses += r.losses;
      acc.sumR += r.sumR;
      acc.pnl += r.pnl;
      return acc;
    },
    { trades: 0, wins: 0, losses: 0, sumR: 0, pnl: 0 },
  );
  const totalWinRate = wrPct(totals.wins, totals.losses);
  const totalAvgR = totals.trades ? totals.sumR / totals.trades : 0;
  const winner = byRegime[0];

  // Per (symbol · regime · direction) — top/bottom buckets
  const allBuckets = useMemo(() => {
    return Object.entries(learning)
      .map(([key, b]) => {
        const [sym, regime, dir] = key.split("|");
        return {
          sym,
          regime,
          dir,
          ...b,
          avgR: b.trades ? b.sumR / b.trades : 0,
        };
      })
      .filter((b) => b.trades > 0)
      .sort((a, b) => b.avgR - a.avgR);
  }, [learning]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-boom glow-cyan">
            <span className="text-lg font-black text-primary-foreground">B</span>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              Brain <span className="text-primary">Monitor</span>
            </h1>
            <p className="text-xs text-muted-foreground">
              Live strategy, indicator & open-position risk.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider",
              isLive
                ? "border-boom/40 bg-boom/10 text-boom"
                : "border-border bg-surface text-muted-foreground",
            )}
            title={
              secondsSinceTick === null
                ? "Open the dashboard to start the tick feed"
                : `Last tick ${secondsSinceTick}s ago`
            }
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                isLive ? "bg-boom animate-pulse" : "bg-muted-foreground",
              )}
            />
            {isLive ? "Live" : secondsSinceTick === null ? "Idle" : `${secondsSinceTick}s`}
          </div>
          <Button variant="ghost" size="sm" onClick={resetLearning}>
            Reset learner
          </Button>
          <Link
            to="/"
            className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium hover:border-primary/40"
          >
            ← Dashboard
          </Link>
        </div>
      </header>

      {/* Totals */}
      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <BigStat label="Closed trades" value={totals.trades.toString()} />
        <BigStat label="Win rate" value={`${totalWinRate.toFixed(0)}%`} />
        <BigStat
          label="Avg R / trade"
          value={totalAvgR.toFixed(2)}
          tone={totalAvgR > 0 ? "boom" : totalAvgR < 0 ? "crash" : "muted"}
        />
        <BigStat
          label="Net PnL"
          value={`${totals.pnl >= 0 ? "+" : ""}${totals.pnl.toFixed(2)}`}
          tone={totals.pnl > 0 ? "boom" : totals.pnl < 0 ? "crash" : "muted"}
        />
      </div>

      {/* Live open-position risk */}
      <Section
        title={`Open position risk · live (${openRisk.rows.length})`}
      >
        {openRisk.rows.length === 0 ? (
          <Empty>No open positions. Risk meter resumes when the agent enters a trade.</Empty>
        ) : (
          <>
            <div className="mb-2 grid grid-cols-3 gap-2">
              <MiniStat
                label="Risk at work"
                value={`${openRisk.totalRiskR.toFixed(1)}R`}
              />
              <MiniStat
                label="Unrealized R"
                value={openRisk.totalUnrealizedR.toFixed(2)}
                tone={
                  openRisk.totalUnrealizedR > 0
                    ? "boom"
                    : openRisk.totalUnrealizedR < 0
                      ? "crash"
                      : "muted"
                }
              />
              <MiniStat
                label="Unrealized PnL"
                value={`${openRisk.totalUnrealizedPnl >= 0 ? "+" : ""}${openRisk.totalUnrealizedPnl.toFixed(2)}`}
                tone={
                  openRisk.totalUnrealizedPnl > 0
                    ? "boom"
                    : openRisk.totalUnrealizedPnl < 0
                      ? "crash"
                      : "muted"
                }
              />
            </div>
            <div className="overflow-hidden rounded-lg border border-border bg-surface">
              <table className="w-full text-xs">
                <thead className="bg-surface text-muted-foreground">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-medium">Symbol · Side</th>
                    <th className="px-2 py-2 text-right font-medium">Last</th>
                    <th className="px-2 py-2 text-right font-medium">uR</th>
                    <th className="px-2 py-2 text-right font-medium">→TP</th>
                    <th className="px-2 py-2 text-right font-medium">→SL</th>
                    <th className="px-3 py-2 text-right font-medium">Held</th>
                  </tr>
                </thead>
                <tbody>
                  {openRisk.rows.map((r) => (
                    <tr key={r.p.id} className="border-t border-border/50">
                      <td className="px-3 py-1.5">
                        <span className="font-medium">{r.p.symbol}</span> ·{" "}
                        <span className={r.p.direction === "BUY" ? "text-boom" : "text-crash"}>
                          {r.p.direction}
                        </span>
                        <div className="text-[10px] text-muted-foreground">
                          {REGIME_LABEL[r.p.regime] ?? r.p.regime}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-right text-tabular">
                        {r.last.toFixed(2)}
                      </td>
                      <td
                        className={cn(
                          "px-2 py-1.5 text-right text-tabular font-semibold",
                          r.unrealizedR > 0 ? "text-boom" : r.unrealizedR < 0 ? "text-crash" : "",
                        )}
                      >
                        {r.unrealizedR >= 0 ? "+" : ""}
                        {r.unrealizedR.toFixed(2)}
                      </td>
                      <td className="px-2 py-1.5 text-right text-tabular text-boom/80">
                        {r.distToTpR.toFixed(2)}
                      </td>
                      <td className="px-2 py-1.5 text-right text-tabular text-crash/80">
                        {r.distToSlR.toFixed(2)}
                      </td>
                      <td className="px-3 py-1.5 text-right text-tabular">
                        <div className="flex items-center justify-end gap-1.5">
                          <div className="h-1 w-12 overflow-hidden rounded-full bg-border">
                            <div
                              className={cn(
                                "h-full",
                                r.holdPct > 80 ? "bg-crash" : r.holdPct > 50 ? "bg-yellow-500" : "bg-primary",
                              )}
                              style={{ width: `${Math.min(100, r.holdPct)}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-muted-foreground">
                            {r.p.ticksHeld}/{r.p.maxHoldTicks}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              uR = unrealized R · →TP / →SL = R-distance to target / stop. Updates on every tick from the dashboard feed.
            </p>
          </>
        )}
      </Section>

      {/* Winning strategy banner */}
      {winner && winner.trades >= 5 && (
        <div
          className={cn(
            "mb-5 rounded-lg border p-4",
            winner.expectancyR > 0
              ? "border-boom/40 bg-boom/5"
              : "border-crash/40 bg-crash/5",
          )}
        >
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Leading strategy
          </div>
          <div className="mt-1 flex flex-wrap items-baseline gap-3">
            <div className="text-lg font-bold">{REGIME_LABEL[winner.key] ?? winner.key}</div>
            <div
              className={cn(
                "text-tabular text-sm font-semibold",
                winner.expectancyR > 0 ? "text-boom" : "text-crash",
              )}
            >
              E[R] {winner.expectancyR.toFixed(2)} · {winner.trades} trades ·{" "}
              {wrPct(winner.wins, winner.losses).toFixed(0)}% win
            </div>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{REGIME_DESC[winner.key]}</p>
        </div>
      )}

      {/* By strategy (regime) */}
      <Section title="By strategy">
        {byRegime.length === 0 ? (
          <Empty>No closed trades yet — strategies activate after first exits.</Empty>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {byRegime.map((r) => {
              const wr = wrPct(r.wins, r.losses);
              return (
                <div
                  key={r.key}
                  className="rounded-lg border border-border bg-surface p-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold">
                      {REGIME_LABEL[r.key] ?? r.key}
                    </div>
                    <span
                      className={cn(
                        "text-tabular text-xs font-semibold",
                        r.expectancyR > 0 ? "text-boom" : "text-crash",
                      )}
                    >
                      E[R] {r.expectancyR.toFixed(2)}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {REGIME_DESC[r.key]}
                  </p>
                  <div className="mt-2 grid grid-cols-4 gap-2 text-[11px]">
                    <MiniStat label="Trades" value={r.trades.toString()} />
                    <MiniStat label="Win%" value={`${wr.toFixed(0)}%`} />
                    <MiniStat
                      label="ΣR"
                      value={r.sumR.toFixed(1)}
                      tone={r.sumR > 0 ? "boom" : r.sumR < 0 ? "crash" : "muted"}
                    />
                    <MiniStat
                      label="PnL"
                      value={r.pnl.toFixed(2)}
                      tone={r.pnl > 0 ? "boom" : r.pnl < 0 ? "crash" : "muted"}
                    />
                  </div>
                  {r.bestSymbol && r.worstSymbol && (
                    <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
                      <span>
                        Best: <span className="text-boom">{r.bestSymbol.sym}</span>{" "}
                        ({r.bestSymbol.r.toFixed(2)}R)
                      </span>
                      <span>
                        Worst: <span className="text-crash">{r.worstSymbol.sym}</span>{" "}
                        ({r.worstSymbol.r.toFixed(2)}R)
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* By strategy + direction */}
      <Section title="By strategy · direction">
        {byRegimeDir.length === 0 ? (
          <Empty>No data yet.</Empty>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-surface">
            <table className="w-full text-xs">
              <thead className="bg-surface text-muted-foreground">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium">Strategy · Side</th>
                  <th className="px-2 py-2 text-right font-medium">N</th>
                  <th className="px-2 py-2 text-right font-medium">Win%</th>
                  <th className="px-2 py-2 text-right font-medium">E[R]</th>
                  <th className="px-3 py-2 text-right font-medium">ΣR</th>
                </tr>
              </thead>
              <tbody>
                {byRegimeDir.map((r) => {
                  const [regime, dir] = r.key.split("·");
                  const wr = wrPct(r.wins, r.losses);
                  return (
                    <tr key={r.key} className="border-t border-border/50">
                      <td className="px-3 py-1.5">
                        <span className="font-medium">
                          {REGIME_LABEL[regime] ?? regime}
                        </span>{" "}
                        ·{" "}
                        <span className={dir === "BUY" ? "text-boom" : "text-crash"}>
                          {dir}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-right text-tabular">{r.trades}</td>
                      <td className="px-2 py-1.5 text-right text-tabular">
                        {wr.toFixed(0)}
                      </td>
                      <td
                        className={cn(
                          "px-2 py-1.5 text-right text-tabular",
                          r.expectancyR > 0 ? "text-boom" : "text-crash",
                        )}
                      >
                        {r.expectancyR.toFixed(2)}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-1.5 text-right text-tabular",
                          r.sumR > 0 ? "text-boom" : "text-crash",
                        )}
                      >
                        {r.sumR.toFixed(1)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Indicators */}
      <Section title="By indicator">
        <div className="grid gap-2 md:grid-cols-3">
          {indicators.map((ind) => {
            const a = ind.agg;
            const wr = a && a.trades ? (a.wins / a.trades) * 100 : 0;
            return (
              <div
                key={ind.name}
                className="rounded-lg border border-border bg-surface p-3"
              >
                <div className="text-sm font-semibold">{ind.name}</div>
                <div className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                  used in {REGIME_LABEL[ind.used] ?? ind.used}
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">{ind.note}</p>
                {a && a.trades > 0 ? (
                  <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                    <MiniStat label="N" value={a.trades.toString()} />
                    <MiniStat label="Win%" value={`${wr.toFixed(0)}%`} />
                    <MiniStat
                      label="E[R]"
                      value={a.expectancyR.toFixed(2)}
                      tone={
                        a.expectancyR > 0
                          ? "boom"
                          : a.expectancyR < 0
                            ? "crash"
                            : "muted"
                      }
                    />
                  </div>
                ) : (
                  <div className="mt-2 text-[11px] text-muted-foreground">No data yet.</div>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      {/* Top / bottom buckets */}
      <Section title="Top & bottom setups (symbol · strategy · side)">
        {allBuckets.length === 0 ? (
          <Empty>No closed trades yet.</Empty>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            <BucketList title="Top performers" buckets={allBuckets.slice(0, 6)} positive />
            <BucketList
              title="Worst performers"
              buckets={[...allBuckets].reverse().slice(0, 6)}
            />
          </div>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-surface px-3 py-6 text-center text-xs text-muted-foreground">
      {children}
    </div>
  );
}

function BigStat({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: string;
  tone?: "boom" | "crash" | "muted";
}) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "text-tabular text-xl font-bold",
          tone === "boom" && "text-boom",
          tone === "crash" && "text-crash",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: string;
  tone?: "boom" | "crash" | "muted";
}) {
  return (
    <div className="rounded border border-border/60 bg-background/40 px-1.5 py-1">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "text-tabular text-xs font-semibold",
          tone === "boom" && "text-boom",
          tone === "crash" && "text-crash",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function BucketList({
  title,
  buckets,
  positive,
}: {
  title: string;
  buckets: Array<{
    sym: string;
    regime: string;
    dir: string;
    trades: number;
    wins: number;
    avgR: number;
    sumR: number;
  }>;
  positive?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface">
      <div
        className={cn(
          "border-b border-border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider",
          positive ? "text-boom" : "text-crash",
        )}
      >
        {title}
      </div>
      <div className="divide-y divide-border/50">
        {buckets.map((b, i) => {
          const wr = b.trades ? (b.wins / b.trades) * 100 : 0;
          return (
            <div
              key={`${b.sym}-${b.regime}-${b.dir}-${i}`}
              className="flex items-center justify-between px-3 py-1.5 text-xs"
            >
              <div>
                <div className="font-medium">{b.sym}</div>
                <div className="text-[10px] text-muted-foreground">
                  {REGIME_LABEL[b.regime] ?? b.regime} ·{" "}
                  <span className={b.dir === "BUY" ? "text-boom" : "text-crash"}>
                    {b.dir}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <div
                  className={cn(
                    "text-tabular font-semibold",
                    b.avgR > 0 ? "text-boom" : "text-crash",
                  )}
                >
                  {b.avgR.toFixed(2)}R
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {b.trades}t · {wr.toFixed(0)}%
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
