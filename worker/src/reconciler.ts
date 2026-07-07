// Periodic Deriv portfolio reconciliation. Detects out-of-band closes
// (SL hit while worker was down, manual close in Deriv app) and adopts
// orphan contracts so nothing drifts silently.
import { db } from "./db.js";
import type { DerivAuthWS } from "./deriv-auth-ws.js";
import { auditEvent } from "./guardrails.js";

interface OpenPos {
  id: string;
  symbol: string;
  side: "BUY" | "SELL";
  stake: number;
  entry_price: number | null;
  deriv_contract_id: string | null;
  opened_epoch: number | null;
}

export async function reconcileOnce(authWs: DerivAuthWS) {
  if (!authWs.isReady()) return;

  let contracts;
  try {
    contracts = await authWs.portfolio();
  } catch (e) {
    console.warn(`[reconcile] portfolio fetch failed`, (e as Error).message);
    return;
  }

  const remoteById = new Map(contracts.map((c) => [c.contract_id, c]));

  const { data, error } = await db().from("positions").select("*").eq("status", "open");
  if (error) {
    console.warn(`[reconcile] load open failed`, error.message);
    return;
  }
  const openLocal = ((data ?? []) as OpenPos[]).filter((p) => !!p.deriv_contract_id);

  // 1) Local positions whose contract is gone from Deriv → fetch final state, close
  for (const p of openLocal) {
    if (!p.deriv_contract_id) continue;
    if (remoteById.has(p.deriv_contract_id)) continue;
    try {
      const poc = await authWs.openContract(p.deriv_contract_id);
      const isSold = !!poc.is_sold;
      if (!isSold) continue; // still live, just not in portfolio yet
      const sellPrice = Number(poc.sell_price ?? 0);
      const profit = Number(poc.profit ?? sellPrice - p.stake);
      const realized_r = p.stake > 0 ? profit / p.stake : 0;
      const exitPrice = Number(poc.exit_tick ?? poc.sell_spot ?? p.entry_price ?? 0);
      await db().from("positions").update({
        status: "closed",
        exit_price: exitPrice,
        closed_epoch: Number(poc.sell_time ?? Date.now() / 1000),
        closed_at: new Date().toISOString(),
        pnl: profit,
        realized_r,
        exit_reason: "RECONCILED",
      }).eq("id", p.id);
      await auditEvent("RECONCILED_CLOSE", {
        position_id: p.id, contract_id: p.deriv_contract_id, symbol: p.symbol,
        stake: p.stake, entry: p.entry_price, exit_price: exitPrice, pnl: profit,
      });
      console.log(`[reconcile] closed ${p.symbol} contract=${p.deriv_contract_id} pnl=${profit.toFixed(2)}`);
    } catch (e) {
      console.warn(`[reconcile] close-check failed ${p.deriv_contract_id}`, (e as Error).message);
    }
  }

  // 2) Remote contracts with no matching local row → adopt so the UI sees them
  const localById = new Set(openLocal.map((p) => p.deriv_contract_id));
  for (const c of contracts) {
    if (localById.has(c.contract_id)) continue;
    // Check if any position row already claims this contract (in any status)
    const { data: existing } = await db().from("positions").select("id")
      .eq("deriv_contract_id", c.contract_id).maybeSingle();
    if (existing) continue;
    const side = c.contract_type === "CALL" ? "BUY" : c.contract_type === "PUT" ? "SELL" : "BUY";
    await db().from("positions").insert({
      symbol: c.symbol,
      side,
      regime: "adopted",
      entry_price: c.buy_price,
      stake: c.buy_price,
      tp_r: 1, sl_r: 1, unit: 0.0001,
      status: "open",
      reason: "adopted from Deriv portfolio",
      confidence: 0,
      opened_epoch: c.purchase_time,
      deriv_contract_id: c.contract_id,
    });
    await auditEvent("ADOPTED_ORPHAN", {
      contract_id: c.contract_id, symbol: c.symbol, stake: c.buy_price, entry: c.buy_price,
    });
    console.log(`[reconcile] adopted orphan ${c.symbol} contract=${c.contract_id}`);
  }
}

export function startReconciler(authWs: DerivAuthWS, intervalMs = 60_000) {
  const tick = () => {
    reconcileOnce(authWs).catch((e) => console.warn(`[reconcile] tick error`, (e as Error).message));
  };
  // First run soon after boot (once ws is ready)
  setTimeout(tick, 5000);
  return setInterval(tick, intervalMs);
}
