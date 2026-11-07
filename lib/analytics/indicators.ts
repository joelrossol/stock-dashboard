/** Pure technical indicators. Inputs are oldest → newest. */

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

export function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) ** 2;
  return Math.sqrt(s / (xs.length - 1));
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** Simple moving average, aligned to input (null until enough data). */
export function sma(values: number[], n: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= n) sum -= values[i - n];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

export function lastSma(values: number[], n: number, offset = 0): number | null {
  const end = values.length - offset;
  if (end < n) return null;
  return mean(values.slice(end - n, end));
}

/** Wilder's RSI on the full series; returns the latest value. */
export function rsi(closes: number[], n = 14): number | null {
  if (closes.length <= n) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= n; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / n;
  let avgLoss = loss / n;
  for (let i = n + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (n - 1) + Math.max(d, 0)) / n;
    avgLoss = (avgLoss * (n - 1) + Math.max(-d, 0)) / n;
  }
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/** Return over the last n periods as a fraction. */
export function pctReturn(closes: number[], n: number): number | null {
  if (closes.length <= n) return null;
  const a = closes[closes.length - 1 - n];
  return a > 0 ? closes[closes.length - 1] / a - 1 : null;
}

export interface Trend {
  slopePerDay: number; // log-price slope
  annualized: number; // e^(slope·252) − 1
  r2: number; // 0..1, consistency of the trend
}

/** Least-squares fit of log(price) over the last n closes. */
export function logTrend(closes: number[], n: number): Trend | null {
  if (closes.length < n || n < 3) return null;
  const ys = closes.slice(-n).map((c) => Math.log(c));
  const xm = (n - 1) / 2;
  const ym = mean(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = i - xm;
    const dy = ys[i] - ym;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  const slope = sxy / sxx;
  const r2 = syy === 0 ? 1 : (sxy * sxy) / (sxx * syy);
  return { slopePerDay: slope, annualized: Math.exp(slope * 252) - 1, r2 };
}

export function dailyReturns(closes: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) out.push(closes[i] / closes[i - 1] - 1);
  return out;
}

export function consecutiveDown(closes: number[]): number {
  let n = 0;
  for (let i = closes.length - 1; i > 0; i--) {
    if (closes[i] < closes[i - 1]) n++;
    else break;
  }
  return n;
}

export function consecutiveUp(closes: number[]): number {
  let n = 0;
  for (let i = closes.length - 1; i > 0; i--) {
    if (closes[i] > closes[i - 1]) n++;
    else break;
  }
  return n;
}

/** Share of the last n sessions that closed down. */
export function downShare(closes: number[], n = 10): number {
  const r = dailyReturns(closes).slice(-n);
  if (r.length === 0) return 0;
  return r.filter((x) => x < 0).length / r.length;
}

/** Today's move measured in this stock's usual daily moves. */
export function moveZ(closes: number[], lookback = 60): number | null {
  const r = dailyReturns(closes);
  if (r.length < lookback + 1) return null;
  const sd = stdev(r.slice(-lookback - 1, -1));
  return sd > 0 ? r[r.length - 1] / sd : null;
}

/** Latest volume vs the average of the n sessions before it. */
export function volumeRatio(volumes: number[], n = 20): number | null {
  if (volumes.length < n + 1) return null;
  const avg = mean(volumes.slice(-n - 1, -1));
  return avg > 0 ? volumes[volumes.length - 1] / avg : null;
}

export interface CrossEvent {
  kind: "golden" | "death";
  daysAgo: number;
}

/** Most recent 50/200 (or fast/slow) crossover within `within` sessions. */
export function recentCross(closes: number[], fast = 50, slow = 200, within = 20): CrossEvent | null {
  const f = sma(closes, fast);
  const s = sma(closes, slow);
  const last = closes.length - 1;
  for (let i = last; i > Math.max(slow, last - within); i--) {
    const a0 = f[i - 1];
    const b0 = s[i - 1];
    const a1 = f[i];
    const b1 = s[i];
    if (a0 == null || b0 == null || a1 == null || b1 == null) break;
    if (a0 <= b0 && a1 > b1) return { kind: "golden", daysAgo: last - i };
    if (a0 >= b0 && a1 < b1) return { kind: "death", daysAgo: last - i };
  }
  return null;
}

export function windowHigh(values: number[], n: number): number {
  return Math.max(...values.slice(-n));
}

export function windowLow(values: number[], n: number): number {
  return Math.min(...values.slice(-n));
}

export interface Drawdown {
  maxDrawdown: number; // ≤ 0
  peakIndex: number;
  troughIndex: number;
  current: number; // ≤ 0, from running peak
}

export function drawdown(values: number[]): Drawdown {
  let peak = values[0] ?? 0;
  let peakIdx = 0;
  let mdd = 0;
  let mddPeak = 0;
  let mddTrough = 0;
  for (let i = 0; i < values.length; i++) {
    if (values[i] > peak) {
      peak = values[i];
      peakIdx = i;
    }
    const dd = peak > 0 ? values[i] / peak - 1 : 0;
    if (dd < mdd) {
      mdd = dd;
      mddPeak = peakIdx;
      mddTrough = i;
    }
  }
  const last = values[values.length - 1] ?? 0;
  return { maxDrawdown: mdd, peakIndex: mddPeak, troughIndex: mddTrough, current: peak > 0 ? last / peak - 1 : 0 };
}

export function covariance(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const am = mean(a.slice(0, n));
  const bm = mean(b.slice(0, n));
  let s = 0;
  for (let i = 0; i < n; i++) s += (a[i] - am) * (b[i] - bm);
  return s / (n - 1);
}

export function correlation(a: number[], b: number[]): number {
  const sa = stdev(a);
  const sb = stdev(b);
  return sa > 0 && sb > 0 ? covariance(a, b) / (sa * sb) : 0;
}

export function beta(asset: number[], market: number[]): number {
  const n = Math.min(asset.length, market.length);
  const a = asset.slice(-n);
  const m = market.slice(-n);
  const v = stdev(m) ** 2;
  return v > 0 ? covariance(a, m) / v : 1;
}
