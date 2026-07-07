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
  const maxPer = Number(guards.max_stake_per_trade ?? 0);
  if (maxPer > 0 && stake > maxPer) {
    clamped = `per_trade ${stake.toFixed(2)}→${maxPer.toFixed(2)}`;
    stake = maxPer;
  }
  const pct = Number(guards.max_stake_pct_equity ?? 0);
  if (pct > 0 && equity && equity > 0) {
    const cap = equity * pct;
    if (stake > cap) {
      clamped = (clamped ? clamped + "; " : "") + `pct_equity ${stake.toFixed(2)}→${cap.toFixed(2)}`;
      stake = cap;
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
