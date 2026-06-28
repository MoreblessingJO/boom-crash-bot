import { useTrading } from "@/lib/trading-store";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function LearningPanel() {
  const { learning, learningEnabled, setLearningEnabled, resetLearning } = useTrading();
  const buckets = Object.entries(learning).sort(
    (a, b) => b[1].trades - a[1].trades,
  );

  const totals = buckets.reduce(
    (acc, [, b]) => {
      acc.trades += b.trades;
      acc.wins += b.wins;
      acc.sumR += b.sumR;
      return acc;
    },
    { trades: 0, wins: 0, sumR: 0 },
  );
  const winRate = totals.trades ? (totals.wins / totals.trades) * 100 : 0;
  const avgR = totals.trades ? totals.sumR / totals.trades : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">Continuous learning</div>
          <p className="text-[11px] text-muted-foreground">
            Adapts entry threshold per (symbol · regime · side) from realized R.
          </p>
        </div>
        <Switch
          checked={learningEnabled}
          onCheckedChange={setLearningEnabled}
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Trades" value={totals.trades.toString()} />
        <Stat label="Win rate" value={`${winRate.toFixed(0)}%`} />
        <Stat
          label="Avg R"
          value={avgR.toFixed(2)}
          tone={avgR > 0 ? "boom" : avgR < 0 ? "crash" : "muted"}
        />
      </div>

      <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-surface">
        {buckets.length === 0 ? (
          <div className="p-3 text-center text-[11px] text-muted-foreground">
            No closed trades yet — learner will activate after first exit.
          </div>
        ) : (
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 bg-surface text-muted-foreground">
              <tr className="text-left">
                <th className="px-2 py-1.5 font-medium">Bucket</th>
                <th className="px-1 py-1.5 text-right font-medium">N</th>
                <th className="px-1 py-1.5 text-right font-medium">Win%</th>
                <th className="px-1 py-1.5 text-right font-medium">E[R]</th>
                <th className="px-2 py-1.5 text-right font-medium">Conf≥</th>
              </tr>
            </thead>
            <tbody>
              {buckets.map(([k, b]) => {
                const [sym, regime, dir] = k.split("|");
                const wr = b.trades ? (b.wins / b.trades) * 100 : 0;
                return (
                  <tr
                    key={k}
                    className={cn(
                      "border-t border-border/50",
                      b.disabled && "opacity-50",
                    )}
                  >
                    <td className="px-2 py-1">
                      <div className="font-medium">{sym}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {regime} · <span className={dir === "BUY" ? "text-boom" : "text-crash"}>{dir}</span>
                        {b.disabled && <span className="ml-1 text-crash">·OFF</span>}
                      </div>
                    </td>
                    <td className="px-1 py-1 text-right text-tabular">{b.trades}</td>
                    <td className="px-1 py-1 text-right text-tabular">{wr.toFixed(0)}</td>
                    <td
                      className={cn(
                        "px-1 py-1 text-right text-tabular",
                        b.expectancyR > 0 ? "text-boom" : "text-crash",
                      )}
                    >
                      {b.expectancyR.toFixed(2)}
                    </td>
                    <td className="px-2 py-1 text-right text-tabular">
                      {(b.minConfidence * 100).toFixed(0)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Button variant="ghost" size="sm" className="w-full" onClick={resetLearning}>
        Reset learner
      </Button>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: string;
  tone?: "boom" | "crash" | "muted";
}) {
  return (
    <div className="rounded-lg border border-border bg-surface px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "text-tabular text-sm font-bold",
          tone === "boom" && "text-boom",
          tone === "crash" && "text-crash",
        )}
      >
        {value}
      </div>
    </div>
  );
}
