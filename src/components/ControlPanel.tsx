import { useTrading, type Mode } from "@/lib/trading-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useState } from "react";

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: "paper", label: "Paper", hint: "Simulated, no risk" },
  { id: "signals", label: "Signals", hint: "Alerts only" },
  { id: "live", label: "Live", hint: "Real money — Deriv API" },
];

export function ControlPanel({ status }: { status: "connecting" | "open" | "closed" }) {
  const {
    mode, setMode, apiToken, setApiToken,
    autoTrade, setAutoTrade, stake, setStake,
    takeProfitR, stopLossR, setRisk,
    maxHoldRatio, setMaxHoldRatio,
    preSpikeExitRatio, setPreSpikeExitRatio,
    maxDailyLoss, setMaxDailyLoss,
    killSwitch, setKill, resetPaper, paperBalance,
  } = useTrading();

  const [tokenDraft, setTokenDraft] = useState(apiToken ?? "");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Connection
          </div>
          <div className="mt-1 flex items-center gap-2 text-sm">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                status === "open"
                  ? "bg-boom glow-boom"
                  : status === "connecting"
                    ? "bg-warn"
                    : "bg-crash",
              )}
            />
            <span className="capitalize">{status === "open" ? "Live ticks" : status}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Paper balance
          </div>
          <div className="text-tabular text-lg font-semibold text-primary">
            ${paperBalance.toFixed(2)}
          </div>
        </div>
      </div>

      <div>
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">
          Execution mode
        </Label>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={cn(
                "rounded-lg border px-3 py-2 text-left transition-all",
                mode === m.id
                  ? "border-primary bg-primary/10 glow-cyan"
                  : "border-border bg-surface hover:border-primary/50",
              )}
            >
              <div className="text-sm font-semibold">{m.label}</div>
              <div className="text-[10px] text-muted-foreground">{m.hint}</div>
            </button>
          ))}
        </div>
      </div>

      {mode === "live" && (
        <div className="rounded-lg border border-warn/40 bg-warn/5 p-3">
          <div className="text-xs font-semibold text-warn">
            ⚠ Live trading uses real funds
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Paste a Deriv API token (Read + Trade scopes) from
            app.deriv.com → API token. Stored locally only.
          </p>
          <div className="mt-2 flex gap-2">
            <Input
              type="password"
              placeholder="Deriv API token"
              value={tokenDraft}
              onChange={(e) => setTokenDraft(e.target.value)}
              className="font-mono text-xs"
            />
            <Button
              size="sm"
              onClick={() => setApiToken(tokenDraft.trim() || null)}
              variant={apiToken ? "secondary" : "default"}
            >
              {apiToken ? "Update" : "Save"}
            </Button>
          </div>
          {apiToken && (
            <div className="mt-1 text-[10px] text-boom">
              ✓ Token saved (••••{apiToken.slice(-4)})
            </div>
          )}
        </div>
      )}

      <div className="space-y-3 border-t border-border pt-3">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm">Auto-trade</Label>
            <p className="text-[11px] text-muted-foreground">
              Let the agent open positions automatically
            </p>
          </div>
          <Switch
            checked={autoTrade && !killSwitch}
            onCheckedChange={(v) => setAutoTrade(v)}
            disabled={killSwitch}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">Stake ($)</Label>
            <Input
              type="number"
              min={0.35}
              step={0.5}
              value={stake}
              onChange={(e) => setStake(Number(e.target.value) || 1)}
              className="text-tabular"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Max daily loss ($)</Label>
            <Input
              type="number"
              min={1}
              value={maxDailyLoss}
              onChange={(e) => setMaxDailyLoss(Number(e.target.value) || 50)}
              className="text-tabular"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Take profit (R)</Label>
            <Input
              type="number"
              min={0.5}
              step={0.5}
              value={takeProfitR}
              onChange={(e) => setRisk(Number(e.target.value) || 3, stopLossR)}
              className="text-tabular"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Stop loss (R)</Label>
            <Input
              type="number"
              min={0.5}
              step={0.5}
              value={stopLossR}
              onChange={(e) => setRisk(takeProfitR, Number(e.target.value) || 1)}
              className="text-tabular"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Pre-spike exit (× interval)</Label>
            <Input
              type="number"
              min={0.3}
              max={1}
              step={0.05}
              value={preSpikeExitRatio}
              onChange={(e) => setPreSpikeExitRatio(Number(e.target.value) || 0.8)}
              className="text-tabular"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Max hold (× interval)</Label>
            <Input
              type="number"
              min={0.2}
              step={0.1}
              value={maxHoldRatio}
              onChange={(e) => setMaxHoldRatio(Number(e.target.value) || 1.2)}
              className="text-tabular"
            />
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Risk is sized in <span className="text-primary">R-multiples</span> of each market's
          median tick move (captured at entry), so SL/TP scale with volatility.
          Default 3:1 RR means a single loss costs only 1/3 of a single win.
        </p>
      </div>

      <div className="flex gap-2 border-t border-border pt-3">
        <Button
          variant={killSwitch ? "destructive" : "outline"}
          className="flex-1"
          onClick={() => {
            setKill(!killSwitch);
            if (!killSwitch) setAutoTrade(false);
          }}
        >
          {killSwitch ? "Kill switch ON" : "Kill switch"}
        </Button>
        <Button variant="ghost" onClick={resetPaper}>
          Reset paper
        </Button>
      </div>
    </div>
  );
}
