/** Portfolio risk: volatility, beta, drawdowns, concentration, correlation, stress. */
import { beta, correlation, dailyReturns, drawdown, mean, stdev } from "./indicators";

export const RISK_FREE = 0.04;

export interface RiskStats {
  volatility: number;
  beta: number;
  sharpe: number;
  sortino: number;
  maxDrawdown: number;
  currentDrawdown: number;
  bestDay: number;
  worstDay: number;
}

/** `index` is a time-weighted index (deposit-free), aligned with `bench`. */
export function riskStats(index: number[], bench: number[]): RiskStats {
  const r = dailyReturns(index);
  const m = dailyReturns(bench).slice(-r.length);
  const vol = stdev(r) * Math.sqrt(252);
  const annRet = mean(r) * 252;
  const downside = Math.sqrt(mean(r.map((x) => Math.min(x, 0) ** 2))) * Math.sqrt(252);
  const dd = drawdown(index);
  return {
    volatility: vol,
    beta: beta(r, m),
    sharpe: vol > 0 ? (annRet - RISK_FREE) / vol : 0,
    sortino: downside > 0 ? (annRet - RISK_FREE) / downside : 0,
    maxDrawdown: dd.maxDrawdown,
    currentDrawdown: dd.current,
    bestDay: r.length ? Math.max(...r) : 0,
    worstDay: r.length ? Math.min(...r) : 0,
  };
}

export interface Concentration {
  hhi: number;
  effectiveN: number;
  top1: number;
  top5: number;
  top10: number;
}

export function concentration(weights: number[]): Concentration {
  const w = [...weights].sort((a, b) => b - a);
  const total = w.reduce((s, x) => s + x, 0) || 1;
  const norm = w.map((x) => x / total);
  const hhi = norm.reduce((s, x) => s + x * x, 0);
  const sum = (k: number) => norm.slice(0, k).reduce((s, x) => s + x, 0);
  return { hhi, effectiveN: hhi > 0 ? 1 / hhi : 0, top1: sum(1), top5: sum(5), top10: sum(10) };
}

export function correlationMatrix(series: { symbol: string; closes: number[] }[], lookback = 126) {
  const rets = series.map((s) => dailyReturns(s.closes.slice(-lookback - 1)));
  const matrix = rets.map((a) => rets.map((b) => correlation(a, b)));
  let sum = 0;
  let cnt = 0;
  for (let i = 0; i < matrix.length; i++)
    for (let j = i + 1; j < matrix.length; j++) {
      sum += matrix[i][j];
      cnt++;
    }
  return { symbols: series.map((s) => s.symbol), matrix, avgPairwise: cnt ? sum / cnt : 0 };
}

export interface StressRow {
  label: string;
  shock: number;
  impact: number; // $
  impactPct: number; // of portfolio
}

export function marketStress(holdings: { value: number; beta: number }[], total: number, shocks = [-0.1, -0.2, -0.3]): StressRow[] {
  const exposure = holdings.reduce((s, h) => s + h.value * h.beta, 0);
  return shocks.map((shock) => ({
    label: `Market ${Math.round(shock * 100)}%`,
    shock,
    impact: exposure * shock,
    impactPct: total > 0 ? (exposure * shock) / total : 0,
  }));
}

export function portfolioBeta(holdings: { value: number; beta: number }[], total: number): number {
  return total > 0 ? holdings.reduce((s, h) => s + h.value * h.beta, 0) / total : 0;
}
