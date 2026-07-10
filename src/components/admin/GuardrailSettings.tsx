import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getLiveSettings, updateGuardrails } from "@/lib/admin-live.functions";
import { toast } from "sonner";

export function GuardrailSettings() {
  const load = useServerFn(getLiveSettings);
  const save = useServerFn(updateGuardrails);
  const [form, setForm] = useState({
    daily_loss_limit: 5,
    max_open_positions: 1,
    max_stake_per_trade: 1,
    max_stake_pct_equity: 0.02,
  });
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    load().then((s: any) => {
      if (s) {
        setForm({
          daily_loss_limit: Number(s.daily_loss_limit ?? 5),
          max_open_positions: Number(s.max_open_positions ?? 1),
          max_stake_per_trade: Number(s.max_stake_per_trade ?? 1),
          max_stake_pct_equity: Number(s.max_stake_pct_equity ?? 0.02),
        });
      }
      setLoaded(true);
    }).catch((e) => toast.error(e.message));
  }, []);

  async function handleSave() {
    setBusy(true);
    try {
      await save({ data: form });
      toast.success("Guardrails saved");
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  }

  if (!loaded) return <div className="text-xs text-muted-foreground">Loading guardrails…</div>;

  return (
    <div className="space-y-3">
      <Field label="Daily loss limit (USD)" hint="Auto-halts engine when today's P&L drops below −this. Set 0 to disable.">
        <input type="number" step="0.5" value={form.daily_loss_limit}
          onChange={(e) => setForm({ ...form, daily_loss_limit: Number(e.target.value) })}
          className="input" />
      </Field>
      <Field label="Max concurrent open positions" hint="Total across all symbols.">
        <input type="number" step="1" value={form.max_open_positions}
          onChange={(e) => setForm({ ...form, max_open_positions: Number(e.target.value) })}
          className="input" />
      </Field>
      <Field label="Max stake as % of equity" hint="Primary per-trade cap. 0.02 = 2% of live Deriv balance. This is the ONLY per-trade limit — no fixed dollar cap.">
        <input type="number" step="0.005" min="0" max="1" value={form.max_stake_pct_equity}
          onChange={(e) => setForm({ ...form, max_stake_pct_equity: Number(e.target.value) })}
          className="input" />
      </Field>
      <Field label="Fallback max stake (USD)" hint="Used ONLY if live equity is unavailable (Deriv authorize failed). Otherwise ignored.">
        <input type="number" step="0.1" value={form.max_stake_per_trade}
          onChange={(e) => setForm({ ...form, max_stake_per_trade: Number(e.target.value) })}
          className="input" />
      </Field>
      <button onClick={handleSave} disabled={busy}
        className="w-full rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40">
        Save guardrails
      </button>
      <style>{`.input { width:100%; border-radius:6px; border:1px solid hsl(var(--border)); background:hsl(var(--background)); padding:6px 8px; font-size:13px; font-variant-numeric:tabular-nums }`}</style>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs font-semibold">{label}</div>
      {hint && <div className="mb-1 text-[10px] text-muted-foreground">{hint}</div>}
      {children}
    </label>
  );
}
