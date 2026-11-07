/** Per-symbol metrics and the composite Trend Score. */
import { yearStart } from "@/lib/dates";
import type { Bar } from "@/lib/data/types";
import {
  sma as smaSeries,
  beta as betaOf,
  clamp,
  consecutiveDown,
  dailyReturns,
  downShare,
  lastSma,
  logTrend,
  moveZ,
  pctReturn,
  recentCross,
  rsi,
  stdev,
  volumeRatio,
  windowHigh,
  windowLow,
  type CrossEvent,
  type Trend,
} from "./indicators";

export type TrendLabel = "Strong uptrend" | "Uptrend" | "Neutral" | "Weakening" | "Downtrend";

export interface SymbolMetrics {
  symbol: string;
  last: number;
  ret1d: number;
  ret5d: number | null;
  ret1m: number | null;
  ret3m: number | null;
  ret6m: number | null;
  retYtd: number | null;
  ret1y: number | null;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  rsi14: number | null;
  trend20: Trend | null;
  trend60: Trend | null;
  consecDown: number;
  down10: number;
  moveZ: number | null;
  volRatio: number | null;
  high52: number;
  low52: number;
  offHigh52: number;
  high20: number;
  offHigh20: number;
  newHigh52: boolean;
  /** Sessions since the close broke below the 200-day average (null if not below, or not recent). */
  freshBelow200: number | null;
  rs1m: number | null;
  rs3m: number | null;
  cross: CrossEvent | null;
  beta1y: number;
  vol1y: number;
  trendScore: number;
  trendLabel: TrendLabel;
  scoreParts: { trend: number; averages: number; relative: number; drawdown: number };
}

export function trendLabel(score: number): TrendLabel {
  if (score >= 50) return "Strong uptrend";
  if (score >= 20) return "Uptrend";
  if (score > -20) return "Neutral";
  if (score > -50) return "Weakening";
  return "Downtrend";
}

export function ytdReturn(bars: Bar[], asOf: string): number | null {
  const ys = yearStart(asOf);
  let base: number | null = null;
  for (const b of bars) {
    if (b.date < ys) base = b.close;
    else break;
  }
  const last = bars.at(-1)?.close;
  return base && last ? last / base - 1 : null;
}

export function computeMetrics(symbol: string, bars: Bar[], spyBars: Bar[], asOf: string, crossWithin = 20): SymbolMetrics {
  const closes = bars.map((b) => b.close);
  const volumes = bars.map((b) => b.volume);
  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);
  const spy = spyBars.map((b) => b.close);
  const last = closes.at(-1) ?? 0;

  const ret1m = pctReturn(closes, 21);
  const ret3m = pctReturn(closes, 63);
  const spy1m = pctReturn(spy, 21);
  const spy3m = pctReturn(spy, 63);
  const rs1m = ret1m != null && spy1m != null ? ret1m - spy1m : null;
  const rs3m = ret3m != null && spy3m != null ? ret3m - spy3m : null;

  const sma50 = lastSma(closes, 50);
  const sma200 = lastSma(closes, 200);
  const trend60 = logTrend(closes, 60);
  const high52 = windowHigh(highs, 252);
  const offHigh52 = high52 > 0 ? last / high52 - 1 : 0;
  const high20 = windowHigh(closes, 20);

  const r = dailyReturns(closes).slice(-252);
  const m = dailyReturns(spy).slice(-252);

  const sTrend = trend60 ? clamp(trend60.annualized / 0.6, -1, 1) * trend60.r2 : 0;
  const sAvg = (sma50 != null ? (last > sma50 ? 0.5 : -0.5) : 0) + (sma200 != null ? (last > sma200 ? 0.5 : -0.5) : 0);
  const sRel = rs3m != null ? clamp(rs3m / 0.15, -1, 1) : 0;
  const sDd = clamp(1 + offHigh52 / 0.15, -1, 1);
  const score = Math.round(100 * (0.35 * sTrend + 0.25 * sAvg + 0.2 * sRel + 0.2 * sDd));

  return {
    symbol,
    last,
    ret1d: pctReturn(closes, 1) ?? 0,
    ret5d: pctReturn(closes, 5),
    ret1m,
    ret3m,
    ret6m: pctReturn(closes, 126),
    retYtd: ytdReturn(bars, asOf),
    ret1y: pctReturn(closes, 252),
    sma20: lastSma(closes, 20),
    sma50,
    sma200,
    rsi14: rsi(closes),
    trend20: logTrend(closes, 20),
    trend60,
    consecDown: consecutiveDown(closes),
    down10: downShare(closes, 10),
    moveZ: moveZ(closes),
    volRatio: volumeRatio(volumes),
    high52,
    low52: windowLow(lows, 252),
    offHigh52,
    high20,
    offHigh20: high20 > 0 ? last / high20 - 1 : 0,
    newHigh52: closes.length > 2 && last >= windowHigh(closes.slice(0, -1), 251),
    freshBelow200: freshBreak(closes, crossWithin),
    rs1m,
    rs3m,
    cross: recentCross(closes, 50, 200, crossWithin),
    beta1y: betaOf(r, m),
    vol1y: stdev(r) * Math.sqrt(252),
    trendScore: score,
    trendLabel: trendLabel(score),
    scoreParts: { trend: sTrend, averages: sAvg, relative: sRel, drawdown: sDd },
  };
}

/** Sessions since price closed below its 200-day average, if that happened within `within` sessions. */
function freshBreak(closes: number[], within: number): number | null {
  const s = smaSeries(closes, 200);
  const last = closes.length - 1;
  if (s[last] == null || closes[last] >= (s[last] as number)) return null;
  for (let k = 0; k < within && last - k - 1 >= 0; k++) {
    const i = last - k;
    const prev = s[i - 1];
    if (prev != null && closes[i - 1] >= prev && closes[i] < (s[i] as number)) return k;
  }
  return null;
}
