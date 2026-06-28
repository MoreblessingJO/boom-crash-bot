import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { getDerivClient, type Tick } from "@/lib/deriv-client";
import { SYMBOLS, getSymbol } from "@/lib/symbols";
import {
  emptyState,
  localSignal,
  pushTick,
  type Signal,
  type SymbolState,
} from "@/lib/strategy";
import { useTrading, type Position } from "@/lib/trading-store";
import { TickChart } from "@/components/TickChart";
import { PositionsPanel } from "@/components/PositionsPanel";
import { ControlPanel } from "@/components/ControlPanel";
import { SymbolGrid } from "@/components/SymbolGrid";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Boom & Crash AI Trading Agent" },
      {
        name: "description",
        content:
          "Autonomous AI trading agent for Deriv Boom and Crash indices — live ticks, spike detection, paper trading and live execution.",
      },
      { property: "og:title", content: "Boom & Crash AI Trading Agent" },
      {
        property: "og:description",
        content:
          "Hybrid AI strategy (spike anticipation + trend following) across Boom and Crash 300/500/1000.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const client = useMemo(() => getDerivClient(), []);
  const [status, setStatus] = useState<"connecting" | "open" | "closed">("connecting");
  const [states, setStates] = useState<Record<string, SymbolState>>(() =>
    Object.fromEntries(SYMBOLS.map((s) => [s.code, emptyState()])),
  );

  const {
    selectedSymbol,
    selectSymbol,
    autoTrade,
    mode,
    stake,
    takeProfitR,
    stopLossR,
    maxHoldRatio,
    preSpikeExitRatio,
    maxDailyLoss,
    killSwitch,
    positions,
    addPosition,
    closePosition,
    tickPosition,
    pushSignal,
    apiToken,
  } = useTrading();

  // Connect once
  useEffect(() => {
    client.onStatus = setStatus;
    client.connect();
    if (apiToken) client.setAuthToken(apiToken);
  }, [client, apiToken]);

  // Subscribe to all symbols + prime with history
  useEffect(() => {
    const unsubs: Array<() => void> = [];
    let cancelled = false;

    async function prime() {
      for (const s of SYMBOLS) {
        const hist = await client.fetchHistory(s.code, 200);
        if (cancelled) return;
        if (hist.length) {
          setStates((prev) => {
            let st = emptyState();
            for (const t of hist) st = pushTick(st, t);
            return { ...prev, [s.code]: st };
          });
        }
      }
    }
    // Wait for connection then prime + subscribe
    const i = setInterval(() => {
      if (status === "open") {
        clearInterval(i);
        prime();
        for (const s of SYMBOLS) {
          const u = client.subscribe(s.code, (t: Tick) => {
            setStates((prev) => ({ ...prev, [s.code]: pushTick(prev[s.code], t) }));
          });
          unsubs.push(u);
        }
      }
    }, 200);

    return () => {
      cancelled = true;
      clearInterval(i);
      unsubs.forEach((u) => u());
    };
  }, [client, status]);

  // Derived live data for UI
  const prices: Record<string, number> = {};
  const changes: Record<string, number> = {};
  const ticksSinceSpike: Record<string, number> = {};
  for (const s of SYMBOLS) {
    const st = states[s.code];
    const last = st.ticks[st.ticks.length - 1];
    const first = st.ticks[0];
    prices[s.code] = last?.quote ?? 0;
    changes[s.code] = last && first ? last.quote - first.quote : 0;
    ticksSinceSpike[s.code] = st.ticksSinceSpike;
  }

  // Current symbol signal (recomputes on every tick)
  const sym = getSymbol(selectedSymbol);
  const symState = states[selectedSymbol] ?? emptyState();
  const signal = useMemo(() => localSignal(sym, symState), [sym, symState]);

  // ====== Auto-trade engine ======
  const lastSignalRef = useRef<string>("");
  const dailyPnlRef = useRef<{ day: string; pnl: number }>({
    day: new Date().toDateString(),
    pnl: 0,
  });

  // Manage exits on every tick: TP / SL / pre-spike / time stop.
  useEffect(() => {
    const open = positions.filter((p) => p.status === "open");
    for (const p of open) {
      const symDef = getSymbol(p.symbol);
      const st = states[p.symbol];
      const last = st?.ticks.at(-1);
      if (!last) continue;

      tickPosition(p.id);

      const dir = p.direction === "BUY" ? 1 : -1;

      // 1) TP / SL based on per-position price thresholds.
      if (dir === 1 ? last.quote >= p.tpPrice : last.quote <= p.tpPrice) {
        closePosition(p.id, last.quote, last.epoch, "TP");
        continue;
      }
      if (dir === 1 ? last.quote <= p.slPrice : last.quote >= p.slPrice) {
        closePosition(p.id, last.quote, last.epoch, "SL");
        continue;
      }

      // 2) Pre-spike exit — close BEFORE the spike rather than after it.
      // Boom spikes UP (bad for SELL); Crash spikes DOWN (bad for BUY).
      const againstSpike =
        (symDef.kind === "boom" && p.direction === "SELL") ||
        (symDef.kind === "crash" && p.direction === "BUY");
      if (
        againstSpike &&
        st.ticksSinceSpike >= symDef.avgSpikeTicks * preSpikeExitRatio
      ) {
        closePosition(p.id, last.quote, last.epoch, "pre-spike");
        continue;
      }

      // 3) Time stop.
      if (p.ticksHeld >= p.maxHoldTicks) {
        closePosition(p.id, last.quote, last.epoch, "time");
      }
    }
  }, [states, positions, preSpikeExitRatio, closePosition, tickPosition]);

  // Entry engine — opens at most one position per symbol
  useEffect(() => {
    if (!autoTrade || killSwitch) return;
    if (mode === "signals") return; // signals-only: never auto-open
    if (signal.regime === "wait" || !signal.direction) return;
    if (signal.confidence < 0.6) return;

    // Daily loss guard
    const today = new Date().toDateString();
    if (dailyPnlRef.current.day !== today) dailyPnlRef.current = { day: today, pnl: 0 };
    const realizedToday = positions
      .filter(
        (p) =>
          p.status === "closed" &&
          p.exitEpoch &&
          new Date(p.exitEpoch * 1000).toDateString() === today,
      )
      .reduce((s, p) => s + (p.pnl ?? 0), 0);
    if (realizedToday <= -Math.abs(maxDailyLoss)) return;

    // One position per symbol
    const hasOpen = positions.some(
      (p) => p.status === "open" && p.symbol === sym.code,
    );
    if (hasOpen) return;

    const last = symState.ticks.at(-1);
    if (!last) return;

    // Late-entry guard for counter-spike trades: if we're already past
    // 90% of the mean spike interval, the spike is imminent — skip.
    const againstSpike =
      (sym.kind === "boom" && signal.direction === "SELL") ||
      (sym.kind === "crash" && signal.direction === "BUY");
    if (
      againstSpike &&
      symState.ticksSinceSpike >= sym.avgSpikeTicks * 0.9
    ) {
      return;
    }

    const sigKey = `${sym.code}:${signal.direction}:${last.epoch}`;
    if (lastSignalRef.current === sigKey) return;
    lastSignalRef.current = sigKey;

    // R-unit = current median absolute tick change. Fallback to a small
    // fraction of price if we don't yet have a stable estimate.
    const rUnit = symState.medianAbsChange > 0
      ? symState.medianAbsChange
      : Math.max(last.quote * 0.00005, 0.01);
    const dir = signal.direction === "BUY" ? 1 : -1;
    const tpPrice = last.quote + dir * rUnit * takeProfitR;
    const slPrice = last.quote - dir * rUnit * stopLossR;
    const maxHoldTicks = Math.round(sym.avgSpikeTicks * maxHoldRatio);

    const pos: Position = {
      id: `${sym.code}-${last.epoch}-${Math.random().toString(36).slice(2, 7)}`,
      symbol: sym.code,
      direction: signal.direction,
      entryPrice: last.quote,
      entryEpoch: last.epoch,
      stake,
      status: "open",
      mode,
      reason: signal.reason,
      rUnit,
      tpPrice,
      slPrice,
      maxHoldTicks,
      ticksHeld: 0,
    };
    addPosition(pos);
    pushSignal({
      id: pos.id,
      symbol: sym.code,
      epoch: last.epoch,
      signal,
      acted: true,
    });

    if (mode === "live" && apiToken) {
      // Send Deriv buy proposal — synthetic indices use Rise/Fall (CALL/PUT)
      void placeLiveTrade(sym.code, signal.direction, stake);
    }
  }, [
    signal,
    autoTrade,
    killSwitch,
    mode,
    sym,
    symState,
    stake,
    takeProfitR,
    stopLossR,
    maxHoldRatio,
    positions,
    maxDailyLoss,
    addPosition,
    pushSignal,
    apiToken,
  ]);

  // Spike epoch markers for selected symbol chart
  const spikeEpochs = useMemo(() => {
    const out: number[] = [];
    const ts = symState.ticks;
    for (let i = 1; i < ts.length; i++) {
      const change = Math.abs(ts[i].quote - ts[i - 1].quote);
      if (symState.medianAbsChange > 0 && change > symState.medianAbsChange * 5) {
        out.push(ts[i].epoch);
      }
    }
    return out;
  }, [symState]);

  return (
    <div className="min-h-screen p-4 lg:p-6">
      <header className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-boom glow-cyan">
            <span className="text-lg font-black text-primary-foreground">A</span>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              Boom &amp; Crash <span className="text-primary">AI Agent</span>
            </h1>
            <p className="text-xs text-muted-foreground">
              Autonomous hybrid strategy · Deriv synthetic indices
            </p>
          </div>
        </div>
        <ModeBadge mode={mode} autoTrade={autoTrade} killSwitch={killSwitch} />
      </header>

      <SymbolGrid
        selected={selectedSymbol}
        onSelect={selectSymbol}
        prices={prices}
        changes={changes}
        ticksSinceSpike={ticksSinceSpike}
      />

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold">{sym.label}</h2>
                  <span
                    className={cn(
                      "rounded-md px-2 py-0.5 text-[10px] font-bold uppercase",
                      sym.kind === "boom"
                        ? "bg-boom/15 text-boom"
                        : "bg-crash/15 text-crash",
                    )}
                  >
                    {sym.kind}
                  </span>
                </div>
                <div className="mt-1 text-tabular text-2xl font-bold">
                  {prices[sym.code]?.toFixed(4) ?? "—"}
                </div>
              </div>
              <SignalCard signal={signal} ticksSinceSpike={symState.ticksSinceSpike} />
            </div>
            <div className="h-[360px]">
              <TickChart
                ticks={symState.ticks}
                spikeEpochs={spikeEpochs}
                kind={sym.kind}
              />
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Positions
            </h3>
            <PositionsPanel livePrices={prices} />
          </div>
        </div>

        <aside className="rounded-xl border border-border bg-card p-4">
          <ControlPanel status={status} />
        </aside>
      </div>

      <footer className="mt-6 text-center text-[11px] text-muted-foreground">
        Educational tool. Synthetic-index trading carries substantial risk —
        never auto-trade real funds you can't afford to lose.
      </footer>
    </div>
  );
}

function ModeBadge({
  mode,
  autoTrade,
  killSwitch,
}: {
  mode: string;
  autoTrade: boolean;
  killSwitch: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      {killSwitch && (
        <span className="rounded-md bg-crash/20 px-2 py-1 text-xs font-bold uppercase text-crash">
          Kill switch
        </span>
      )}
      <span
        className={cn(
          "rounded-md px-2.5 py-1 text-xs font-bold uppercase",
          mode === "live"
            ? "bg-crash/20 text-crash glow-crash"
            : mode === "signals"
              ? "bg-warn/20 text-warn"
              : "bg-primary/15 text-primary",
        )}
      >
        {mode}
      </span>
      <span
        className={cn(
          "rounded-md border px-2.5 py-1 text-xs font-medium uppercase",
          autoTrade && !killSwitch
            ? "border-boom text-boom"
            : "border-border text-muted-foreground",
        )}
      >
        {autoTrade && !killSwitch ? "AUTO ON" : "MANUAL"}
      </span>
    </div>
  );
}

function SignalCard({
  signal,
  ticksSinceSpike,
}: {
  signal: Signal;
  ticksSinceSpike: number;
}) {
  const dirColor =
    signal.direction === "BUY"
      ? "text-boom"
      : signal.direction === "SELL"
        ? "text-crash"
        : "text-muted-foreground";
  return (
    <div className="max-w-xs rounded-lg border border-border bg-surface px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            AI signal
          </div>
          <div className={cn("text-tabular text-lg font-bold", dirColor)}>
            {signal.direction ?? "WAIT"}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Conf
          </div>
          <div className="text-tabular text-lg font-bold">
            {(signal.confidence * 100).toFixed(0)}%
          </div>
        </div>
      </div>
      <div className="mt-1 text-[10px] uppercase tracking-wider text-primary">
        {signal.regime} · {ticksSinceSpike}t since spike
      </div>
      <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
        {signal.reason}
      </p>
    </div>
  );
}

// Live trade placement via Deriv WS (Rise/Fall contract, 5-tick duration)
async function placeLiveTrade(symbol: string, dir: "BUY" | "SELL", stake: number) {
  const client = getDerivClient();
  const contract_type = dir === "BUY" ? "CALL" : "PUT";
  const proposal = await client.request({
    proposal: 1,
    amount: stake,
    basis: "stake",
    contract_type,
    currency: "USD",
    duration: 5,
    duration_unit: "t",
    symbol,
  });
  const id = proposal?.proposal?.id;
  if (!id) {
    console.error("Live proposal failed", proposal?.error);
    return;
  }
  const buy = await client.request({ buy: id, price: stake });
  if (buy?.error) console.error("Live buy failed", buy.error);
}
