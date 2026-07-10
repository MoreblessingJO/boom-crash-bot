// Server-enforced pre-trade guardrails. Called before every buy attempt.
// Any block writes one row to live_trade_audit for post-mortem.
import { db } from "./db.js";

export interface Guardrails {
  halt_engine: boolean;
  is_live: boolean;
  daily_loss_limit: number;
  max_open_positions: number;
  max_stake_per_trade: number;
  max_stake_pct_equity: number;
}

export interface GuardCheckInput {
  symbol: string;
  proposedStake: number;
  equity: number | null;      // account balance from Deriv authorize
  openOrPendingCount: number;
  dailyPnl: number;            // negative = losses today
  guards: Guardrails;
  settingsSnapshot: unknown;
}

export type GuardOutcome =
  | { ok: true; stake: number; clamped?: string }
  | { ok: false; reason: string };

async function audit(event: string, snapshot: unknown, extra: Record<string, unknown> = {}) {
  try {
    await db().from("live_trade_audit").insert({
      event,
      settings_snapshot: snapshot,
      ...extra,
    });
  } catch (e) {
    console.warn(`[guardrails] audit write failed`, (e as Error).message);
  }
}

export async function checkGuardrails(inp: GuardCheckInput): Promise<GuardOutcome> {
  const { guards, proposedStake, equity, openOrPendingCount, dailyPnl, symbol, settingsSnapshot } = inp;

  if (guards.halt_engine) {
    await audit("BLOCKED_HALT", settingsSnapshot, { symbol, stake: proposedStake });
    return { ok: false, reason: "halt_engine" };
  }

  const dailyLimit = Number(guards.daily_loss_limit ?? 0);
  if (dailyLimit > 0 && dailyPnl <= -Math.abs(dailyLimit)) {
    await audit("BLOCKED_DAILY_LOSS", settingsSnapshot, {
      symbol, stake: proposedStake, pnl: dailyPnl,
    });
    // Auto-halt after breach
    try {
      await db().from("settings").update({ halt_engine: true, updated_at: new Date().toISOString() }).eq("id", 1);
      console.warn(`[guardrails] daily loss ${dailyPnl} breached limit ${dailyLimit} — halted engine`);
    } catch { /* noop */ }
    return { ok: false, reason: `daily_loss ${dailyPnl.toFixed(2)} <= -${dailyLimit}` };
  }

  const maxOpen = Number(guards.max_open_positions ?? 0);
  if (maxOpen > 0 && openOrPendingCount >= maxOpen) {
    await audit("BLOCKED_MAX_OPEN", settingsSnapshot, { symbol, stake: proposedStake });
    return { ok: false, reason: `max_open ${openOrPendingCount}/${maxOpen}` };
  }

  let stake = proposedStake;
  let clamped: string | undefined;

  // Per-trade cap is ALWAYS a percentage of live equity — never a fixed dollar amount.
  // `max_stake_pct_equity` is the source of truth (default 2%). If equity is
  // unavailable (Deriv authorize failed), fall back to `max_stake_per_trade`
  // interpreted the same way: as a pct if <=1, else as a hard-dollar backstop.
  const pct = Number(guards.max_stake_pct_equity ?? 0.02) || 0.02;
  if (equity && equity > 0) {
    const cap = equity * pct;
    if (stake > cap) {
      clamped = `pct_equity ${stake.toFixed(2)}→${cap.toFixed(2)} (${(pct * 100).toFixed(2)}% of ${equity.toFixed(2)})`;
      stake = cap;
    }
  } else {
    const raw = Number(guards.max_stake_per_trade ?? 0);
    const fallback = raw > 0 && raw <= 1 ? /* pct */ 0 : raw; // pct without equity is meaningless
    if (fallback > 0 && stake > fallback) {
      clamped = `per_trade_fallback ${stake.toFixed(2)}→${fallback.toFixed(2)} (no equity)`;
      stake = fallback;
    }
  }
  stake = Math.max(0.35, Number(stake.toFixed(2)));

  if (clamped) {
    await audit("STAKE_CLAMPED", settingsSnapshot, { symbol, stake, entry: proposedStake });
  }
  return { ok: true, stake, clamped };
}

export async function auditEvent(event: string, extra: Record<string, unknown> = {}) {
  return audit(event, extra.settings_snapshot ?? null, extra);
}
