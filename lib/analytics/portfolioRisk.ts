/**
 * Where the portfolio's day-to-day swings come from.
 *
 * Risk share: each holding's contribution to portfolio variance,
 * w_i · cov(r_i, r_p) / var(r_p), so the shares add up to 100%. A holding can
 * be 12% of the money and 30% of the swings.
 *
 * Clusters: holdings that move together beyond what the market explains, so
 * together they behave like one bigger position (for example NVDA + AMD + AVGO).
 * Correlation is measured on each holding's returns after removing its S&P 500
 * beta; raw correlations mostly just rediscover "stocks follow the market".
 */
import type { Bar } from "@/lib/data/types";
import { beta, correlation, mean } from "./indicators";

export interface RiskHolding {
  symbol: string;
  weight: number; // of the whole portfolio, cash included
  /** Diversified funds are left out of clusters: they all track the market by design. */
  diversified: boolean;
}

export interface RiskShare {
  symbol: string;
  weight: number;
  share: number;
}

export interface Cluster {
  symbols: string[];
  weight: number;
  corr: number; // average pairwise correlation, market removed
}

export function alignedReturns(symbols: string[], daily: Record<string, Bar[]>, sessions: string[], window: number): Record<string, number[]> {
  const dates = sessions.slice(-(window + 1));
  const out: Record<string, number[]> = {};
  for (const s of symbols) {
    const byDate = new Map((daily[s] ?? []).map((b) => [b.date, b.close]));
    const rets: number[] = [];
    for (let i = 1; i < dates.length; i++) {
      const a = byDate.get(dates[i - 1]);
      const b = byDate.get(dates[i]);
      rets.push(a && b ? b / a - 1 : 0);
    }
    out[s] = rets;
  }
  return out;
}

export function riskShares(holdings: RiskHolding[], rets: Record<string, number[]>): RiskShare[] {
  const n = Math.min(...holdings.map((h) => rets[h.symbol]?.length ?? 0));
  if (!holdings.length || !Number.isFinite(n) || n < 20) return [];
  const port = Array.from({ length: n }, (_, i) => holdings.reduce((s, h) => s + h.weight * rets[h.symbol][i], 0));
  const pm = mean(port);
  const varP = port.reduce((s, x) => s + (x - pm) ** 2, 0);
  if (varP <= 0) return [];
  return holdings
    .map((h) => {
      const r = rets[h.symbol];
      const rm = mean(r.slice(0, n));
      let cov = 0;
      for (let i = 0; i < n; i++) cov += (r[i] - rm) * (port[i] - pm);
      return { symbol: h.symbol, weight: h.weight, share: (h.weight * cov) / varP };
    })
    .sort((a, b) => b.share - a.share);
}

/**
 * Greedy grouping: the biggest unassigned holding starts a group, then the most
 * correlated candidates join only if they clear `minCorr` with every member, so
 * a group is genuinely tight rather than chained together through one big name.
 */
export function correlatedClusters(holdings: RiskHolding[], raw: Record<string, number[]>, minCorr: number, market?: number[]): Cluster[] {
  const rets: Record<string, number[]> = {};
  for (const [s, r] of Object.entries(raw)) {
    if (!market?.length) rets[s] = r;
    else {
      const b = beta(r, market);
      rets[s] = r.map((x, i) => x - b * (market[i] ?? 0));
    }
  }
  const pool = holdings.filter((h) => !h.diversified && (rets[h.symbol]?.length ?? 0) >= 20).sort((a, b) => b.weight - a.weight);
  const used = new Set<string>();
  const out: Cluster[] = [];
  for (const seed of pool) {
    if (used.has(seed.symbol)) continue;
    const candidates = pool
      .filter((h) => h.symbol !== seed.symbol && !used.has(h.symbol))
      .map((h) => ({ h, c: correlation(rets[seed.symbol], rets[h.symbol]) }))
      .filter((x) => x.c >= minCorr)
      .sort((a, b) => b.c - a.c);
    const members = [seed];
    for (const { h } of candidates) if (members.every((m) => correlation(rets[m.symbol], rets[h.symbol]) >= minCorr)) members.push(h);
    if (members.length < 2) continue;
    for (const m of members) used.add(m.symbol);
    const pairs: number[] = [];
    for (let i = 0; i < members.length; i++) for (let j = i + 1; j < members.length; j++) pairs.push(correlation(rets[members[i].symbol], rets[members[j].symbol]));
    out.push({ symbols: members.map((m) => m.symbol), weight: members.reduce((s, m) => s + m.weight, 0), corr: mean(pairs) });
  }
  return out.sort((a, b) => b.weight - a.weight);
}
