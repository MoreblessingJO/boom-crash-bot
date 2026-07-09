// Indicator library shared by multi-timeframe strategies.
// Boom/Crash synthetic indices tick ~1/sec, so classical H4/H1/M5 frames
// don't map cleanly. We approximate:
//   long   ("H4-equivalent") ~ last 600 ticks
//   medium ("H1-equivalent") ~ last 150 ticks
//   short  ("M5-equivalent") ~ last 30 ticks
// Tune via agent.strategy_params.

import type { RawTick } from "./strategy.js";

export function slice(ticks: RawTick[], n: number): RawTick[] {
  return ticks.length <= n ? ticks : ticks.slice(-n);
}

export function rsi(prices: number[], period = 14): number {
  if (prices.length <= period) return 50;
  const start = prices.length - period;
  let gains = 0, losses = 0;
  for (let i = start; i < prices.length; i++) {
    const d = prices[i] - prices[i - 1];
    if (d >= 0) gains += d; else losses -= d;
  }
  const avgG = gains / period, avgL = losses / period;
  const rs = avgL === 0 ? 100 : avgG / avgL;
  return 100 - 100 / (1 + rs);
}

/** Compression ratio: recent range vs prior range. < 1 = tightening. */
export function compressionRatio(ticks: RawTick[], recent = 30, prior = 100): number {
  if (ticks.length < recent + prior) return 1;
  const r = ticks.slice(-recent).map(t => t.quote);
  const p = ticks.slice(-(recent + prior), -recent).map(t => t.quote);
  const recentRange = Math.max(...r) - Math.min(...r);
  const priorRange = Math.max(...p) - Math.min(...p);
  if (priorRange <= 0) return 1;
  return recentRange / priorRange;
}

/** Tick pressure: (up - down) / total over recent N ticks. Range [-1,1]. */
export function tickPressure(ticks: RawTick[], n = 20): number {
  if (ticks.length < n + 1) return 0;
  const w = ticks.slice(-(n + 1));
  let up = 0, down = 0;
  for (let i = 1; i < w.length; i++) {
    const d = w[i].quote - w[i - 1].quote;
    if (d > 0) up++; else if (d < 0) down++;
  }
  const total = up + down;
  if (total === 0) return 0;
  return (up - down) / total;
}

/**
 * H1-equivalent price position: where does the current price sit in the
 * medium-window's high-low band? Returns 0 (bottom) .. 1 (top).
 */
export function pricePosition(ticks: RawTick[], window = 150): number {
  if (ticks.length < 2) return 0.5;
  const w = slice(ticks, window).map(t => t.quote);
  const hi = Math.max(...w), lo = Math.min(...w);
  if (hi === lo) return 0.5;
  return (w[w.length - 1] - lo) / (hi - lo);
}

/**
 * TSSL score (Trend Strength + Spike Likelihood) — composite 0..1.
 * Combines normalized EMA slope and ticks-since-spike ratio.
 */
export function tsslScore(
  emaFast: number, emaSlow: number, ticksSinceSpike: number, avgSpikeTicks: number,
): number {
  const trend = emaSlow > 0 ? Math.min(1, Math.abs(emaFast - emaSlow) / (emaSlow * 0.001)) : 0;
  const spikeReady = Math.min(1, ticksSinceSpike / Math.max(1, avgSpikeTicks));
  return trend * 0.5 + spikeReady * 0.5;
}

/**
 * Detect classical RSI divergence between two swing points inside the window.
 * bullish: price lower-low + RSI higher-low. bearish: mirror.
 * Uses the first and last third of the window as swing zones.
 */
export function rsiDivergence(
  ticks: RawTick[], window = 600, rsiPeriod = 14,
): "bullish" | "bearish" | null {
  if (ticks.length < window) return null;
  const w = ticks.slice(-window);
  const prices = w.map(t => t.quote);
  const rsis: number[] = [];
  for (let i = 0; i < prices.length; i++) {
    rsis.push(i >= rsiPeriod ? rsi(prices.slice(0, i + 1), rsiPeriod) : 50);
  }
  const third = Math.floor(window / 3);
  const leftPrices = prices.slice(0, third);
  const rightPrices = prices.slice(-third);
  const leftRsi = rsis.slice(0, third);
  const rightRsi = rsis.slice(-third);

  const leftLowIdx = leftPrices.indexOf(Math.min(...leftPrices));
  const rightLowIdx = rightPrices.indexOf(Math.min(...rightPrices));
  const leftHighIdx = leftPrices.indexOf(Math.max(...leftPrices));
  const rightHighIdx = rightPrices.indexOf(Math.max(...rightPrices));

  const bullish =
    rightPrices[rightLowIdx] < leftPrices[leftLowIdx] &&
    rightRsi[rightLowIdx] > leftRsi[leftLowIdx];
  const bearish =
    rightPrices[rightHighIdx] > leftPrices[leftHighIdx] &&
    rightRsi[rightHighIdx] < leftRsi[leftHighIdx];

  if (bullish && !bearish) return "bullish";
  if (bearish && !bullish) return "bearish";
  return null;
}

/**
 * Streak in "H1-equivalent" candles. Segments the window into `candles`
 * buckets, counts trailing consecutive same-direction closes.
 * Returns {dir: 1|-1|0, count}.
 */
export function h1Streak(
  ticks: RawTick[], window = 600, candles = 4,
): { dir: 1 | -1 | 0; count: number } {
  if (ticks.length < window) return { dir: 0, count: 0 };
  const w = ticks.slice(-window);
  const size = Math.floor(w.length / candles);
  if (size < 2) return { dir: 0, count: 0 };
  const closes: number[] = [];
  for (let i = 0; i < candles; i++) closes.push(w[(i + 1) * size - 1].quote);
  let count = 0, dir: 1 | -1 | 0 = 0;
  for (let i = closes.length - 1; i >= 1; i--) {
    const d = closes[i] - closes[i - 1];
    const cur: 1 | -1 | 0 = d > 0 ? 1 : d < 0 ? -1 : 0;
    if (dir === 0 && cur !== 0) { dir = cur; count = 1; }
    else if (cur === dir) count++;
    else break;
  }
  return { dir, count };
}

/**
 * M5 exhaustion: short-window RSI extreme plus a nascent reversal (last
 * short-window tick moves against the RSI-implied stretch).
 */
export function m5Exhaustion(
  ticks: RawTick[], window = 30, rsiPeriod = 14, hi = 75, lo = 25,
): "buy" | "sell" | null {
  if (ticks.length < window + 1) return null;
  const w = ticks.slice(-window);
  const prices = w.map(t => t.quote);
  const r = rsi(prices, rsiPeriod);
  const last = prices[prices.length - 1];
  const prev = prices[prices.length - 2];
  if (r >= hi && last < prev) return "sell";
  if (r <= lo && last > prev) return "buy";
  return null;
}

/** Distance to N-window extreme, as a fraction of the window range. */
export function nearExtreme(
  ticks: RawTick[], window = 600, band = 0.05,
): "high" | "low" | null {
  if (ticks.length < window) return null;
  const w = ticks.slice(-window).map(t => t.quote);
  const hi = Math.max(...w), lo = Math.min(...w);
  if (hi === lo) return null;
  const last = w[w.length - 1];
  const pos = (last - lo) / (hi - lo);
  if (pos >= 1 - band) return "high";
  if (pos <= band) return "low";
  return null;
}
