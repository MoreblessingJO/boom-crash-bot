import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getLiveSettings, setHaltEngine, setLiveMode, getOwnerDerivSummary } from "@/lib/admin-live.functions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function GoLiveToggle() {
  const load = useServerFn(getLiveSettings);
  const loadOwner = useServerFn(getOwnerDerivSummary);
  const toggleLive = useServerFn(setLiveMode);
  const toggleHalt = useServerFn(setHaltEngine);

  const [settings, setSettings] = useState<any>(null);
  const [owner, setOwner] = useState<any>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      const [s, o] = await Promise.all([load(), loadOwner()]);
      setSettings(s);
      setOwner(o);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15_000);
    return () => clearInterval(t);
  }, []);

  async function handleGoLive() {
    if (confirmText !== "GO LIVE") return;
    setBusy(true);
    try {
      await toggleLive({ data: { is_live: true } });
      toast.success("Live trading enabled");
      setConfirming(false);
      setConfirmText("");
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  }

  async function handleDisable() {
    setBusy(true);
    try {
      await toggleLive({ data: { is_live: false } });
      toast.success("Reverted to paper mode");
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  }

  async function handleHalt(halt: boolean) {
    setBusy(true);
    try {
      await toggleHalt({ data: { halt } });
      toast.success(halt ? "Engine halted" : "Engine resumed");
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  }

  if (!settings) return <div className="text-xs text-muted-foreground">Loading live controls…</div>;

  const isLive = !!settings.is_live;
  const isHalted = !!settings.halt_engine;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">Trading mode</div>
          <div className="text-xs text-muted-foreground">
            {isLive ? "LIVE — real money at risk" : "Paper — simulated only"}
          </div>
        </div>
        <span className={cn(
          "rounded-md px-2.5 py-1 text-xs font-bold uppercase",
          isLive ? "bg-crash/20 text-crash" : "bg-primary/15 text-primary",
        )}>
          {isLive ? "LIVE" : "PAPER"}
        </span>
      </div>

      <div className="rounded-md border border-border bg-surface p-3 text-xs">
        <div className="mb-1 font-semibold uppercase tracking-wider text-muted-foreground">Owner Deriv account</div>
        {owner ? (
          <div className="space-y-0.5">
            <div><span className="text-muted-foreground">Login: </span>{owner.deriv_loginid}</div>
            <div>
              <span className="text-muted-foreground">Type: </span>
              <span className={owner.account_type === "real" ? "text-crash font-semibold" : "text-primary"}>
                {owner.account_type}
              </span>
              {owner.currency && <span className="text-muted-foreground"> · {owner.currency}</span>}
            </div>
          </div>
        ) : (
          <div className="text-warn">Not connected. Connect on /dashboard before going live.</div>
        )}
      </div>

      {!isLive ? (
        !confirming ? (
          <button
            onClick={() => setConfirming(true)}
            disabled={!owner}
            className="w-full rounded-md bg-crash px-3 py-2 text-sm font-bold uppercase text-crash-foreground disabled:opacity-40"
          >
            Enable Live Trading
          </button>
        ) : (
          <div className="space-y-2 rounded-md border border-crash/40 bg-crash/5 p-3">
            <div className="text-xs">
              Type <code className="rounded bg-surface px-1 py-0.5 font-mono">GO LIVE</code> to confirm.
              Real funds will be at risk on <b>{owner?.deriv_loginid}</b> ({owner?.account_type}).
            </div>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
              placeholder="Type GO LIVE"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={handleGoLive}
                disabled={busy || confirmText !== "GO LIVE"}
                className="flex-1 rounded-md bg-crash px-3 py-1.5 text-xs font-bold text-crash-foreground disabled:opacity-40"
              >
                Confirm
              </button>
              <button
                onClick={() => { setConfirming(false); setConfirmText(""); }}
                className="rounded-md border border-border px-3 py-1.5 text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
        )
      ) : (
        <button
          onClick={handleDisable}
          disabled={busy}
          className="w-full rounded-md border border-border px-3 py-2 text-sm font-medium"
        >
          Revert to Paper
        </button>
      )}

      <button
        onClick={() => handleHalt(!isHalted)}
        disabled={busy}
        className={cn(
          "w-full rounded-md px-3 py-2 text-sm font-bold uppercase",
          isHalted ? "border border-border" : "bg-warn text-warn-foreground",
        )}
      >
        {isHalted ? "Resume Engine" : "Halt Engine"}
      </button>
    </div>
  );
}
