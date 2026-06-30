# Why only 2 of 6 symbols are trading

I checked the DB. Of the 59 closed positions ever opened, **100% are on BOOM300N or CRASH300N**. The other 4 symbols (BOOM/CRASH 500 and 1000) have **never** opened a trade. Looking at the last ~40 signal rows, every signal for BOOM500/CRASH500/BOOM1000/CRASH1000 is `regime: wait, confidence: 0.2` ("No clear regime — staying flat"). They aren't being skipped by the learner or daily-loss guard — the strategy is literally never producing a directional signal for them.

## Root cause

In `engine.server.ts` we fetch a fixed **200-tick window** per symbol:

```
const ticks = await fetchTicksHistory(sym.code, 200);
```

`localSignal` only proposes a spike-anticipation entry when `ticksSinceSpike / avgSpikeTicks > 0.6`. With a 200-tick window the maximum possible `ticksSinceSpike` is ~199, so:

| Symbol      | avgSpikeTicks | Max possible dueRatio | Can trigger >0.6? |
| ----------- | ------------- | --------------------- | ----------------- |
| BOOM/CRASH 300  | 300       | ~0.66                 | Yes (barely)      |
| BOOM/CRASH 500  | 500       | ~0.40                 | No                |
| BOOM/CRASH 1000 | 1000      | ~0.20                 | No                |

That's exactly the split we see in production. Trend-following almost never fires on these indices (it needs EMA10/30 cross + RSI in a narrow band), so without spike-anticipation the 500/1000 symbols are permanently flat.

It's not a "no clear signal so we stay safe" case — we're blind to the signal because the lookback window is too short for the slower symbols.

## The fix

Scale the history fetch per symbol so every symbol has enough lookback to *observe* a full spike cycle, plus margin.

### Change in `src/lib/deriv-history.server.ts`
No code change — already accepts a `count` arg up to several thousand (Deriv allows up to 5000).

### Change in `src/lib/engine.server.ts`
Replace the hardcoded `200` with a per-symbol count derived from `avgSpikeTicks`:

```ts
const histCount = Math.min(5000, Math.max(300, Math.round(sym.avgSpikeTicks * 2.5)));
const ticks = await fetchTicksHistory(sym.code, histCount);
```

This gives:
- 300-tick symbols → 750 ticks lookback
- 500-tick symbols → 1250 ticks lookback
- 1000-tick symbols → 2500 ticks lookback

All four currently-blind symbols can now reach `dueRatio > 0.6` and emit spike-anticipation signals when actually due. The existing learner gate, late-entry guard, and confidence floor stay in place, so we still won't trade when there's no real edge — but at least we'll be *evaluating* all 6 instead of only 2.

### Side effects to be aware of
- Slightly more bandwidth and a bit more CPU per cron tick (still well under the 30s budget — six short-lived WS fetches in parallel-friendly serial loop).
- `symbol_state.recent_ticks` still only stores the last 60 ticks, so the UI payload doesn't grow.
- `medianAbsChange` is computed on the last 100 ticks regardless of window size, so spike-detection scale stays stable.

## What I am NOT changing

- Strategy math, thresholds, R-multiples, learner, late-entry/time-stop guards — all untouched.
- DB schema — untouched.
- UI — untouched.

Single targeted fix to the lookback window so the slower symbols stop being structurally invisible to the engine.
